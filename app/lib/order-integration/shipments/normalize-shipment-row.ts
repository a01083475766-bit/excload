import type { NormalizedShipmentRow } from '@/app/lib/order-integration/shipments/types';
import { TRACKING_NUMBER_LENGTH } from '@/app/lib/order-integration/shipments/match-constants';

type ShipmentFieldKey =
  | 'trackingNumber'
  | 'carrierName'
  | 'excloadOrderNo'
  | 'mallOrderNo'
  | 'receiverName'
  | 'receiverPhone'
  | 'receiverAddress'
  | 'productText'
  | 'shippedAt';

const SHIPMENT_HEADER_ALIASES: Record<ShipmentFieldKey, readonly string[]> = {
  trackingNumber: [
    '운송장번호',
    '송장번호',
    '송장 번호',
    '운송장',
    '송장',
    '택배번호',
    '배송번호',
    'trackingnumber',
    'tracking_number',
    'tracking no',
    'invoice no',
    'waybill_no',
  ],
  carrierName: ['택배사', '택배사명', '배송사', '배송업체', 'carrier', 'courier'],
  excloadOrderNo: [
    '엑클로드관리번호',
    '내부관리번호',
    'exc관리번호',
    'excloadorderno',
    'excload_order_no',
    '고객관리번호',
  ],
  mallOrderNo: ['주문번호', '쇼핑몰주문번호', '주문id', 'orderid', 'order no', 'order_number'],
  receiverName: ['수취인', '받는분', '받는사람', '수령인', '받는분성명', 'receiver', 'recipient'],
  receiverPhone: [
    '받는분전화번호',
    '수취인전화',
    '받는분전화',
    '받는사람연락처',
    '수하인전화',
    '연락처',
    '전화번호',
    'phone',
    'mobile',
  ],
  receiverAddress: ['주소', '받는분주소', '수취인주소', '배송지주소', 'address', 'shipping address'],
  productText: ['상품명', '상품', '품목', 'product', 'item', 'productname'],
  shippedAt: ['발송일', '출고일', '배송일', 'shipped_at', 'ship date'],
};

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '');
}

/** 헤더 행 후보 점수 — 송장 필드 별칭 일치 수 */
export function scoreShipmentHeaderRow(cells: readonly string[]): number {
  const normalizedCells = new Set(
    cells.map((cell) => normalizeHeaderKey(cell)).filter(Boolean),
  );
  let score = 0;
  for (const aliases of Object.values(SHIPMENT_HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (normalizedCells.has(normalizeHeaderKey(alias))) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

/** 여러 헤더 후보 중 송장 필드 별칭이 가장 많이 일치하는 행 인덱스 */
export function detectShipmentHeaderRowIndex(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): number {
  if (!rows.length) return 0;

  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((cell) => String(cell ?? ''));
    const score = scoreShipmentHeaderRow(cells);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore > 0 ? bestIndex : 0;
}

function buildHeaderLookup(raw: Record<string, string>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [header, value] of Object.entries(raw)) {
    lookup.set(normalizeHeaderKey(header), String(value ?? '').trim());
  }
  return lookup;
}

function pickField(lookup: Map<string, string>, field: ShipmentFieldKey): string {
  for (const alias of SHIPMENT_HEADER_ALIASES[field]) {
    const value = lookup.get(normalizeHeaderKey(alias));
    if (value) return value;
  }
  return '';
}

/** 송장번호 정규화 — 숫자 변환 금지, 공백·하이픈만 제거 */
export function normalizeTrackingNumber(value: string): string {
  return String(value ?? '').trim().replace(/[\s-]/g, '');
}

/** 전화번호 원본 유지 + 비교용 숫자만 추출 */
export function normalizePhoneDigits(value: string): string {
  const trimmed = String(value ?? '').trim();
  const digits = trimmed.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
  return digits;
}

export function normalizeReceiverName(value: string): string {
  return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

export function normalizeAddressForMatch(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^\w가-힣]/g, '');
}

function detectCarrierCode(carrierName: string): string {
  const normalized = carrierName.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('cj') || normalized.includes('대한통운')) return 'CJ';
  if (normalized.includes('lotte') || normalized.includes('롯데')) return 'LOTTE';
  if (normalized.includes('hanjin') || normalized.includes('한진')) return 'HANJIN';
  if (normalized.includes('logen') || normalized.includes('로젠')) return 'LOGEN';
  if (normalized.includes('epost') || normalized.includes('우체국')) return 'EPOST';
  return '';
}

function collectTrackingWarnings(trackingNumber: string, trackingNumberNormalized: string): string[] {
  const warnings: string[] = [];
  if (!trackingNumber) {
    warnings.push('송장번호가 비어 있습니다.');
    return warnings;
  }
  if (trackingNumberNormalized.length < TRACKING_NUMBER_LENGTH.MIN) {
    warnings.push('송장번호가 너무 짧습니다.');
  }
  if (trackingNumberNormalized.length > TRACKING_NUMBER_LENGTH.MAX) {
    warnings.push('송장번호가 너무 깁니다.');
  }
  return warnings;
}

/**
 * 송장파일 원본 행(헤더→값)을 표준 ShipmentRow로 정규화합니다.
 */
export function normalizeShipmentRow(input: {
  rawRow: Record<string, string>;
  originalRowIndex: number;
}): NormalizedShipmentRow {
  const lookup = buildHeaderLookup(input.rawRow);

  const trackingNumber = pickField(lookup, 'trackingNumber');
  const trackingNumberNormalized = normalizeTrackingNumber(trackingNumber);
  const carrierName = pickField(lookup, 'carrierName');
  const receiverPhone = pickField(lookup, 'receiverPhone');

  return {
    originalRowIndex: input.originalRowIndex,
    trackingNumber,
    trackingNumberNormalized,
    carrierName,
    standardCarrierCode: detectCarrierCode(carrierName),
    excloadOrderNo: pickField(lookup, 'excloadOrderNo'),
    mallOrderNo: pickField(lookup, 'mallOrderNo'),
    receiverName: pickField(lookup, 'receiverName'),
    receiverPhone,
    receiverPhoneNormalized: normalizePhoneDigits(receiverPhone),
    receiverAddress: pickField(lookup, 'receiverAddress'),
    receiverAddressNormalized: normalizeAddressForMatch(pickField(lookup, 'receiverAddress')),
    productText: pickField(lookup, 'productText'),
    shippedAt: pickField(lookup, 'shippedAt'),
    parseWarnings: collectTrackingWarnings(trackingNumber, trackingNumberNormalized),
  };
}
