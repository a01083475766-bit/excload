import {
  SMARTSTORE_CONFIRM_MAX_BATCH,
  SMARTSTORE_CONFIRM_PATH,
  type SmartstoreProductOrderDetail,
} from '@/app/lib/smartstore/client';
import {
  mapSmartstoreOrdersToFetchViews,
  mapSmartstoreOrdersToStandardRows,
} from '@/app/lib/smartstore/map-smartstore-orders';
import {
  normalizeSmartstoreOrderStatus,
  normalizeSmartstorePlaceOrderStatus,
} from '@/app/lib/order-integration/order-status';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export { SMARTSTORE_CONFIRM_MAX_BATCH, SMARTSTORE_CONFIRM_PATH };

/** 한 API 요청에 허용하는 최대 productOrderId 수(서버에서 30건씩 분할). */
export const SMARTSTORE_CONFIRM_REQUEST_MAX = 300;

/** 이미 발주확인된 주문에 confirm을 다시 호출했을 때 공식 예시 코드. */
export const SMARTSTORE_ALREADY_CONFIRMED_CODE = '104443';

export type SmartstoreConfirmItemStatus =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  | 'ADDRESS_CHANGED'
  | 'FAILED'
  | 'UNCERTAIN';

export type SmartstoreConfirmSuccessInfo = {
  productOrderId: string;
  isReceiverAddressChanged: boolean;
};

export type SmartstoreConfirmFailInfo = {
  productOrderId: string;
  code: string | null;
  message: string;
};

export type SmartstoreConfirmParsedResponse = {
  successProductOrderInfos: SmartstoreConfirmSuccessInfo[];
  failProductOrderInfos: SmartstoreConfirmFailInfo[];
  structureValid: boolean;
};

export type SmartstoreConfirmItemResult = {
  productOrderId: string;
  status: SmartstoreConfirmItemStatus;
  message: string;
  isReceiverAddressChanged: boolean;
  refreshedPlaceOrderStatus: string | null;
  standardRows: StandardOrderRow[] | null;
  views: OrderFetchView[] | null;
};

export type SmartstoreConfirmRunResult = {
  requestedCount: number;
  confirmedCount: number;
  alreadyConfirmedCount: number;
  addressChangedCount: number;
  failedCount: number;
  uncertainCount: number;
  results: SmartstoreConfirmItemResult[];
};

export type ValidateConfirmProductOrderIdsResult =
  | { ok: true; productOrderIds: string[] }
  | { ok: false; error: string };

const AMBIGUOUS_HTTP_STATUSES = new Set([500, 502, 503, 504, 521]);

const BLOCKED_PRODUCT_ORDER_STATUSES = new Set([
  'CANCELED',
  'CANCELED_BY_NOPAYMENT',
  'RETURNED',
  'EXCHANGED',
  'DELIVERING',
  'DELIVERED',
  'PURCHASE_DECIDED',
  'PAYMENT_WAITING',
]);

function asTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function sanitizeConfirmUserMessage(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  return sanitizePublicIntegrationErrorMessage(raw, fallback);
}

/** productOrderId 형식·중복 제거. orderId(일반 주문번호)와 혼동되는 빈 값·공백 거부. */
export function validateConfirmProductOrderIds(raw: unknown): ValidateConfirmProductOrderIdsResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'productOrderIds must be an array.' };
  }
  if (raw.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }

  const seen = new Set<string>();
  const productOrderIds: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string' && typeof item !== 'number') {
      return { ok: false, error: '상품주문번호 형식이 올바르지 않습니다.' };
    }
    const trimmed = asTrimmedString(item);
    if (!trimmed || /\s/.test(trimmed) || trimmed.length > 64) {
      return { ok: false, error: '상품주문번호 형식이 올바르지 않습니다.' };
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    productOrderIds.push(trimmed);
  }

  if (productOrderIds.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }
  if (productOrderIds.length > SMARTSTORE_CONFIRM_REQUEST_MAX) {
    return {
      ok: false,
      error: `한 번에 최대 ${SMARTSTORE_CONFIRM_REQUEST_MAX}건만 처리할 수 있습니다.`,
    };
  }

  return { ok: true, productOrderIds };
}

