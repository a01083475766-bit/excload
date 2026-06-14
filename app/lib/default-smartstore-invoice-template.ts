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

/** 기본 양식 시드 시 배송방법 고정 입력 (배송방법 열은 기준헤더 미매핑 → 고정 입력으로 채움) */
export const DEFAULT_SMARTSTORE_FIXED_INPUT = {
  배송방법: '택배',
} as const;

export const DEFAULT_SMARTSTORE_INVOICE_INTRO_COPY = {
  modalTitle: '기본 양식으로 먼저 시작할게요',
  modalBody:
    '아직 등록된 송장 업로드 양식이 없어서, 스마트스토어 발송에 많이 쓰는 기본 4열 양식을 넣어 두었어요. 주문 파일과 송장 파일을 올리면 바로 맞춰 볼 수 있어요. 다른 쇼핑몰이거나 열 구성이 다르면 나중에 내 양식을 등록하시면 됩니다.',
  continueButton: '기본 양식으로 계속하기',
  registerButton: '내 양식 등록하기',
  banner:
    '지금은 스마트스토어 발송용 기본 4열 양식(상품주문번호·배송방법·택배사·송장번호)으로 설정되어 있어요. 택배사 이름은 「고정 입력 정보 설정」에서 한 번만 맞춰 주세요. 다른 쇼핑몰이면 「쇼핑몰 송장 업로드 양식 등록」에서 바꿀 수 있어요.',
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
