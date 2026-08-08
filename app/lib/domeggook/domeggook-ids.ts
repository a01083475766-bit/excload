/**
 * 도매꾹 발주확인·송장전송용 식별자.
 * - 화면 표시: 원본 orderNo (OR 접두 가능)
 * - API 전송: OR 제거 후 숫자만 (toDomeggookOrderNoQueryValue)
 */

export const DOMEGGOOK_API_ORDER_NO_PREFIX = 'apiOrderNo:';
export const DOMEGGOOK_STATUS_MODE_PREFIX = 'statusMode:';
export const DOMEGGOOK_MARKET_PREFIX = 'market:';
export const DOMEGGOOK_ORDER_UID_PREFIX = 'orderUid:';

export type DomeggookStatusMode =
  | 'WAITPAY'
  | 'WAITCONFIRM'
  | 'WAITCHK'
  | 'WAITDELI'
  | 'WAITDENY'
  | 'WAITOK'
  | 'WAITRCPT'
  | 'WAITSERV'
  | 'DONE'
  | 'DENYCONFIRM'
  | 'DENYBUY'
  | 'DENYSELL'
  | 'BACK'
  | string;

export function encodeDomeggookApiOrderNoId(apiOrderNo: string): string {
  return `${DOMEGGOOK_API_ORDER_NO_PREFIX}${apiOrderNo.trim()}`;
}

export function encodeDomeggookStatusModeId(statusMode: string): string {
  return `${DOMEGGOOK_STATUS_MODE_PREFIX}${statusMode.trim().toUpperCase()}`;
}

export function encodeDomeggookMarketId(market: string): string {
  return `${DOMEGGOOK_MARKET_PREFIX}${market.trim().toLowerCase()}`;
}

export function encodeDomeggookOrderUidId(orderUid: string): string {
  return `${DOMEGGOOK_ORDER_UID_PREFIX}${orderUid.trim()}`;
}

export function extractDomeggookApiOrderNo(
  mallLineItemIds: readonly string[] | null | undefined,
): string | null {
  if (!mallLineItemIds?.length) return null;
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (value.startsWith(DOMEGGOOK_API_ORDER_NO_PREFIX)) {
      const no = value.slice(DOMEGGOOK_API_ORDER_NO_PREFIX.length).trim();
      if (/^\d+$/.test(no)) return no;
    }
  }
  return null;
}

export function extractDomeggookStatusMode(
  mallLineItemIds: readonly string[] | null | undefined,
): string | null {
  if (!mallLineItemIds?.length) return null;
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (value.startsWith(DOMEGGOOK_STATUS_MODE_PREFIX)) {
      const mode = value.slice(DOMEGGOOK_STATUS_MODE_PREFIX.length).trim().toUpperCase();
      return mode || null;
    }
  }
  return null;
}

export function extractDomeggookMarket(
  mallLineItemIds: readonly string[] | null | undefined,
): string | null {
  if (!mallLineItemIds?.length) return null;
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (value.startsWith(DOMEGGOOK_MARKET_PREFIX)) {
      const market = value.slice(DOMEGGOOK_MARKET_PREFIX.length).trim().toLowerCase();
      return market || null;
    }
  }
  return null;
}

export function extractDomeggookOrderUid(
  mallLineItemIds: readonly string[] | null | undefined,
): string | null {
  if (!mallLineItemIds?.length) return null;
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (value.startsWith(DOMEGGOOK_ORDER_UID_PREFIX)) {
      const uid = value.slice(DOMEGGOOK_ORDER_UID_PREFIX.length).trim();
      if (uid) return uid;
    }
  }
  // 레거시: 접두 없는 uid/상품주문번호 (bundle/shop/eleven/api 접두 제외)
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (
      !value ||
      value.includes(':') ||
      value.startsWith('bundle:') ||
      /^\d+$/.test(value)
    ) {
      continue;
    }
    return value;
  }
  return null;
}

export function buildDomeggookMallLineItemIds(input: {
  displayOrderNo: string;
  apiOrderNo: string;
  orderUid?: string | null;
  statusMode?: string | null;
  market?: string | null;
}): string[] {
  const ids: string[] = [];
  const uid = String(input.orderUid ?? '').trim();
  if (uid) {
    ids.push(uid);
    ids.push(encodeDomeggookOrderUidId(uid));
  }
  const apiNo = input.apiOrderNo.trim();
  if (apiNo) ids.push(encodeDomeggookApiOrderNoId(apiNo));
  const mode = String(input.statusMode ?? '').trim();
  if (mode) ids.push(encodeDomeggookStatusModeId(mode));
  const market = String(input.market ?? '').trim();
  if (market) ids.push(encodeDomeggookMarketId(market));
  return ids;
}

export function isDomeggookConfirmableStatusMode(statusMode: string, statusLabel = ''): boolean {
  const mode = statusMode.trim().toUpperCase();
  if (mode === 'WAITCHK') return true;
  const label = statusLabel.trim();
  return label === '결제완료';
}

export function isDomeggookAlreadyConfirmedStatusMode(
  statusMode: string,
  statusLabel = '',
): boolean {
  const mode = statusMode.trim().toUpperCase();
  if (
    mode === 'WAITDELI' ||
    mode === 'WAITOK' ||
    mode === 'WAITRCPT' ||
    mode === 'WAITSERV' ||
    mode === 'DONE'
  ) {
    return true;
  }
  const label = statusLabel.trim();
  return (
    label.includes('배송준비') ||
    label.includes('배송중') ||
    label.includes('배송완료') ||
    label.includes('적립예정') ||
    label.includes('판매종료')
  );
}

/** 발송정보 최초 등록(type=add) 가능: WAITCHK·WAITDELI */
export function isDomeggookInvoiceAddEligibleStatusMode(
  statusMode: string,
  statusLabel = '',
): boolean {
  const mode = statusMode.trim().toUpperCase();
  if (mode === 'WAITCHK' || mode === 'WAITDELI') return true;
  const label = statusLabel.trim();
  return label === '결제완료' || label.includes('배송준비');
}

export function isDomeggookShippedOrLaterStatusMode(statusMode: string): boolean {
  const mode = statusMode.trim().toUpperCase();
  return (
    mode === 'WAITOK' ||
    mode === 'WAITRCPT' ||
    mode === 'WAITSERV' ||
    mode === 'DONE'
  );
}

export function normalizeDomeggookTrackingForCompare(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s-]/g, '')
    .toUpperCase();
}
