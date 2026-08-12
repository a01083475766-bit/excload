/** 표준행 센터코드에 잘못된 shop_no를 표시할 때 쓰는 비숫자 토큰. */
export const CAFE24_SHOP_NO_INVALID_TOKEN = 'INVALID';

export type ParseCafe24ShopNoResult =
  | { ok: true; shopNo: number; usedDefault: boolean }
  | { ok: false; reason: string };

/**
 * shop_no 파싱.
 * - null/undefined/빈문자 → 기본값 1 (Cafe24 DEFAULT)
 * - 0, 음수, 소수, NaN, 비숫자 → 실패 (조용히 1로 바꾸지 않음)
 */
export function parseCafe24ShopNo(value: unknown): ParseCafe24ShopNoResult {
  if (value == null) return { ok: true, shopNo: 1, usedDefault: true };
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1) {
      return { ok: false, reason: `잘못된 shop_no(${value})` };
    }
    return { ok: true, shopNo: value, usedDefault: false };
  }
  const raw = String(value).trim();
  if (!raw) return { ok: true, shopNo: 1, usedDefault: true };
  if (raw.toUpperCase() === CAFE24_SHOP_NO_INVALID_TOKEN) {
    return { ok: false, reason: '잘못된 shop_no' };
  }
  if (!/^\d+$/.test(raw)) {
    return { ok: false, reason: `잘못된 shop_no(${raw})` };
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, reason: `잘못된 shop_no(${raw})` };
  }
  return { ok: true, shopNo: n, usedDefault: false };
}

/** 표준행 센터코드용. 잘못된 값은 INVALID 토큰으로 보존. */
export function formatCafe24ShopNoForCenterCode(shopNo: unknown): string {
  if (shopNo == null || String(shopNo).trim() === '') return '1';
  const parsed = parseCafe24ShopNo(shopNo);
  if (!parsed.ok) return CAFE24_SHOP_NO_INVALID_TOKEN;
  return String(parsed.shopNo);
}
