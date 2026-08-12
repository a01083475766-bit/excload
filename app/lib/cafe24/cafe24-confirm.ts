import type { Cafe24ClientCredentials } from '@/app/lib/cafe24/client';
import {
  putCafe24OrdersPrepare,
  type Cafe24PrepareOrderRequestItem,
} from '@/app/lib/cafe24/client';
import {
  CAFE24_STATUS_LABEL,
  mapCafe24OrderRowToStandardRow,
  mapCafe24OrdersToFetchViews,
} from '@/app/lib/cafe24/map-cafe24-orders';
import { parseCafe24ShopNo } from '@/app/lib/cafe24/cafe24-shop-no';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export {
  CAFE24_SHOP_NO_INVALID_TOKEN,
  formatCafe24ShopNoForCenterCode,
  parseCafe24ShopNo,
} from '@/app/lib/cafe24/cafe24-shop-no';

/** 최종 requests 객체(주문 단위) 최대 개수 — 품목 수가 아님. */
export const CAFE24_CONFIRM_BATCH_SIZE = 100;
export const CAFE24_CONFIRM_MAX_ITEMS = 500;
export const CAFE24_CONFIRM_ID_MAX_LENGTH = 64;

export type Cafe24ConfirmItemStatus =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  | 'FAILED'
  | 'SKIPPED_NOT_ELIGIBLE';

export type Cafe24ConfirmRequestItem = {
  orderId: string;
  orderItemCode?: string | null;
  orderStatus?: string | null;
  /** 유효한 shop_no. null이면 API 기본값 1. */
  shopNo?: number | null;
  /** shop_no가 명시됐지만 정수≥1이 아닐 때 true — API 호출 없이 FAILED. */
  shopNoInvalid?: boolean;
};

export type Cafe24ConfirmItemResult = {
  productOrderNo: string;
  orderId: string;
  orderItemCode: string;
  shopNo: number;
  status: Cafe24ConfirmItemStatus;
  message: string;
  standardRows?: StandardOrderRow[];
  views?: OrderFetchView[];
};

export type Cafe24ConfirmRunResult = {
  requestedCount: number;
  confirmedCount: number;
  alreadyConfirmedCount: number;
  failedCount: number;
  skippedCount: number;
  results: Cafe24ConfirmItemResult[];
  putCallCount: number;
};