export function chunkProductOrderIds(
  productOrderIds: readonly string[],
  size: number = SMARTSTORE_CONFIRM_MAX_BATCH,
): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < productOrderIds.length; index += size) {
    chunks.push(productOrderIds.slice(index, index + size));
  }
  return chunks;
}

export function parseSmartstoreConfirmResponse(bodyText: string): SmartstoreConfirmParsedResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return {
      successProductOrderInfos: [],
      failProductOrderInfos: [],
      structureValid: false,
    };
  }

  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  if (!root) {
    return {
      successProductOrderInfos: [],
      failProductOrderInfos: [],
      structureValid: false,
    };
  }

  const record = root as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;

  if (!data) {
    return {
      successProductOrderInfos: [],
      failProductOrderInfos: [],
      structureValid: false,
    };
  }

  // dispatch의 successProductOrderIds와 혼동 금지 — confirm은 successProductOrderInfos만 사용.
  if ('successProductOrderIds' in data && !('successProductOrderInfos' in data)) {
    return {
      successProductOrderInfos: [],
      failProductOrderInfos: [],
      structureValid: false,
    };
  }

  const successRaw = data.successProductOrderInfos;
  const failRaw = data.failProductOrderInfos;
  if (!Array.isArray(successRaw) || !Array.isArray(failRaw)) {
    return {
      successProductOrderInfos: [],
      failProductOrderInfos: [],
      structureValid: false,
    };
  }

  const successProductOrderInfos: SmartstoreConfirmSuccessInfo[] = [];
  for (const entry of successRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const productOrderId = asTrimmedString(row.productOrderId);
    if (!productOrderId) continue;
    successProductOrderInfos.push({
      productOrderId,
      isReceiverAddressChanged: row.isReceiverAddressChanged === true,
    });
  }

  const failProductOrderInfos: SmartstoreConfirmFailInfo[] = [];
  for (const entry of failRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const productOrderId = asTrimmedString(row.productOrderId);
    if (!productOrderId) continue;
    const code = asTrimmedString(row.code) || null;
    const message = sanitizeConfirmUserMessage(
      asTrimmedString(row.message) || null,
      '발주확인에 실패했습니다.',
    );
    failProductOrderInfos.push({ productOrderId, code, message });
  }

  return {
    successProductOrderInfos,
    failProductOrderInfos,
    structureValid: true,
  };
}

export function isAmbiguousConfirmHttpStatus(httpStatus: number): boolean {
  return AMBIGUOUS_HTTP_STATUSES.has(httpStatus) || httpStatus === 0;
}

function detailProductOrderId(detail: SmartstoreProductOrderDetail): string {
  return asTrimmedString(detail.productOrder?.productOrderId);
}

function hasActiveClaim(detail: SmartstoreProductOrderDetail): boolean {
  const productOrder = detail.productOrder;
  if (!productOrder) return false;

  const claimType = asTrimmedString(productOrder.claimType).toUpperCase();
  if (claimType === 'CANCEL' || claimType === 'RETURN' || claimType === 'EXCHANGE') {
    return true;
  }

  const claimStatus = asTrimmedString(productOrder.claimStatus).toUpperCase();
  if (claimStatus && claimStatus !== 'NONE') {
    return true;
  }

  const current = productOrder.currentClaim;
  if (!current) return false;
  const cancelQty = current.cancel?.requestQuantity ?? 0;
  const returnQty = current.return?.requestQuantity ?? 0;
  const exchangeQty = current.exchange?.requestQuantity ?? 0;
  return cancelQty > 0 || returnQty > 0 || exchangeQty > 0;
}

export type SmartstoreConfirmPreflightDecision =
  | { action: 'CONFIRM' }
  | { action: 'ALREADY_CONFIRMED'; message: string }
  | { action: 'SKIP'; status: 'FAILED' | 'UNCERTAIN'; message: string };

