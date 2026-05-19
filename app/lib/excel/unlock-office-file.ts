import * as XLSX from 'xlsx';
import {
  ExcelUnsupportedProtectedError,
  ExcelWrongPasswordError,
  type ProtectedFileKind,
} from '@/app/lib/excel/protected-file-types';

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** SheetJS로 읽을 수 있는지 빠르게 확인 */
export function canReadExcelWithSheetJs(buffer: ArrayBuffer): boolean {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    if (!workbook.SheetNames?.length) return false;
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return false;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export function isZipFileName(fileName: string): boolean {
  return fileName.split('.').pop()?.toLowerCase() === 'zip';
}

export function isExcelFileName(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'xlsx' || ext === 'xls';
}

/** office-crypto 동적 로드 (클라이언트 전용) */
async function loadOfficeCrypto() {
  return import('office-crypto');
}

/** 암호화된 Office 파일인지 (xlsx/xls/doc 등) */
export async function detectOfficeEncryption(buffer: ArrayBuffer): Promise<boolean> {
  const { isEncrypted } = await loadOfficeCrypto();
  return isEncrypted(toUint8Array(buffer));
}

/** 브라우저에서 비밀번호로 Office 파일 복호화 (비밀번호는 메모리에서만 사용) */
export async function decryptOfficeFileInBrowser(
  buffer: ArrayBuffer,
  password: string,
): Promise<ArrayBuffer> {
  const { OfficeFile, InvalidKeyError, DecryptionError } = await loadOfficeCrypto();
  const bytes = toUint8Array(buffer);

  try {
    const officeFile = OfficeFile(bytes);
    if (!officeFile.isEncrypted()) {
      return buffer;
    }
    officeFile.loadKey({ password, verifyPassword: true });
    const decrypted = officeFile.decrypt();
    return toArrayBuffer(decrypted);
  } catch (error) {
    if (error instanceof InvalidKeyError) {
      throw new ExcelWrongPasswordError();
    }
    if (error instanceof DecryptionError) {
      throw new ExcelWrongPasswordError();
    }
    throw error;
  }
}

export type ZipInspectResult =
  | { status: 'ok'; needsPassword: boolean }
  | { status: 'error'; message: string };

export type ZipDecryptResult =
  | { status: 'ok'; buffer: ArrayBuffer; innerFileName: string }
  | { status: 'wrong_password' }
  | { status: 'error'; message: string };

async function postProtectedZipForm(
  file: File,
  fields: Record<string, string>,
): Promise<Response> {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return fetch('/api/excel/protected-file', {
    method: 'POST',
    body: form,
  });
}

export async function inspectZipFile(file: File): Promise<ZipInspectResult> {
  const res = await postProtectedZipForm(file, { action: 'inspect' });
  const data = (await res.json()) as ZipInspectResult & { needsPassword?: boolean };
  if (!res.ok) {
    return {
      status: 'error',
      message:
        (data as { message?: string }).message ??
        'ZIP 파일을 확인할 수 없습니다.',
    };
  }
  return { status: 'ok', needsPassword: Boolean(data.needsPassword) };
}

export async function decryptZipFile(
  file: File,
  password: string,
): Promise<ZipDecryptResult> {
  const res = await postProtectedZipForm(file, { action: 'decrypt', password });
  if (res.status === 401) {
    return { status: 'wrong_password' };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      status: 'error',
      message: data.message ?? 'ZIP 파일을 열 수 없습니다.',
    };
  }
  const innerFileName = res.headers.get('X-Inner-File-Name') ?? 'order.xlsx';
  const buffer = await res.arrayBuffer();
  return { status: 'ok', buffer, innerFileName };
}

export type ExcelUnlockProbe =
  | { action: 'use_plain'; buffer: ArrayBuffer }
  | { action: 'need_password'; kind: ProtectedFileKind; buffer: ArrayBuffer }
  | { action: 'unsupported'; message: string };

/**
 * 파일 1차 판별: 그대로 사용 / 비밀번호 필요 / 지원 불가
 * (비밀번호 입력·복호화는 호출 측 모달에서 수행)
 */
export async function probeExcelUploadFile(file: File): Promise<ExcelUnlockProbe> {
  if (isZipFileName(file.name)) {
    const inspect = await inspectZipFile(file);
    if (inspect.status === 'error') {
      return { action: 'unsupported', message: inspect.message };
    }
    if (inspect.needsPassword) {
      return { action: 'need_password', kind: 'zip', buffer: await file.arrayBuffer() };
    }
    const decrypted = await decryptZipFile(file, '\0');
    if (decrypted.status === 'wrong_password') {
      return { action: 'need_password', kind: 'zip', buffer: await file.arrayBuffer() };
    }
    if (decrypted.status === 'ok') {
      if (canReadExcelWithSheetJs(decrypted.buffer)) {
        return { action: 'use_plain', buffer: decrypted.buffer };
      }
      return {
        action: 'unsupported',
        message: 'ZIP 안에 읽을 수 있는 엑셀 파일이 없습니다. 압축을 푼 뒤 .xlsx 파일을 올려 주세요.',
      };
    }
    return {
      action: 'unsupported',
      message: decrypted.message ?? 'ZIP 파일을 열 수 없습니다.',
    };
  }

  if (!isExcelFileName(file.name)) {
    return {
      action: 'unsupported',
      message: '엑셀(.xlsx, .xls) 또는 암호 ZIP 파일만 지원합니다.',
    };
  }

  const buffer = await file.arrayBuffer();

  if (canReadExcelWithSheetJs(buffer)) {
    return { action: 'use_plain', buffer };
  }

  let encrypted = false;
  try {
    encrypted = await detectOfficeEncryption(buffer);
  } catch {
    return {
      action: 'unsupported',
      message: new ExcelUnsupportedProtectedError().message,
    };
  }

  if (encrypted) {
    return { action: 'need_password', kind: 'excel', buffer };
  }

  return {
    action: 'unsupported',
    message: new ExcelUnsupportedProtectedError().message,
  };
}

export async function decryptUploadedExcelFile(
  buffer: ArrayBuffer,
  kind: ProtectedFileKind,
  password: string,
  zipSourceFile?: File,
): Promise<ArrayBuffer> {
  if (kind === 'zip') {
    if (!zipSourceFile) {
      throw new ExcelUnsupportedProtectedError('ZIP 파일 정보가 없습니다.');
    }
    const result = await decryptZipFile(zipSourceFile, password);
    if (result.status === 'wrong_password') {
      throw new ExcelWrongPasswordError();
    }
    if (result.status !== 'ok') {
      throw new ExcelUnsupportedProtectedError(result.message);
    }
    if (!canReadExcelWithSheetJs(result.buffer)) {
      throw new ExcelUnsupportedProtectedError(
        'ZIP 안의 엑셀을 읽을 수 없습니다. Excel에서 일반 .xlsx로 저장한 뒤 다시 올려 주세요.',
      );
    }
    return result.buffer;
  }

  const decrypted = await decryptOfficeFileInBrowser(buffer, password);
  if (!canReadExcelWithSheetJs(decrypted)) {
    throw new ExcelUnsupportedProtectedError();
  }
  return decrypted;
}
