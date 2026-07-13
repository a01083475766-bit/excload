/**
 * 택배 업로드 양식 — localStorage 저장/로드 (ORDER_CONVERT_KEYS 공유)
 * 쇼핑몰주문연동 허브·택배주문변환이 같은 키를 씁니다.
 */

import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import {
  ORDER_CONVERT_KEYS,
  readLocalStorageWithLegacyMigrate,
  removeLocalStorageForUser,
  writeLocalStorageForUser,
} from '@/app/lib/scoped-local-storage';

export type CourierUploadHeader = {
  name: string;
  index: number;
  isEmpty: boolean;
  isFixed?: boolean;
  fixedType?: 'sender_name' | 'sender_phone' | 'sender_address';
};

export type CourierUploadTemplate = {
  courierType: string | null;
  headers: CourierUploadHeader[];
  requiresSender?: boolean;
};

export type RecentExcelFormat = {
  id: string;
  createdAt: string;
  columnOrder: string[];
  displayName?: string;
  bridgeFile?: TemplateBridgeFile;
  protectedFromDeletion?: boolean;
};

export function isSenderColumn(headerName: string): boolean {
  const normalized = headerName.toLowerCase().trim();
  const senderKeywords = ['보내는사람', '송화인', '발송인', '출고자'];
  return senderKeywords.some((keyword) => normalized.includes(keyword));
}

export function isValidCourierTemplate(template: CourierUploadTemplate | null): boolean {
  if (template === null) return false;
  if (!Array.isArray(template.headers) || template.headers.length === 0) return false;
  return template.headers.some((header) => header.name && header.name.trim() !== '');
}

export function templateFromColumnOrder(columnOrder: string[]): CourierUploadTemplate {
  const headers: CourierUploadHeader[] = columnOrder.map((name, index) => ({
    name: name || '',
    index,
    isEmpty: !name || name.trim() === '',
  }));
  return {
    courierType: null,
    headers,
    requiresSender: headers.some((header) => !header.isEmpty && isSenderColumn(header.name)),
  };
}

export function templateFromBridge(bridgeFile: TemplateBridgeFile): CourierUploadTemplate {
  return templateFromColumnOrder(bridgeFile.courierHeaders ?? []);
}

export function extractNonEmptyHeaderNames(template: CourierUploadTemplate | null): string[] {
  if (!template || !Array.isArray(template.headers)) return [];
  return template.headers
    .filter((header) => !header.isEmpty && header.name.trim() !== '')
    .map((header) => header.name);
}

export function loadCourierUploadTemplate(userId: string | null): CourierUploadTemplate | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.template, userId);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as CourierUploadTemplate;
    return isValidCourierTemplate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCourierUploadTemplate(
  template: CourierUploadTemplate | null,
  userId: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    if (template) {
      writeLocalStorageForUser(ORDER_CONVERT_KEYS.template, userId, JSON.stringify(template));
    } else {
      removeLocalStorageForUser(ORDER_CONVERT_KEYS.template, userId);
    }
  } catch (error) {
    console.error('localStorage에 택배 양식 정보를 저장하는 중 오류 발생:', error);
  }
}

export function loadRecentExcelFormats(userId: string | null): RecentExcelFormat[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.recentFormats, userId);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as RecentExcelFormat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentExcelFormatsList(
  formats: RecentExcelFormat[],
  userId: string | null,
): void {
  writeLocalStorageForUser(ORDER_CONVERT_KEYS.recentFormats, userId, JSON.stringify(formats));
}

export function saveRecentExcelFormat(input: {
  template: CourierUploadTemplate;
  userId: string | null;
  bridgeFile?: TemplateBridgeFile;
  displayName?: string;
  protectedFromDeletion?: boolean;
  formatId?: string;
}): string | null {
  try {
    let formats = loadRecentExcelFormats(input.userId);
    const columnOrder = Array.isArray(input.template.headers)
      ? input.template.headers.map((header) => header.name)
      : [];

    if (input.formatId) {
      formats = formats.filter((format) => format.id !== input.formatId);
    }

    const newFormat: RecentExcelFormat = {
      id: input.formatId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      createdAt: new Date().toISOString(),
      columnOrder,
      bridgeFile: input.bridgeFile,
      ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
      ...(input.protectedFromDeletion ? { protectedFromDeletion: true } : {}),
    };

    const updatedFormats = [newFormat, ...formats];
    saveRecentExcelFormatsList(updatedFormats, input.userId);
    return newFormat.id;
  } catch (error) {
    console.error('localStorage에 최근 사용 엑셀 양식을 저장하는 중 오류 발생:', error);
    return null;
  }
}

export function saveActiveBridgeFile(
  bridgeFile: TemplateBridgeFile | null,
  userId: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    if (bridgeFile) {
      writeLocalStorageForUser(ORDER_CONVERT_KEYS.bridge, userId, JSON.stringify(bridgeFile));
    } else {
      removeLocalStorageForUser(ORDER_CONVERT_KEYS.bridge, userId);
    }
  } catch (error) {
    console.error('localStorage에 bridgeFile을 저장하는 중 오류 발생:', error);
  }
}

export function applyFormatAsActive(
  format: RecentExcelFormat,
  userId: string | null,
): { template: CourierUploadTemplate; bridgeFile: TemplateBridgeFile | null } {
  const template = templateFromColumnOrder(format.columnOrder ?? []);
  saveCourierUploadTemplate(template, userId);
  const bridgeFile = format.bridgeFile
    ? (JSON.parse(JSON.stringify(format.bridgeFile)) as TemplateBridgeFile)
    : null;
  if (bridgeFile) {
    saveActiveBridgeFile(bridgeFile, userId);
  }
  return { template, bridgeFile };
}

export function matchFormatIdByTemplate(
  formats: RecentExcelFormat[],
  template: CourierUploadTemplate | null,
): string | null {
  if (!template || !Array.isArray(template.headers)) return null;
  const currentHeaders = extractNonEmptyHeaderNames(template);
  const matched = formats.find((format) => {
    const formatHeaders = format.columnOrder || [];
    if (currentHeaders.length !== formatHeaders.length) return false;
    return currentHeaders.every((header, index) => header === formatHeaders[index]);
  });
  return matched?.id ?? null;
}

export function updateFormatDisplayName(
  formatId: string,
  displayName: string,
  userId: string | null,
): RecentExcelFormat[] {
  const formats = loadRecentExcelFormats(userId);
  const updated = formats.map((format) =>
    format.id === formatId
      ? { ...format, displayName: displayName.trim() || undefined }
      : format,
  );
  saveRecentExcelFormatsList(updated, userId);
  return updated;
}