/** 발주확인 POST 직전 상태 판정. PAYED + NOT_YET만 confirm. */
export function classifyConfirmPreflight(
  detail: SmartstoreProductOrderDetail | null,
  requestedProductOrderId: string,
): SmartstoreConfirmPreflightDecision {
  if (!detail) {
    return {
      action: 'SKIP',
      status: 'FAILED',
      message: '상품주문을 확인하지 못했습니다. 권한이 없거나 존재하지 않는 번호일 수 있습니다.',
    };
  }

  const actualId = detailProductOrderId(detail);
  if (!actualId || actualId !== requestedProductOrderId) {
    return {
      action: 'SKIP',
      status: 'FAILED',
      message: '상품주문번호 연결이 불명확하여 발주확인을 진행하지 않았습니다.',
    };
  }

  const productStatus = asTrimmedString(detail.productOrder?.productOrderStatus).toUpperCase();
  const placeStatus = normalizeSmartstorePlaceOrderStatus(detail.productOrder?.placeOrderStatus);
  const normalizedStatus = normalizeSmartstoreOrderStatus(productStatus);

  if (hasActiveClaim(detail) || BLOCKED_PRODUCT_ORDER_STATUSES.has(productStatus)) {
    return {
      action: 'SKIP',
      status: 'FAILED',
      message: '취소·반품·교환·클레임 진행 중이거나 발주확인 대상이 아닌 상태입니다.',
    };
  }

  if (normalizedStatus !== 'PAYED' && productStatus !== 'PAYED') {
    return {
      action: 'SKIP',
      status: 'UNCERTAIN',
      message: '결제완료(PAYED) 상태가 아니어서 발주확인을 진행하지 않았습니다.',
    };
  }

  if (placeStatus === 'OK') {
    return {
      action: 'ALREADY_CONFIRMED',
      message: '이미 발주확인된 주문입니다.',
    };
  }

  if (placeStatus !== 'NOT_YET') {
    return {
      action: 'SKIP',
      status: 'UNCERTAIN',
      message: '발주확인 상태를 확인할 수 없어 요청하지 않았습니다.',
    };
  }

  return { action: 'CONFIRM' };
}

function buildRefreshedPayload(detail: SmartstoreProductOrderDetail): {
  standardRows: StandardOrderRow[];
  views: OrderFetchView[];
} {
  return {
    standardRows: mapSmartstoreOrdersToStandardRows([detail]).map((row) => ({ ...row })),
    views: mapSmartstoreOrdersToFetchViews([detail]),
  };
}

function emptyItemResult(
  productOrderId: string,
  status: SmartstoreConfirmItemStatus,
  message: string,
): SmartstoreConfirmItemResult {
  return {
    productOrderId,
    status,
    message,
    isReceiverAddressChanged: false,
    refreshedPlaceOrderStatus: null,
    standardRows: null,
    views: null,
  };
}

async function refetchDetailById(input: {
  productOrderId: string;
  fetchByIds: (productOrderIds: readonly string[]) => Promise<SmartstoreProductOrderDetail[]>;
}): Promise<SmartstoreProductOrderDetail | null> {
  try {
    const details = await input.fetchByIds([input.productOrderId]);
    const match = details.find((detail) => detailProductOrderId(detail) === input.productOrderId);
    return match ?? null;
  } catch {
    return null;
  }
}

async function classifyAfterAmbiguousOr104443(input: {
  productOrderId: string;
  fetchByIds: (productOrderIds: readonly string[]) => Promise<SmartstoreProductOrderDetail[]>;
  preferAlreadyConfirmedMessage?: string;
}): Promise<SmartstoreConfirmItemResult> {
  const detail = await refetchDetailById(input);
  if (!detail) {
    return emptyItemResult(
      input.productOrderId,
      'UNCERTAIN',
      '처리 결과를 확인하지 못했습니다. 주문조회 후 상태를 확인해 주세요.',
    );
  }

  const placeStatus = normalizeSmartstorePlaceOrderStatus(detail.productOrder?.placeOrderStatus);
  const payload = buildRefreshedPayload(detail);

  if (placeStatus === 'OK') {
    return {
      productOrderId: input.productOrderId,
      status: 'ALREADY_CONFIRMED',
      message: input.preferAlreadyConfirmedMessage ?? '이미 발주확인된 주문입니다.',
      isReceiverAddressChanged: false,
      refreshedPlaceOrderStatus: 'OK',
      standardRows: payload.standardRows,
      views: payload.views,
    };
  }

  return {
    productOrderId: input.productOrderId,
    status: 'UNCERTAIN',
    message: '발주확인 여부를 확인하지 못했습니다. 주문조회 후 상태를 확인해 주세요.',
    isReceiverAddressChanged: false,
    refreshedPlaceOrderStatus: placeStatus,
    standardRows: null,
    views: null,
  };
}

