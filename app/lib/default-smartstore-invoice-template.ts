/**
 * 송장파일변환 — 스마트스토어 발송처리 필수 4열 기본 양식 시드
 */

import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import {
  readLocalStorageWithLegacyMigrate,
  writeLocalStorageForUser,
} from '@/app/lib/scoped-local-storage';
import {
  buildCourierTemplateFromHeaders,
  buildTrialBridgeFile,
} from '@/app/logistics-convert/trial-sample-formats';

/** 스마트스토어 엑셀 일괄발송 필수 4열 (순서 고정) */
export const SMARTSTORE_INVOICE_HEADERS = [
  '상품주문번호',
  '배송방법',
  '택배사',
  '송장번호',
] as const;

export const DEFAULT_SMARTSTORE_INVOICE_FORMAT_ID = 'default-smartstore-invoice-v1';
export const DEFAULT_SMARTSTORE_INVOICE_DISPLAY_NAME = '스마트스토어 발송 기본 양식';

export const INVOICE_DEFAULT_SMARTSTORE_INTRO_SUPPRESS_KEY =
  'invoiceFileConvert_default_smartstore_intro_suppress_until_v1';

/** 사용자가 기본 양식을 삭제한 경우 자동 재등록 방지 */
export const INVOICE_DEFAULT_SMARTSTORE_OPT_OUT_KEY =
  'invoiceFileConvert_default_smartstore_opt_out_v1';

/** 기본 양식 안내 모달 — 사용자가 한 번 확인하면 다시 표시하지 않음 */
export const INVOICE_DEFAULT_SMARTSTORE_INTRO_ACKNOWLEDGED_KEY =
  'invoiceFileConvert_default_smartstore_intro_acknowledged_v1';

/** 기본 양식 시드 시 배송방법 고정 입력 (배송방법 열은 기준헤더 미매핑 → 고정 입력으로 채움) */
export const DEFAULT_SMARTSTORE_FIXED_INPUT = {
  배송방법: '택배',
} as const;

export const DEFAULT_SMARTSTORE_INVOICE_INTRO_COPY = {
  modalTitle: '기본 양식으로 먼저 시작할게요',
  modalBody:
    '스마트스토어에서 많이 사용하는 기본 송장 업로드 양식으로 송장 매핑은 가능합니다.\n\n주문 파일과 송장 파일을 올리면 자동으로 주문번호와 송장번호를 맞춰 볼 수 있습니다.\n\n사용 중인 쇼핑몰의 업로드 양식이 다르다면 실제 사용하는 양식을 등록하시는 것을 권장합니다.\n\n※ 송장번호는 하이픈(-)을 자동으로 제거하여 정리됩니다.\n※ 택배사 이름은 「고정 입력 정보 설정」에서 스마트스토어에 등록된 이름과 동일하게 맞춰 주세요.',
  continueButton: '기본 양식으로 계속하기',
  registerButton: '내 양식 등록하기',
  banner:
    '스마트스토어에서 많이 사용하는 기본 송장 업로드 양식으로 설정되어 있습니다. 택배사 이름은 「고정 입력 정보 설정」에서 스마트스토어에 등록된 이름과 동일하게 맞춰 주세요. 사용 중인 쇼핑몰 양식이 다르면 「쇼핑몰 송장 업로드 양식 등록」에서 실제 양식을 등록하시는 것을 권장합니다.',
} as const;

export interface DefaultSmartstoreInvoiceRecentFormat {
  id: string;
  createdAt: string;
  columnOrder: string[];
  displayName: string;
  bridgeFile: TemplateBridgeFile;
}

export interface DefaultSmartstoreInvoiceSeed {
  template: ReturnType<typeof buildCourierTemplateFromHeaders>;
  bridgeFile: TemplateBridgeFile;
  recentFormat: DefaultSmartstoreInvoiceRecentFormat;
}

export function isDefaultSmartstoreInvoiceSeedFormatId(id: string | undefined): boolean {
  return id === DEFAULT_SMARTSTORE_INVOICE_FORMAT_ID;
}

