'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileLock2, RotateCcw, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';

type SheetData = {
  name: string;
  rows: string[][];
};

type ColumnInfo = {
  index: number;
  label: string;
};

type MaskMode =
  | 'name'
  | 'phone'
  | 'address'
  | 'email'
  | 'last4'
  | 'first3'
  | 'all'
  | 'pccc'
  | 'custom';

type AddressLevel = 'normal' | 'light' | 'strong';

type ColumnSetting = {
  selected: boolean;
  mode: MaskMode;
  addressLevel: AddressLevel;
  customPrefix: string;
  customSuffix: string;
  customMaskChar: string;
  recommended: boolean;
  candidateOnly?: boolean;
};

type ProcessResult = {
  totalRows: number;
  selectedColumnCount: number;
  changedCellCount: number;
  blankCellCount: number;
  errorCellCount: number;
  processedRows: string[][];
};

type PreviewMode = 'masked-only' | 'all';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_DATA_ROWS = 30000;
const MAX_PREVIEW_ROWS = 100;
const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'csv'];

const exampleRows = [
  ['주문번호', '주문자명', '주문자 연락처', '수취인명', '수취인 연락처', '배송지주소', '주문자 이메일', '개인통관고유부호', '상품명'],
  ['20260625-12345678', '홍길동', '010-1234-5678', '김영희', '032-123-4567', '인천광역시 미추홀구 주안동 123-4 101호', 'seller123@email.com', 'P123456789012', '참치'],
  ['20260625-22345678', '박민수', '01022223333', '이수진', '010-7777-8888', '서울특별시 강남구 테헤란로 123 101호', 'buyer2@email.com', 'P987654321098', '연어'],
  ['20260625-32345678', '최유리', '010 5555 6666', '최유리', '01055556666', '부산광역시 해운대구 센텀로 25', 'user@example.com', 'P111122223333', '초밥'],
  ['20260625-42345678', '김철', '02-123-4567', '남궁민수', '010-8888-9999', '대전광역시 서구 둔산동 1-2', 'a@email.com', 'P444455556666', '광어'],
];