export const SMARTSTORE_CONFIRM_REFETCH_UNCERTAIN_MESSAGE =
  '발주확인 응답은 받았으나 현재 상태를 확인하지 못했습니다. 주문조회 후 상태를 확인해 주세요. 확인 전까지 발주확인을 다시 실행하지 마세요.';

export const SMARTSTORE_CONFIRM_ADDRESS_REFETCH_FAILED_MESSAGE =
  '배송지가 변경됐지만 최신 주문정보를 불러오지 못했습니다. 기존 택배 양식은 사용하지 말고, 주문조회 후 양식을 다시 내려받아 주세요.';

async function finalizeSuccessfulConfirm(input: {
  productOrderId: string;
  isReceiverAddressChanged: boolean;
  fetchByIds: (productOrderIds: readonly string[]) => Promise<SmartstoreProductOrderDetail[]>;
}): Promise<SmartstoreConfirmItemResult> {
  const detail = await refetchDetailById(input);
  if (!detail) {
    // 성공 응답 후 재조회 실패: CONFIRMED/ALREADY_CONFIRMED/FAILED로 단정하지 않음(재시도 유도 금지).
    if (input.isReceiverAddressChanged) {
      return {
        productOrderId: input.productOrderId,
        status: 'UNCERTAIN',
        message: SMARTSTORE_CONFIRM_ADDRESS_REFETCH_FAILED_MESSAGE,
        isReceiverAddressChanged: true,
        refreshedPlaceOrderStatus: null,
        standardRows: null,
        views: null,
      };
    }
    return emptyItemResult(
      input.productOrderId,
      'UNCERTAIN',
      SMARTSTORE_CONFIRM_REFETCH_UNCERTAIN_MESSAGE,
    );
  }

  const placeStatus = normalizeSmartstorePlaceOrderStatus(detail.productOrder?.placeOrderStatus);
  const payload = buildRefreshedPayload(detail);

  if (input.isReceiverAddressChanged) {
    return {
      productOrderId: input.productOrderId,
      status: 'ADDRESS_CHANGED',
      message:
        '배송지가 변경된 주문이 있습니다. 갱신된 정보로 택배 양식을 다시 내려받아 주세요.',
      isReceiverAddressChanged: true,
      refreshedPlaceOrderStatus: placeStatus,
      standardRows: payload.standardRows,
      views: payload.views,
    };
  }

  if (placeStatus !== 'OK') {
    return {
      productOrderId: input.productOrderId,
      status: 'UNCERTAIN',
      message: SMARTSTORE_CONFIRM_REFETCH_UNCERTAIN_MESSAGE,
      isReceiverAddressChanged: false,
      refreshedPlaceOrderStatus: placeStatus,
      standardRows: null,
      views: null,
    };
  }

  return {
    productOrderId: input.productOrderId,
    status: 'CONFIRMED',
    message: '발주확인이 완료되었습니다.',
    isReceiverAddressChanged: false,
    refreshedPlaceOrderStatus: 'OK',
    standardRows: payload.standardRows,
    views: payload.views,
  };
}

/**
 * 배송지 변경은 감지됐으나 최신 상세를 못 가져온 주문:
 * 구주소가 최신처럼 보이지 않게 가리고, 미리보기 담기(hub)를 차단한다.
 */
export function applyUnconfirmedAddressChangeGuards(input: {
  rows: StandardOrderRow[];
  views: OrderFetchView[];
  productOrderIds: ReadonlyArray<string>;
}): { rows: StandardOrderRow[]; views: OrderFetchView[] } {
  const blockedIds = new Set(
    input.productOrderIds.map((id) => id.trim()).filter(Boolean),
  );
  if (blockedIds.size === 0) {
    return { rows: input.rows, views: input.views };
  }

  const staleAddressLabel = '(배송지 변경됨 · 최신 정보 미확인 — 재조회 필요)';
  const rows = input.rows.map((row) => {
    const productOrderId = String(row['상품주문번호'] ?? '').trim();
    if (!blockedIds.has(productOrderId)) return row;
    return {
      ...row,
      받는사람주소1: staleAddressLabel,
      받는사람주소2: '',
    };
  });

  const views = input.views.map((view) => {
    if (!blockedIds.has(view.productOrderNo.trim())) return view;
    return {
      ...view,
      hubEligible: false,
      detail: {
        ...view.detail,
        receiverAddress: staleAddressLabel,
      },
    };
  });

  return { rows, views };
}