export function headersMatchDefaultSmartstoreInvoice(headers: string[]): boolean {
  if (headers.length !== SMARTSTORE_INVOICE_HEADERS.length) return false;
  return headers.every((header, index) => header === SMARTSTORE_INVOICE_HEADERS[index]);
}

export function isDefaultSmartstoreInvoiceSeedFormat(
  format: { id?: string; columnOrder?: string[] } | undefined,
): boolean {
  if (!format) return false;
  if (isDefaultSmartstoreInvoiceSeedFormatId(format.id)) return true;
  if (
    Array.isArray(format.columnOrder) &&
    headersMatchDefaultSmartstoreInvoice(format.columnOrder)
  ) {
    return true;
  }
  return false;
}

export function isDefaultSmartstoreAutoSeedOptOut(userId: string | null): boolean {
  if (typeof window === 'undefined') return false;
  return readLocalStorageWithLegacyMigrate(INVOICE_DEFAULT_SMARTSTORE_OPT_OUT_KEY, userId) === '1';
}

export function setDefaultSmartstoreAutoSeedOptOut(userId: string | null): void {
  writeLocalStorageForUser(INVOICE_DEFAULT_SMARTSTORE_OPT_OUT_KEY, userId, '1');
}

export function setDefaultSmartstoreAutoSeedOptOutForUserIds(
  userIds: Array<string | null | undefined>,
): void {
  const seen = new Set<string>();
  for (const raw of userIds) {
    if (raw == null) {
      if (!seen.has('__guest__')) {
        seen.add('__guest__');
        setDefaultSmartstoreAutoSeedOptOut(null);
      }
      continue;
    }
    const id = String(raw).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    setDefaultSmartstoreAutoSeedOptOut(id);
  }
}

export function isDefaultSmartstoreAutoSeedOptOutForUserIds(
  userIds: Array<string | null | undefined>,
): boolean {
  const seen = new Set<string>();
  for (const raw of userIds) {
    if (raw == null) {
      if (!seen.has('__guest__')) {
        seen.add('__guest__');
        if (isDefaultSmartstoreAutoSeedOptOut(null)) return true;
      }
      continue;
    }
    const id = String(raw).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (isDefaultSmartstoreAutoSeedOptOut(id)) return true;
  }
  return false;
}

export function isDefaultSmartstoreIntroAcknowledged(userId: string | null): boolean {
  if (typeof window === 'undefined') return false;
  return (
    readLocalStorageWithLegacyMigrate(INVOICE_DEFAULT_SMARTSTORE_INTRO_ACKNOWLEDGED_KEY, userId) ===
    '1'
  );
}

export function setDefaultSmartstoreIntroAcknowledged(userId: string | null): void {
  writeLocalStorageForUser(INVOICE_DEFAULT_SMARTSTORE_INTRO_ACKNOWLEDGED_KEY, userId, '1');
}

export function buildDefaultSmartstoreInvoiceSeed(): DefaultSmartstoreInvoiceSeed {
  const headers = [...SMARTSTORE_INVOICE_HEADERS];
  const bridgeFile = buildTrialBridgeFile(headers);
  const template = buildCourierTemplateFromHeaders(headers);
  const recentFormat: DefaultSmartstoreInvoiceRecentFormat = {
    id: DEFAULT_SMARTSTORE_INVOICE_FORMAT_ID,
    createdAt: new Date().toISOString(),
    columnOrder: headers,
    displayName: DEFAULT_SMARTSTORE_INVOICE_DISPLAY_NAME,
    bridgeFile,
  };
  return { template, bridgeFile, recentFormat };
}

export function isActiveDefaultSmartstoreInvoiceTemplate(
  template: { headers: Array<{ name: string; isEmpty?: boolean }> } | null,
): boolean {
  if (!template || !Array.isArray(template.headers)) return false;
  const headers = template.headers
    .filter((header) => !header.isEmpty && header.name.trim() !== '')
    .map((header) => header.name);
  return headersMatchDefaultSmartstoreInvoice(headers);
}