export function normalizeCafe24OrderStatus(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

const ALREADY_PREPARED = new Set(['N20', 'N21', 'N30', 'N40', 'N50']);
const CLAIM_PREFIXES = ['C', 'R', 'E'] as const;

/** N10 상품준비중만 발주확인(prepare → N20) 대상. */
export function isCafe24ConfirmableStatus(status: string | null | undefined): boolean {
  return normalizeCafe24OrderStatus(status) === 'N10';
}

export function isCafe24AlreadyPreparedStatus(status: string | null | undefined): boolean {
  return ALREADY_PREPARED.has(normalizeCafe24OrderStatus(status));
}

export function isCafe24ClaimStatus(status: string | null | undefined): boolean {
  const code = normalizeCafe24OrderStatus(status);
  if (!code) return false;
  return CLAIM_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function cafe24ConfirmLineKey(
  shopNo: number | null | undefined,
  orderId: string,
  orderItemCode: string,
): string {
  const shopKey =
    shopNo == null || !Number.isInteger(shopNo) || shopNo < 1 ? 'default' : String(shopNo);
  return `${shopKey}|${orderId.trim()}|${orderItemCode.trim()}`;
}

export function validateCafe24ConfirmItems(
  raw: unknown,
): { ok: true; items: Cafe24ConfirmRequestItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '발주확인할 주문 목록이 필요합니다.' };
  }
  if (raw.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }
  if (raw.length > CAFE24_CONFIRM_MAX_ITEMS) {
    return {
      ok: false,
      error: `한 번에 최대 ${CAFE24_CONFIRM_MAX_ITEMS}건까지 발주확인할 수 있습니다.`,
    };
  }

  const items: Cafe24ConfirmRequestItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: '주문 항목 형식이 올바르지 않습니다.' };
    }
    const record = entry as Record<string, unknown>;
    const orderId = String(record.orderId ?? record.order_id ?? '').trim();
    if (!orderId) {
      return { ok: false, error: '주문번호(order_id)가 없는 항목은 발주확인할 수 없습니다.' };
    }
    if (/\s/.test(orderId) || orderId.length > CAFE24_CONFIRM_ID_MAX_LENGTH) {
      return { ok: false, error: '주문번호 형식이 올바르지 않습니다.' };
    }
    const orderItemCodeRaw = String(
      record.orderItemCode ?? record.order_item_code ?? '',
    ).trim();
    if (
      orderItemCodeRaw &&
      (/\s/.test(orderItemCodeRaw) || orderItemCodeRaw.length > CAFE24_CONFIRM_ID_MAX_LENGTH)
    ) {
      return { ok: false, error: '품주코드 형식이 올바르지 않습니다.' };
    }

    const shopNoRaw = record.shopNo ?? record.shop_no;
    const shopParsed = parseCafe24ShopNo(shopNoRaw);
    const key = shopParsed.ok
      ? cafe24ConfirmLineKey(shopParsed.shopNo, orderId, orderItemCodeRaw)
      : `invalid|${String(shopNoRaw ?? '')}|${orderId}|${orderItemCodeRaw}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      orderId,
      orderItemCode: orderItemCodeRaw || null,
      orderStatus:
        record.orderStatus == null && record.order_status == null
          ? null
          : String(record.orderStatus ?? record.order_status),
      shopNo: shopParsed.ok ? shopParsed.shopNo : null,
      shopNoInvalid: !shopParsed.ok,
    });
  }
  if (items.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }
  return { ok: true, items };
}

export function classifyCafe24ConfirmPreflight(item: Cafe24ConfirmRequestItem): {
  status: Cafe24ConfirmItemStatus;
  message: string;
} | null {
  if (item.shopNoInvalid) {
    return {
      status: 'FAILED',
      message: 'shop_no가 올바르지 않아 발주확인을 호출하지 않았습니다.',
    };
  }
  const code = normalizeCafe24OrderStatus(item.orderStatus);
  if (!code) {
    return {
      status: 'FAILED',
      message: '주문상태를 확인할 수 없어 발주확인을 진행하지 않았습니다.',
    };
  }
  if (isCafe24AlreadyPreparedStatus(code)) {
    return {
      status: 'ALREADY_CONFIRMED',
      message:
        code === 'N20'
          ? '이미 배송준비중 상태입니다.'
          : `이미 다음 단계(${CAFE24_STATUS_LABEL[code] ?? code}) 상태입니다.`,
    };
  }
  if (code === 'N00') {
    return { status: 'SKIPPED_NOT_ELIGIBLE', message: '입금전 주문은 발주확인할 수 없습니다.' };
  }
  if (code === 'N22') {
    return {
      status: 'SKIPPED_NOT_ELIGIBLE',
      message:
        '배송보류(N22) 주문은 발주확인할 수 없습니다. 카페24에서 보류를 해제한 뒤 다시 시도해 주세요.',
    };
  }
  if (isCafe24ClaimStatus(code)) {
    return {
      status: 'SKIPPED_NOT_ELIGIBLE',
      message: `취소·교환·반품 주문은 발주확인할 수 없습니다. (${CAFE24_STATUS_LABEL[code] ?? code})`,
    };
  }
  if (!isCafe24ConfirmableStatus(code)) {
    return {
      status: 'FAILED',
      message: `알 수 없는 주문상태(${code})라 발주확인을 호출하지 않았습니다.`,
    };
  }
  const orderItemCode = String(item.orderItemCode ?? '').trim();
  // 품주 없는 행을 주문 전체 처리로 추측 전송하지 않음
  if (!orderItemCode || orderItemCode === item.orderId) {
    return {
      status: 'FAILED',
      message: '품주코드(order_item_code)가 없어 발주확인을 호출하지 않았습니다.',
    };
  }
  return null;
}

function effectiveShopNo(item: Cafe24ConfirmRequestItem): number {
  if (item.shopNoInvalid) return 0;
  if (item.shopNo == null) return 1;
  return item.shopNo;
}

function confirmedPatch(item: Cafe24ConfirmRequestItem): {
  standardRows: StandardOrderRow[];
  views: OrderFetchView[];
} {
  const shopNo = effectiveShopNo(item) > 0 ? effectiveShopNo(item) : 1;
  const orderItemCode = String(item.orderItemCode ?? '').trim();
  const order = {
    shop_no: shopNo,
    order_id: item.orderId,
    order_status: 'N20',
    items: orderItemCode
      ? [{ order_item_code: orderItemCode, product_name: '', quantity: 1, order_status: 'N20' }]
      : [],
  };
  return {
    standardRows: [
      mapCafe24OrderRowToStandardRow({
        order,
        item: order.items[0] ?? null,
      }),
    ],
    views: mapCafe24OrdersToFetchViews([order]),
  };
}

function toResultShell(
  item: Cafe24ConfirmRequestItem,
): Pick<Cafe24ConfirmItemResult, 'productOrderNo' | 'orderId' | 'orderItemCode' | 'shopNo'> {
  const orderItemCode = String(item.orderItemCode ?? '').trim();
  return {
    productOrderNo: orderItemCode || item.orderId,
    orderId: item.orderId,
    orderItemCode,
    shopNo: effectiveShopNo(item) > 0 ? effectiveShopNo(item) : 1,
  };
}

type Cafe24PrepareRequestUnit = {
  orderId: string;
  items: Cafe24ConfirmRequestItem[];
  request: Cafe24PrepareOrderRequestItem;
};

/**
 * 같은 shop 내 N10 품목을 order_id 기준으로 묶어
 * 공식 스키마 `{ order_id, process_status, order_item_code: string[] }` 생성.
 */
export function buildCafe24PrepareRequestUnits(
  items: Cafe24ConfirmRequestItem[],
): Cafe24PrepareRequestUnit[] {
  const byOrder = new Map<string, Cafe24ConfirmRequestItem[]>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }

  const units: Cafe24PrepareRequestUnit[] = [];
  for (const [orderId, orderItems] of byOrder.entries()) {
    const codes: string[] = [];
    const seen = new Set<string>();
    for (const item of orderItems) {
      const code = String(item.orderItemCode ?? '').trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
    }
    units.push({
      orderId,
      items: orderItems,
      request: {
        order_id: orderId,
        process_status: 'prepare',
        order_item_code: codes,
      },
    });
  }
  return units;
}

function chunkByShop(
  items: Cafe24ConfirmRequestItem[],
): Array<{ shopNo: number; items: Cafe24ConfirmRequestItem[] }> {
  const map = new Map<number, Cafe24ConfirmRequestItem[]>();
  for (const item of items) {
    const shopNo = effectiveShopNo(item);
    const list = map.get(shopNo) ?? [];
    list.push(item);
    map.set(shopNo, list);
  }
  return [...map.entries()].map(([shopNo, group]) => ({ shopNo, items: group }));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sanitizePublicCafe24Message(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/access[_-]?token["'\s:=]+[A-Za-z0-9._\-]+/gi, 'access_token=[REDACTED]')
    .slice(0, 300);
}

function parseCafe24HttpErrorMessage(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: string | { code?: string; message?: string };
      error_description?: string;
      message?: string;
    };
    if (parsed.error && typeof parsed.error === 'object') {
      const msg = String(parsed.error.message ?? '').trim();
      const code = String(parsed.error.code ?? '').trim();
      if (msg) return sanitizePublicCafe24Message(msg);
      if (code) return sanitizePublicCafe24Message(`카페24 API 오류 (${code})`);
    }
    if (typeof parsed.error_description === 'string' && parsed.error_description.trim()) {
      return sanitizePublicCafe24Message(parsed.error_description);
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return sanitizePublicCafe24Message(parsed.message);
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return sanitizePublicCafe24Message(`카페24 API 오류 (${parsed.error})`);
    }
  } catch {
    // ignore
  }
  return '카페24 발주확인(배송준비중 처리)에 실패했습니다.';
}

type BatchLineOutcome = {
  key: string;
  status: 'CONFIRMED' | 'FAILED';
  message: string;
};

function normalizeResponseItemCodes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    // 방어: 단일 문자열이 오면 길이 1 배열로만 취급 (요청 조립은 항상 배열)
    return [raw.trim()];
  }
  return [];
}

/**
 * 공식 성공 응답 `{ orders: [{ shop_no, order_id, process_status, order_item_code: string[] }] }` 해석.
 * HTTP 2xx만으로 전건 성공 처리하지 않음.
 */
export function interpretCafe24PrepareBatchResponse(input: {
  httpStatus: number;
  bodyText: string;
  shopNo: number;
  batch: Cafe24ConfirmRequestItem[];
}): BatchLineOutcome[] {
  const lineKey = (item: Cafe24ConfirmRequestItem) =>
    cafe24ConfirmLineKey(input.shopNo, item.orderId, String(item.orderItemCode ?? '').trim());

  const defaultFail = (message: string): BatchLineOutcome[] =>
    input.batch.map((item) => ({
      key: lineKey(item),
      status: 'FAILED' as const,
      message: sanitizePublicCafe24Message(message),
    }));

  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return defaultFail(parseCafe24HttpErrorMessage(input.bodyText));
  }

  let parsed: unknown = null;
  try {
    parsed = input.bodyText.trim() ? JSON.parse(input.bodyText) : null;
  } catch {
    return defaultFail('카페24 응답을 해석하지 못해 발주확인 결과를 확정할 수 없습니다.');
  }

  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;

  if (!record || !Array.isArray(record.orders)) {
    return defaultFail('카페24 성공 응답(orders)이 없어 발주확인 결과를 확정할 수 없습니다.');
  }

  const confirmedKeys = new Set<string>();
  for (const entry of record.orders) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const orderId = String(row.order_id ?? '').trim();
    if (!orderId) continue;
    const responseShop = parseCafe24ShopNo(row.shop_no);
    if (responseShop.ok && responseShop.shopNo !== input.shopNo) continue;
    const codes = normalizeResponseItemCodes(row.order_item_code);
    for (const code of codes) {
      confirmedKeys.add(cafe24ConfirmLineKey(input.shopNo, orderId, code));
    }
  }

  return input.batch.map((item) => {
    const key = lineKey(item);
    if (confirmedKeys.has(key)) {
      return {
        key,
        status: 'CONFIRMED' as const,
        message: '발주확인(배송준비중) 처리가 완료되었습니다.',
      };
    }
    return {
      key,
      status: 'FAILED' as const,
      message: '카페24 응답에서 해당 품목이 확인되지 않았습니다.',
    };
  });
}

/**
 * 카페24 발주확인 = process_status prepare (N10 → N20).
 * prepareproduct / purchase_confirmation / hold / unhold 는 사용하지 않음.
 */
export async function runCafe24Confirm(input: {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  items: Cafe24ConfirmRequestItem[];
  putPrepare?: typeof putCafe24OrdersPrepare;
}): Promise<Cafe24ConfirmRunResult> {
  const putPrepare = input.putPrepare ?? putCafe24OrdersPrepare;
  const results: Cafe24ConfirmItemResult[] = [];
  const toCall: Cafe24ConfirmRequestItem[] = [];
  let alreadyConfirmedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let confirmedCount = 0;
  let putCallCount = 0;

  for (const item of input.items) {
    const shell = toResultShell(item);
    const preflight = classifyCafe24ConfirmPreflight(item);
    if (preflight) {
      if (preflight.status === 'ALREADY_CONFIRMED') {
        alreadyConfirmedCount += 1;
        results.push({
          ...shell,
          status: preflight.status,
          message: preflight.message,
          ...confirmedPatch(item),
        });
      } else if (preflight.status === 'SKIPPED_NOT_ELIGIBLE') {
        skippedCount += 1;
        results.push({ ...shell, status: preflight.status, message: preflight.message });
      } else {
        failedCount += 1;
        results.push({ ...shell, status: 'FAILED', message: preflight.message });
      }
      continue;
    }
    toCall.push(item);
  }

  for (const group of chunkByShop(toCall)) {
    const units = buildCafe24PrepareRequestUnits(group.items);
    for (const unitBatch of chunkArray(units, CAFE24_CONFIRM_BATCH_SIZE)) {
      putCallCount += 1;
      const requests = unitBatch.map((unit) => unit.request);
      const batchItems = unitBatch.flatMap((unit) => unit.items);
      try {
        const posted = await putPrepare({
          credentials: input.credentials,
          accessToken: input.accessToken,
          shopNo: group.shopNo,
          requests,
        });
        const outcomes = interpretCafe24PrepareBatchResponse({
          httpStatus: posted.httpStatus,
          bodyText: posted.bodyText,
          shopNo: group.shopNo,
          batch: batchItems,
        });
        for (const item of batchItems) {
          const key = cafe24ConfirmLineKey(
            group.shopNo,
            item.orderId,
            String(item.orderItemCode ?? '').trim(),
          );
          const outcome = outcomes.find((row) => row.key === key) ?? {
            key,
            status: 'FAILED' as const,
            message: '발주확인 결과를 확정할 수 없습니다.',
          };
          if (outcome.status === 'CONFIRMED') {
            confirmedCount += 1;
            results.push({
              ...toResultShell(item),
              status: 'CONFIRMED',
              message: outcome.message,
              ...confirmedPatch(item),
            });
          } else {
            failedCount += 1;
            results.push({
              ...toResultShell(item),
              status: 'FAILED',
              message: outcome.message,
            });
          }
        }
      } catch (error) {
        const message = sanitizePublicCafe24Message(
          error instanceof Error
            ? error.message
            : '카페24 발주확인 처리 중 오류가 발생했습니다.',
        );
        for (const item of batchItems) {
          failedCount += 1;
          results.push({
            ...toResultShell(item),
            status: 'FAILED',
            message,
          });
        }
      }
    }
  }

  return {
    requestedCount: input.items.length,
    confirmedCount,
    alreadyConfirmedCount,
    failedCount,
    skippedCount,
    results,
    putCallCount,
  };
}