function summarizeResults(
  requestedCount: number,
  results: SmartstoreConfirmItemResult[],
): SmartstoreConfirmRunResult {
  let confirmedCount = 0;
  let alreadyConfirmedCount = 0;
  let addressChangedCount = 0;
  let failedCount = 0;
  let uncertainCount = 0;

  for (const row of results) {
    switch (row.status) {
      case 'CONFIRMED':
        confirmedCount += 1;
        break;
      case 'ALREADY_CONFIRMED':
        alreadyConfirmedCount += 1;
        break;
      case 'ADDRESS_CHANGED':
        addressChangedCount += 1;
        break;
      case 'FAILED':
        failedCount += 1;
        break;
      default:
        uncertainCount += 1;
        break;
    }
  }

  return {
    requestedCount,
    confirmedCount,
    alreadyConfirmedCount,
    addressChangedCount,
    failedCount,
    uncertainCount,
    results,
  };
}

/**
 * 스마트스토어 명시적 발주확인 오케스트레이션.
 * - POST 직전 상세 재조회 필수
 * - PAYED+NOT_YET만 confirm POST
 * - 30건 분할, 부분 성공 보존, 자동 재시도 없음
 */
export async function runSmartstoreConfirm(input: {
  productOrderIds: readonly string[];
  fetchByIds: (productOrderIds: readonly string[]) => Promise<SmartstoreProductOrderDetail[]>;
  confirmBatch: (
    productOrderIds: readonly string[],
  ) => Promise<{ httpStatus: number; bodyText: string }>;
}): Promise<SmartstoreConfirmRunResult> {
  const productOrderIds = [...input.productOrderIds];
  const results: SmartstoreConfirmItemResult[] = [];
  const confirmTargets: string[] = [];

  // 1) POST 직전 상태 재조회(필수)
  let preflightDetails: SmartstoreProductOrderDetail[] = [];
  try {
    preflightDetails = await input.fetchByIds(productOrderIds);
  } catch {
    for (const productOrderId of productOrderIds) {
      results.push(
        emptyItemResult(
          productOrderId,
          'UNCERTAIN',
          '발주확인 전 주문 상태 조회에 실패했습니다.',
        ),
      );
    }
    return summarizeResults(productOrderIds.length, results);
  }

  const detailById = new Map<string, SmartstoreProductOrderDetail>();
  for (const detail of preflightDetails) {
    const id = detailProductOrderId(detail);
    if (id) detailById.set(id, detail);
  }

  for (const productOrderId of productOrderIds) {
    const decision = classifyConfirmPreflight(detailById.get(productOrderId) ?? null, productOrderId);
    if (decision.action === 'CONFIRM') {
      confirmTargets.push(productOrderId);
      continue;
    }
    if (decision.action === 'ALREADY_CONFIRMED') {
      const detail = detailById.get(productOrderId)!;
      const payload = buildRefreshedPayload(detail);
      results.push({
        productOrderId,
        status: 'ALREADY_CONFIRMED',
        message: decision.message,
        isReceiverAddressChanged: false,
        refreshedPlaceOrderStatus: 'OK',
        standardRows: payload.standardRows,
        views: payload.views,
      });
      continue;
    }
    results.push(emptyItemResult(productOrderId, decision.status, decision.message));
  }

  if (confirmTargets.length === 0) {
    return summarizeResults(productOrderIds.length, results);
  }

  // 2) 최대 30건씩 분할 호출. 이전 묶음 성공을 이후 실패로 덮어쓰지 않음.
  const chunks = chunkProductOrderIds(confirmTargets, SMARTSTORE_CONFIRM_MAX_BATCH);

  for (const chunk of chunks) {
    let httpStatus = 0;
    let bodyText = '';
    let transportError = false;

    try {
      const response = await input.confirmBatch(chunk);
      httpStatus = response.httpStatus;
      bodyText = response.bodyText;
    } catch {
      transportError = true;
    }

    if (transportError || isAmbiguousConfirmHttpStatus(httpStatus)) {
      for (const productOrderId of chunk) {
        results.push(
          await classifyAfterAmbiguousOr104443({
            productOrderId,
            fetchByIds: input.fetchByIds,
          }),
        );
      }
      continue;
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      for (const productOrderId of chunk) {
        results.push(
          emptyItemResult(productOrderId, 'FAILED', '발주확인 요청이 거부되었습니다.'),
        );
      }
      continue;
    }

    const parsed = parseSmartstoreConfirmResponse(bodyText);
    if (!parsed.structureValid) {
      for (const productOrderId of chunk) {
        results.push(
          await classifyAfterAmbiguousOr104443({
            productOrderId,
            fetchByIds: input.fetchByIds,
          }),
        );
      }
      continue;
    }

    const successById = new Map(
      parsed.successProductOrderInfos.map((row) => [row.productOrderId, row]),
    );
    const failById = new Map(parsed.failProductOrderInfos.map((row) => [row.productOrderId, row]));

    for (const productOrderId of chunk) {
      const success = successById.get(productOrderId);
      if (success) {
        results.push(
          await finalizeSuccessfulConfirm({
            productOrderId,
            isReceiverAddressChanged: success.isReceiverAddressChanged,
            fetchByIds: input.fetchByIds,
          }),
        );
        continue;
      }

      const fail = failById.get(productOrderId);
      if (fail?.code === SMARTSTORE_ALREADY_CONFIRMED_CODE) {
        results.push(
          await classifyAfterAmbiguousOr104443({
            productOrderId,
            fetchByIds: input.fetchByIds,
            preferAlreadyConfirmedMessage: sanitizeConfirmUserMessage(
              fail.message,
              '이미 발주확인된 주문입니다.',
            ),
          }),
        );
        continue;
      }

      if (fail) {
        results.push(
          emptyItemResult(
            productOrderId,
            'FAILED',
            sanitizeConfirmUserMessage(fail.message, '발주확인에 실패했습니다.'),
          ),
        );
        continue;
      }

      // 응답에 해당 ID가 없으면 성공으로 추정하지 않음.
      results.push(
        await classifyAfterAmbiguousOr104443({
          productOrderId,
          fetchByIds: input.fetchByIds,
        }),
      );
    }
  }

  // 요청 순서 유지
  const byId = new Map(results.map((row) => [row.productOrderId, row]));
  const ordered = productOrderIds
    .map((id) => byId.get(id))
    .filter((row): row is SmartstoreConfirmItemResult => Boolean(row));

  return summarizeResults(productOrderIds.length, ordered);
}

