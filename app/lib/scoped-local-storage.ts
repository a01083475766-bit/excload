/**
 * 로그인 시 localStorage 키를 계정별로 분리합니다.
 * - userId 있음: `${baseKey}:${userId}`
 * - 비로그인(게스트): baseKey (기존과 동일, 레거시 호환)
 * 로그인 후 첫 조회 시 레거시 baseKey 값이 있으면 스코프 키로 옮기고 레거시를 제거합니다.
 */

export const ORDER_CONVERT_KEYS = {
  template: 'onc_courier_template_v1',
  recentFormats: 'recent_excel_formats_v1',
  fixedHeaders: 'orderConvert_fixed_header_values_v1',
  bridge: 'activeCourierBridgeFile',
} as const;

export const INVOICE_FILE_CONVERT_KEYS = {
  template: 'invoiceFileConvert_courier_template_v1',
  recentFormats: 'invoiceFileConvert_recent_excel_formats_v1',
  fixedHeaders: 'invoiceFileConvert_fixed_header_values_v1',
  bridge: 'invoiceFileConvert_activeCourierBridgeFile',
} as const;

/** 물류 본페이지(!trial) 전용 — trial 키는 기존 문자열 그대로 사용 */
export const LOGISTICS_MAIN_KEYS = {
  template: 'logistics_convert_onc_courier_template_v1',
  recentFormats: 'logistics_convert_recent_excel_formats_v1',
  fixedHeaders: 'logistics_convert_fixed_header_values_v1',
  bridge: 'logistics_activeCourierBridgeFile',
} as const;

/** 카카오 텍스트 흐름 — 주문변환과 택배 양식 키는 공유(onc_courier_template_v1) */
export const KAKAO_EXTRA_KEYS = {
  senderInfo: 'senderInfo',
  selectedCourier: 'selectedCourier',
} as const;

/** 업로드 파일 목록 메타(파일명 등) — 계정별 분리 권장 */
export const UPLOADED_FILES_KEYS = {
  metadata: 'uploaded-files-metadata',
} as const;

/** 즐겨찾는 쇼핑몰(이름·URL) — 계정별 localStorage */
export const FAVORITE_MALLS_KEY = 'excload_favorite_malls_v1' as const;

function normalizeUserId(userId: string | null | undefined): string | null {
  if (typeof userId !== 'string') return null;
  const t = userId.trim();
  return t ? t : null;
}

export function storageKeyForUser(baseKey: string, userId: string | null | undefined): string {
  const id = normalizeUserId(userId);
  return id ? `${baseKey}:${id}` : baseKey;
}

export function readLocalStorageWithLegacyMigrate(
  baseKey: string,
  userId: string | null | undefined,
): string | null {
  if (typeof window === 'undefined') return null;
  const id = normalizeUserId(userId);
  if (!id) {
    return localStorage.getItem(baseKey);
  }
  const scopedKey = `${baseKey}:${id}`;
  const scoped = localStorage.getItem(scopedKey);
  if (scoped !== null && scoped !== '') return scoped;

  try {
    const leg = localStorage.getItem(baseKey);
    if (leg !== null && leg !== '') {
      localStorage.setItem(scopedKey, leg);
      localStorage.removeItem(baseKey);
      return leg;
    }
  } catch {
    /* ignore quota */
  }
  return null;
}

export function writeLocalStorageForUser(
  baseKey: string,
  userId: string | null | undefined,
  value: string,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKeyForUser(baseKey, userId), value);
  } catch (e) {
    console.error('[scoped-local-storage] setItem failed:', baseKey, e);
  }
}

export function removeLocalStorageForUser(baseKey: string, userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKeyForUser(baseKey, userId));
  } catch {
    /* ignore */
  }
}