const maskModes: { value: MaskMode; label: string }[] = [
  { value: 'name', label: '이름' },
  { value: 'phone', label: '전화번호' },
  { value: 'address', label: '주소' },
  { value: 'email', label: '이메일' },
  { value: 'last4', label: '뒤 4자리만 표시' },
  { value: 'first3', label: '앞 3자리만 표시' },
  { value: 'all', label: '전체 가리기' },
  { value: 'pccc', label: '개인통관고유부호' },
  { value: 'custom', label: '직접 설정' },
];

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizeCell(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || '주문파일';
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024)).toLocaleString('ko-KR')}KB`;
}

function rowHasValue(row: string[]) {
  return row.some((cell) => normalizeCell(cell) !== '');
}

function makeUniqueColumns(headerRow: string[]) {
  const used = new Map<string, number>();

  return headerRow.map((cell, index) => {
    const raw = normalizeCell(cell) || `열 ${index + 1}`;
    const count = used.get(raw) ?? 0;
    used.set(raw, count + 1);
    return {
      index,
      label: count === 0 ? raw : `${raw} (${count + 1})`,
    };
  });
}

function detectHeaderRow(rows: string[][]) {
  const keywords = ['주문번호', '수취인', '받는분', '연락처', '전화번호', '주소', '배송지', '이메일', '상품명'];
  let fallback = 0;

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const row = rows[index] ?? [];
    const nonEmptyCount = row.filter((cell) => normalizeCell(cell) !== '').length;
    if (nonEmptyCount >= 2 && fallback === 0) fallback = index;

    const joined = normalizeLabel(row.join(' '));
    if (nonEmptyCount >= 2 && keywords.some((keyword) => joined.includes(normalizeLabel(keyword)))) {
      return index;
    }
  }

  return fallback;
}

function getDataRows(rows: string[][], headerRowIndex: number) {
  return rows.slice(headerRowIndex + 1).filter(rowHasValue);
}

function recommendMode(label: string): { mode: MaskMode; selected: boolean; candidateOnly?: boolean } {
  const normalized = normalizeLabel(label);

  if (/개인통관|통관번호|pccc/.test(normalized)) return { mode: 'pccc', selected: true };
  if (/이메일|email|e-mail/.test(normalized)) return { mode: 'email', selected: true };
  if (/연락처|전화|휴대폰|휴대전화/.test(normalized)) return { mode: 'phone', selected: true };
  if (/주소|배송지|도로명|지번/.test(normalized)) return { mode: 'address', selected: true };
  if (/이름|주문자명|구매자명|수취인|수취인명|받는분|수령인|배송받는분/.test(normalized)) {
    return { mode: 'name', selected: true };
  }
  if (/주문번호|상품주문번호|주문id|결제번호|orderno|orderid/.test(normalized)) {
    return { mode: 'last4', selected: false, candidateOnly: true };
  }

  return { mode: 'custom', selected: false };
}

function createDefaultSettings(columns: ColumnInfo[]) {
  const settings: Record<number, ColumnSetting> = {};

  columns.forEach((column) => {
    const recommendation = recommendMode(column.label);
    settings[column.index] = {
      selected: recommendation.selected,
      mode: recommendation.mode,
      addressLevel: 'normal',
      customPrefix: '1',
      customSuffix: '1',
      customMaskChar: '*',
      recommended: recommendation.selected,
      candidateOnly: recommendation.candidateOnly,
    };
  });

  return settings;
}

function maskMiddle(value: string, prefixCount: number, suffixCount: number, maskChar: string) {
  const text = normalizeCell(value);
  if (!text) return '';
  const safeMask = maskChar.slice(0, 1) || '*';
  const chars = Array.from(text);

  if (prefixCount + suffixCount >= chars.length) {
    if (chars.length === 1) return safeMask;
    prefixCount = Math.min(prefixCount, chars.length - 1);
    suffixCount = Math.max(0, chars.length - prefixCount - 1);
  }

  const prefix = chars.slice(0, prefixCount).join('');
  const suffix = suffixCount > 0 ? chars.slice(chars.length - suffixCount).join('') : '';
  const maskedLength = Math.max(1, chars.length - prefixCount - suffixCount);
  return `${prefix}${safeMask.repeat(maskedLength)}${suffix}`;
}

function maskName(value: string) {
  return maskMiddle(value, 1, Array.from(normalizeCell(value)).length >= 3 ? 1 : 0, '○');
}

function maskPhone(value: string) {
  const text = normalizeCell(value);
  if (!text) return '';
  let digitIndex = 0;
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(text.length);
  const keepStart = digits.length >= 10 ? 3 : Math.max(0, digits.length - 4);
  const keepEndStart = Math.max(keepStart, digits.length - 4);

  return Array.from(text)
    .map((char) => {
      if (!/\d/.test(char)) return char;
      const current = digitIndex;
      digitIndex += 1;
      return current < keepStart || current >= keepEndStart ? char : '*';
    })
    .join('');
}

function maskAddress(value: string, level: AddressLevel) {
  const text = normalizeCell(value);
  if (!text) return '';
  const parts = text.split(' ').filter(Boolean);
  if (parts.length <= 1) return `${parts[0] ?? ''} ****`.trim();
  if (level === 'strong') return `${parts[0]} ****`;
  if (level === 'light') return `${parts.slice(0, Math.min(parts.length, 4)).join(' ')} ****`;
  return `${parts.slice(0, Math.min(parts.length, 2)).join(' ')} ****`;
}

function maskEmail(value: string) {
  const text = normalizeCell(value);
  if (!text) return '';
  const atIndex = text.indexOf('@');
  if (atIndex <= 0) return maskMiddle(text, 2, 0, '*');
  const id = text.slice(0, atIndex);
  const domain = text.slice(atIndex);
  if (id.length === 1) return `*${domain}`;
  if (id.length === 2) return `${id[0]}*${domain}`;
  return `${id.slice(0, 2)}${'*'.repeat(id.length - 2)}${domain}`;
}

function maskKeepingSeparators(value: string, keepStart: number, keepEnd: number) {
  const text = normalizeCell(value);
  if (!text) return '';
  const maskableIndexes = Array.from(text)
    .map((char, index) => (/[\p{L}\p{N}]/u.test(char) ? index : -1))
    .filter((index) => index >= 0);
  const keep = new Set([
    ...maskableIndexes.slice(0, keepStart),
    ...maskableIndexes.slice(Math.max(keepStart, maskableIndexes.length - keepEnd)),
  ]);
  return Array.from(text)
    .map((char, index) => (/[\p{L}\p{N}]/u.test(char) && !keep.has(index) ? '*' : char))
    .join('');
}

function applyMask(value: string, setting: ColumnSetting) {
  switch (setting.mode) {
    case 'name':
      return maskName(value);
    case 'phone':
      return maskPhone(value);
    case 'address':
      return maskAddress(value, setting.addressLevel);
    case 'email':
      return maskEmail(value);
    case 'last4':
      return maskKeepingSeparators(value, 0, 4);
    case 'first3':
      return maskKeepingSeparators(value, 3, 0);
    case 'all':
      return maskKeepingSeparators(value, 0, 0);
    case 'pccc':
      return maskMiddle(value, 1, 0, '*');
    case 'custom':
      return maskMiddle(
        value,
        Math.max(0, Number(setting.customPrefix) || 0),
        Math.max(0, Number(setting.customSuffix) || 0),
        setting.customMaskChar,
      );
    default:
      return value;
  }
}

function createWorkbookAndDownload(rows: Record<string, string>[], fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '개인정보가림');
  XLSX.writeFile(workbook, fileName);
}

export function PrivacyMask() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [baseName, setBaseName] = useState('주문파일');
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [settings, setSettings] = useState<Record<number, ColumnSetting>>({});
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('masked-only');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock({
    onUploadCancel: () => {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const activeSheet = sheets[selectedSheetIndex] ?? null;
  const columns = useMemo(
    () => (activeSheet ? makeUniqueColumns(activeSheet.rows[headerRowIndex] ?? []) : []),
    [activeSheet, headerRowIndex],
  );
  const dataRows = useMemo(
    () => (activeSheet ? getDataRows(activeSheet.rows, headerRowIndex) : []),
    [activeSheet, headerRowIndex],
  );
  const selectedColumns = columns.filter((column) => settings[column.index]?.selected);

  const resetResult = () => {
    setResult(null);
  };

  const applySettingsForColumns = (nextColumns: ColumnInfo[]) => {
    setSettings(createDefaultSettings(nextColumns));
    setPreviewMode('masked-only');
    resetResult();
  };

  const resetAll = () => {
    setFileName('');
    setFileSize(null);
    setBaseName('주문파일');
    setSheets([]);
    setSelectedSheetIndex(0);
    setHeaderRowIndex(0);
    setSettings({});
    setError(null);
    setLoading(false);
    resetResult();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyRows = (nextSheets: SheetData[], nextFileName: string, nextFileSize: number | null) => {
    if (nextSheets.length === 0) {
      setError('시트를 찾을 수 없습니다.');
      return;
    }

    const firstDataSheetIndex = Math.max(0, nextSheets.findIndex((sheet) => sheet.rows.some(rowHasValue)));
    const selectedSheet = nextSheets[firstDataSheetIndex] ?? nextSheets[0];
    const detectedHeaderIndex = detectHeaderRow(selectedSheet.rows);
    const nextColumns = makeUniqueColumns(selectedSheet.rows[detectedHeaderIndex] ?? []);

    setSheets(nextSheets);
    setSelectedSheetIndex(firstDataSheetIndex);
    setHeaderRowIndex(detectedHeaderIndex);
    setFileName(nextFileName);
    setFileSize(nextFileSize);
    setBaseName(getBaseName(nextFileName));
    setError(null);
    applySettingsForColumns(nextColumns);
  };

  const loadFile = async (file: File) => {
    const extension = getExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setError('xlsx, xls, csv 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('파일은 최대 20MB까지 업로드할 수 있습니다.');
      return;
    }

    try {
      setLoading(true);
      const buffer = extension === 'csv' ? await file.arrayBuffer() : await unlockExcelFile(file);
      const workbook = XLSX.read(buffer, { type: 'array', raw: false });
      const nextSheets = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        }),
      }));
      applyRows(nextSheets, file.name, file.size);
    } catch (error) {
      if (error instanceof ExcelUnlockCancelledError) {
        setError(null);
        return;
      }
      setError(error instanceof Error ? error.message : '파일을 읽을 수 없습니다. 암호가 설정되어 있거나 손상된 파일인지 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const loadExample = () => {
    applyRows([{ name: '예시 주문', rows: exampleRows }], '예시_개인정보가림.xlsx', null);
  };

  const handleSheetChange = (index: number) => {
    const sheet = sheets[index];
    if (!sheet) return;
    const nextHeaderIndex = detectHeaderRow(sheet.rows);
    const nextColumns = makeUniqueColumns(sheet.rows[nextHeaderIndex] ?? []);
    setSelectedSheetIndex(index);
    setHeaderRowIndex(nextHeaderIndex);
    setError(null);
    applySettingsForColumns(nextColumns);
  };

  const handleHeaderChange = (index: number) => {
    const nextColumns = makeUniqueColumns(activeSheet?.rows[index] ?? []);
    setHeaderRowIndex(index);
    setError(null);
    applySettingsForColumns(nextColumns);
  };

  const updateSetting = (columnIndex: number, patch: Partial<ColumnSetting>) => {
    setSettings((prev) => ({
      ...prev,
      [columnIndex]: {
        ...prev[columnIndex],
        ...patch,
      },
    }));
    resetResult();
  };

  const selectRecommended = () => {
    setSettings((prev) => {
      const next = { ...prev };
      columns.forEach((column) => {
        next[column.index] = { ...next[column.index], selected: next[column.index]?.recommended ?? false };
      });
      return next;
    });
    resetResult();
  };

  const selectAllColumns = () => {
    setSettings((prev) => {
      const next = { ...prev };
      columns.forEach((column) => {
        next[column.index] = { ...next[column.index], selected: true };
      });
      return next;
    });
    resetResult();
  };

  const clearSelectedColumns = () => {
    setSettings((prev) => {
      const next = { ...prev };
      columns.forEach((column) => {
        next[column.index] = { ...next[column.index], selected: false };
      });
      return next;
    });
    resetResult();
  };

  const processRows = () => {
    if (!activeSheet) {
      setError('파일을 선택하거나 드래그해서 첨부해 주세요.');
      return;
    }
    if (selectedColumns.length === 0) {
      setError('개인정보를 가릴 열을 1개 이상 선택해 주세요.');
      return;
    }
    if (dataRows.length === 0) {
      setError('처리할 데이터 행이 없습니다.');
      return;
    }
    if (dataRows.length > MAX_DATA_ROWS) {
      setError('무료 개인정보 가리기는 최대 30,000개 행까지 지원합니다.');
      return;
    }

    setLoading(true);
    try {
      let changedCellCount = 0;
      let blankCellCount = 0;
      let errorCellCount = 0;

      const processedRows = dataRows.map((row) => {
        const nextRow = [...row];
        selectedColumns.forEach((column) => {
          const original = row[column.index] ?? '';
          if (normalizeCell(original) === '') {
            blankCellCount += 1;
            return;
          }
          try {
            const masked = applyMask(original, settings[column.index]);
            nextRow[column.index] = masked;
            if (masked !== original) changedCellCount += 1;
          } catch {
            errorCellCount += 1;
          }
        });
        return nextRow;
      });

      setResult({
        totalRows: dataRows.length,
        selectedColumnCount: selectedColumns.length,
        changedCellCount,
        blankCellCount,
        errorCellCount,
        processedRows,
      });
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadMaskedFile = () => {
    if (!result) return;
    const rows = result.processedRows.map((row) => {
      const data: Record<string, string> = {};
      columns.forEach((column) => {
        data[column.label] = row[column.index] ?? '';
      });
      return data;
    });
    createWorkbookAndDownload(rows, `엑클로드_개인정보가림_${baseName}.xlsx`);
  };

  const headerOptions = activeSheet?.rows
    .slice(0, Math.min(activeSheet.rows.length, 30))
    .map((row, index) => ({ index, label: `${index + 1}행 (${row.filter((cell) => normalizeCell(cell)).length}개 열)` })) ?? [];

  const previewRows = dataRows.slice(0, MAX_PREVIEW_ROWS);
  const previewColumns = previewMode === 'masked-only' ? selectedColumns : columns;

  return (
    <>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] xl:items-start">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <FileLock2 className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">파일과 가림 설정</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              주문 엑셀에 포함된 이름, 전화번호, 주소 등의 개인정보를 가린 새 파일을 만듭니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <label
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = event.dataTransfer.files[0];
                if (file) void loadFile(file);
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-8 text-center hover:bg-blue-50"
            >
              <Upload className="size-8 text-blue-600" aria-hidden />
              <span className="mt-3 text-sm font-bold text-zinc-950">
                개인정보를 가릴 주문 엑셀 또는 CSV 파일을 선택해 주세요.
              </span>
              <span className="mt-1 text-xs text-zinc-500">xlsx, xls, csv 파일을 지원합니다.</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>

            {fileName && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 truncate font-medium text-zinc-800">
                  {fileName}
                  {fileSize !== null && <span className="ml-2 text-zinc-500">({formatFileSize(fileSize)})</span>}
                </span>
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex w-fit items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  <X className="size-3.5" aria-hidden />
                  파일 제거
                </button>
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              업로드한 파일과 개인정보는 서버로 전송되거나 저장되지 않으며 현재 브라우저에서만 처리됩니다.
            </p>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={loadExample}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              예시 데이터 불러오기
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RotateCcw className="size-4" aria-hidden />
              초기화
            </button>
          </div>

          {activeSheet && (
            <>
              {sheets.length > 1 && (
                <label className="block">
                  <span className="text-sm font-bold text-zinc-950">검사할 시트</span>
                  <select
                    value={selectedSheetIndex}
                    onChange={(event) => handleSheetChange(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                  >
                    {sheets.map((sheet, index) => (
                      <option key={sheet.name} value={index}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-sm font-bold text-zinc-950">열 제목이 있는 행</span>
                <select
                  value={headerRowIndex}
                  onChange={(event) => handleHeaderChange(Number(event.target.value))}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                >
                  {headerOptions.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-sm backdrop-blur lg:sticky lg:top-24 lg:z-10">
                <p className="text-xs leading-relaxed text-zinc-600">
                  체크박스와 가림 방식을 바꾸면 오른쪽 미리보기는 바로 반영됩니다. 다운로드할 파일은
                  현재 설정을 확인한 뒤 아래 버튼으로 생성해 주세요.
                </p>
                <button
                  type="button"
                  onClick={processRows}
                  disabled={loading}
                  className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {loading ? '처리 중...' : '현재 설정으로 다운로드 파일 만들기'}
                </button>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <p className="text-sm font-bold text-blue-950">개인정보 열 선택</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-900">
                  열 제목을 기준으로 개인정보로 보이는 항목을 자동 추천했습니다. 적용 전 선택 내용을 확인해 주세요.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectRecommended}
                    className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    추천 항목 선택
                  </button>
                  <button
                    type="button"
                    onClick={selectAllColumns}
                    className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedColumns}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                  >
                    선택 해제
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {columns.map((column) => {
                  const setting = settings[column.index];
                  const firstValue = dataRows.find((row) => normalizeCell(row[column.index]))?.[column.index] ?? '';
                  const maskedValue = setting ? applyMask(firstValue, setting) : '';

                  return (
                    <div key={column.index} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={setting?.selected ?? false}
                          onChange={(event) => updateSetting(column.index, { selected: event.target.checked })}
                          className="mt-1 size-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-950">{column.label}</span>
                            {setting?.recommended && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                추천
                              </span>
                            )}
                            {setting?.candidateOnly && (
                              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                                후보
                              </span>
                            )}
                          </span>
                        </span>
                      </label>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-medium text-zinc-600">가림 방식</span>
                          <select
                            value={setting?.mode ?? 'custom'}
                            onChange={(event) => updateSetting(column.index, { mode: event.target.value as MaskMode })}
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          >
                            {maskModes.map((mode) => (
                              <option key={mode.value} value={mode.value}>
                                {mode.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {setting?.mode === 'address' && (
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">주소 가림 강도</span>
                            <select
                              value={setting.addressLevel}
                              onChange={(event) => updateSetting(column.index, { addressLevel: event.target.value as AddressLevel })}
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="normal">보통 가리기</option>
                              <option value="light">약하게 가리기</option>
                              <option value="strong">강하게 가리기</option>
                            </select>
                          </label>
                        )}
                      </div>

                      {setting?.mode === 'custom' && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">앞 표시</span>
                            <input
                              value={setting.customPrefix}
                              onChange={(event) => updateSetting(column.index, { customPrefix: event.target.value.replace(/\D/g, '') })}
                              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">뒤 표시</span>
                            <input
                              value={setting.customSuffix}
                              onChange={(event) => updateSetting(column.index, { customSuffix: event.target.value.replace(/\D/g, '') })}
                              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">가림 문자</span>
                            <input
                              value={setting.customMaskChar}
                              maxLength={1}
                              onChange={(event) => updateSetting(column.index, { customMaskChar: event.target.value.slice(0, 1) || '*' })}
                              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                            />
                          </label>
                        </div>
                      )}

                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <p className="rounded-xl bg-white p-3 text-zinc-600">
                          원본 예시: <span className="font-semibold text-zinc-900">{firstValue || '-'}</span>
                        </p>
                        <p className="rounded-xl bg-white p-3 text-zinc-600">
                          결과 예시: <span className="font-semibold text-blue-700">{maskedValue || '-'}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={processRows}
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? '처리 중...' : '현재 설정으로 다운로드 파일 만들기'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <h3 className="text-lg font-bold text-zinc-950">미리보기·처리 결과</h3>
        <p className="mt-2 text-xs leading-relaxed text-amber-700">
          미리보기에는 원본 정보가 표시될 수 있으므로 공용 화면에서는 주의해 주세요.
        </p>

        {!activeSheet ? (
          <p className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-5 text-sm leading-relaxed text-zinc-600">
            파일을 선택하면 개인정보 열 추천과 미리보기가 표시됩니다.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {result && (
              <div
                className={`rounded-2xl border p-4 ${
                  result.errorCellCount > 0
                    ? 'border-amber-100 bg-amber-50 text-amber-900'
                    : 'border-emerald-100 bg-emerald-50 text-emerald-800'
                }`}
              >
                <p className="font-semibold">
                  {result.errorCellCount > 0
                    ? '일부 셀을 처리하지 못했습니다. 미리보기와 안내를 확인해 주세요.'
                    : '개인정보 가리기가 완료되었습니다.'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <span>전체 데이터 행: {result.totalRows.toLocaleString('ko-KR')}건</span>
                  <span>가림 적용 열: {result.selectedColumnCount.toLocaleString('ko-KR')}개</span>
                  <span>변경된 셀: {result.changedCellCount.toLocaleString('ko-KR')}개</span>
                  <span>빈 값 유지: {result.blankCellCount.toLocaleString('ko-KR')}개</span>
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPreviewMode('masked-only')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  previewMode === 'masked-only'
                    ? 'bg-blue-600 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600'
                }`}
              >
                가림 열만 보기
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('all')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  previewMode === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600'
                }`}
              >
                전체 열 보기
              </button>
            </div>

            <div className="h-[420px] max-w-full overflow-auto rounded-2xl border border-zinc-200">
              <table className="min-w-max text-left text-xs">
                <thead className="bg-zinc-100 text-zinc-700">
                  <tr>
                    <th className="px-3 py-2">원본 행</th>
                    {previewColumns.map((column) => (
                      <th key={column.index} className="px-3 py-2">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-zinc-100">
                      <td className="whitespace-nowrap px-3 py-2">원본 {headerRowIndex + 2 + rowIndex}행</td>
                      {previewColumns.map((column) => {
                        const original = row[column.index] ?? '';
                        const setting = settings[column.index];
                        const masked = setting?.selected ? applyMask(original, setting) : original;
                        return (
                          <td key={column.index} className="max-w-[220px] px-3 py-2 align-top">
                            {setting?.selected ? (
                              <div className="space-y-1">
                                <p className="truncate text-zinc-500">원본: {original}</p>
                                <p className="truncate font-semibold text-blue-700">가림: {masked}</p>
                              </div>
                            ) : (
                              <span className="truncate text-zinc-700">{original}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {previewRows.length === 0 && (
                    <tr>
                      <td colSpan={previewColumns.length + 1} className="px-3 py-8 text-center text-zinc-500">
                        표시할 행이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {result && (
              <>
                <button
                  type="button"
                  onClick={downloadMaskedFile}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Download className="size-4" aria-hidden />
                  개인정보 가린 엑셀 받기
                </button>
                <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
                  원본 파일은 변경되지 않습니다. 새로 생성되는 파일에서는 원본의 일부 서식, 수식 또는
                  병합 셀이 유지되지 않을 수 있습니다. 다운로드 후에도 개인정보가 충분히 가려졌는지
                  파일을 직접 확인해 주세요.
                </p>
              </>
            )}
          </div>
        )}
      </section>
    </div>
    {excelUnlockUi}
    </>
  );
}
