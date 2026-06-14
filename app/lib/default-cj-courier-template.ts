/**
 * 택배·물류 변환 페이지 — CJ 12열 기본 업로드 양식 시드
 */

import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import {
  readLocalStorageWithLegacyMigrate,
  writeLocalStorageForUser,
} from '@/app/lib/scoped-local-storage';
import {
  buildCourierTemplateFromHeaders,
  buildTrialBridgeFile,
  CJ_DEFAULT_COURIER_HEADERS,
} from '@/app/logistics-convert/trial-sample-formats';

export const DEFAULT_CJ_FORMAT_ID = 'default-cj-courier-v1';
export const DEFAULT_CJ_FORMAT_DISPLAY_NAME = '기본 택배 엑셀 양식';

export const ORDER_DEFAULT_CJ_INTRO_SUPPRESS_KEY =
  'orderConvert_default_cj_intro_suppress_until_v1';
export const LOGISTICS_DEFAULT_CJ_INTRO_SUPPRESS_KEY =
  'logisticsConvert_default_cj_intro_suppress_until_v1';

/** 사용자가 기본 양식을 삭제한 경우 자동 재등록 방지 */
export const ORDER_DEFAULT_CJ_OPT_OUT_KEY = 'orderConvert_default_cj_opt_out_v1';
export const LOGISTICS_DEFAULT_CJ_OPT_OUT_KEY = 'logisticsConvert_default_cj_opt_out_v1';

export const DEFAULT_CJ_INTRO_COPY = {
  modalTitle: '기본 양식으로 먼저 시작할게요',
  modalBodyCourier:
    '아직 등록된 업로드 양식이 없어서, 많이 쓰는 기본 엑셀 양식을 넣어 두었어요. 바로 주문을 변환해 보실 수 있어요. 택배사에 올리는 파일과 다르면 나중에 내 양식을 등록하시면 됩니다.',
  modalBodyLogistics:
    '아직 등록된 업로드 양식이 없어서, 많이 쓰는 기본 엑셀 양식을 넣어 두었어요. 바로 주문을 변환해 보실 수 있어요. 물류센터에 올리는 파일과 다르면 나중에 내 양식을 등록하시면 됩니다.',
  continueButton: '기본 양식으로 계속하기',
  registerButton: '내 양식 등록하기',
  bannerCourier:
    '지금은 많이 쓰는 기본 엑셀 양식으로 설정되어 있어요. 택배사에 올리는 파일 양식이 다르면 「업로드 양식 등록」에서 내 파일을 등록해 주세요.',
  bannerLogistics:
    '지금은 많이 쓰는 기본 엑셀 양식으로 설정되어 있어요. 물류센터에 올리는 파일 양식이 다르면 「업로드 양식 등록」에서 내 파일을 등록해 주세요.',
} as const;

export interface DefaultCjRecentFormat {
  id: string;
  createdAt: string;
  columnOrder: string[];
  displayName: string;
  bridgeFile: TemplateBridgeFile;
}

export interface DefaultCjCourierSeed {
  template: ReturnType<typeof buildCourierTemplateFromHeaders>;
  bridgeFile: TemplateBridgeFile;
  recentFormat: DefaultCjRecentFormat;
}

export function isDefaultCjSeedFormatId(id: string | undefined): boolean {
  return id === DEFAULT_CJ_FORMAT_ID;
}

export function headersMatchDefaultCj(headers: string[]): boolean {
  if (headers.length !== CJ_DEFAULT_COURIER_HEADERS.length) return false;
  return headers.every((header, index) => header === CJ_DEFAULT_COURIER_HEADERS[index]);
}

export function isDefaultCjSeedFormat(
  format: { id?: string; columnOrder?: string[] } | undefined,
): boolean {
  if (!format) return false;
  if (isDefaultCjSeedFormatId(format.id)) return true;
  if (Array.isArray(format.columnOrder) && headersMatchDefaultCj(format.columnOrder)) {
    return true;
  }
  return false;
}

export function isDefaultCjAutoSeedOptOut(
  userId: string | null,
  optOutKey: string,
): boolean {
  if (typeof window === 'undefined') return false;
  return readLocalStorageWithLegacyMigrate(optOutKey, userId) === '1';
}

export function setDefaultCjAutoSeedOptOut(userId: string | null, optOutKey: string): void {
  writeLocalStorageForUser(optOutKey, userId, '1');
}

export function buildDefaultCjCourierSeed(): DefaultCjCourierSeed {
  const headers = [...CJ_DEFAULT_COURIER_HEADERS];
  const bridgeFile = buildTrialBridgeFile(headers);
  const template = buildCourierTemplateFromHeaders(headers);
  const recentFormat: DefaultCjRecentFormat = {
    id: DEFAULT_CJ_FORMAT_ID,
    createdAt: new Date().toISOString(),
    columnOrder: headers,
    displayName: DEFAULT_CJ_FORMAT_DISPLAY_NAME,
    bridgeFile,
  };
  return { template, bridgeFile, recentFormat };
}

export function extractActiveTemplateHeaders(
  template: { headers: Array<{ name: string; isEmpty?: boolean }> } | null,
): string[] {
  if (!template || !Array.isArray(template.headers)) return [];
  return template.headers
    .filter((header) => !header.isEmpty && header.name.trim() !== '')
    .map((header) => header.name);
}

export function isActiveDefaultCjTemplate(
  template: { headers: Array<{ name: string; isEmpty?: boolean }> } | null,
): boolean {
  return headersMatchDefaultCj(extractActiveTemplateHeaders(template));
}