/** 상품주문번호 기준으로 조회 결과 행·뷰를 최신 데이터로 교체하고 rowIndex를 재부여한다. */
export function mergeSmartstoreRefetchedOrdersIntoFetchResult(input: {
  rows: StandardOrderRow[];
  views: OrderFetchView[];
  patches: ReadonlyArray<{
    productOrderId: string;
    standardRows: StandardOrderRow[];
    views: OrderFetchView[];
  }>;
}): { rows: StandardOrderRow[]; views: OrderFetchView[] } {
  let rows = [...input.rows];
  let views = [...input.views];

  for (const patch of input.patches) {
    const productOrderId = patch.productOrderId.trim();
    if (!productOrderId) continue;

    const remainingIndexes: number[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const rowProductOrderId = String(rows[index]?.['상품주문번호'] ?? '').trim();
      if (rowProductOrderId !== productOrderId) remainingIndexes.push(index);
    }

    const keptRows = remainingIndexes.map((index) => rows[index]!);
    const keptViews = remainingIndexes.map((index) => views[index]!);
    rows = [...keptRows, ...patch.standardRows];
    views = [...keptViews, ...patch.views];
  }

  const reindexedViews = views.map((view, rowIndex) => ({
    ...view,
    rowIndex,
  }));

  return { rows, views: reindexedViews };
}
