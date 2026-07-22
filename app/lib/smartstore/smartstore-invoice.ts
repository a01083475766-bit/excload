import {
  SMARTSTORE_DISPATCH_MAX_BATCH,
  SMARTSTORE_DISPATCH_PATH,
  formatSmartstoreApiDateTime,
  type SmartstoreDispatchProductOrderRequest,
  type SmartstoreProductOrderDetail,
} from '@/app/lib/smartstore/client';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';
import {
  normalizeSmartstoreOrderStatus,
  normalizeSmartstorePlaceOrderStatus,
} from '@/app/lib/order-integration/order-status';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import { normalizeFingerprintTrackingNumber } from '@/app/lib/order-integration/transmission/fingerprint';

export { SMARTSTORE_DISPATCH_MAX_BATCH, SMARTSTORE_DISPATCH_PATH };

const AMBIGUOUS_HTTP_STATUSES = new Set([429, 500, 502, 503, 504, 521]);

const BLOCKED_PRODUCT_ORDER_STATUSES = new Set([
  'CANCELED',
  'CANCELED_BY_NOPAYMENT',
  'RETURNED',
  'EXCHANGED',
  'PAYMENT_WAITING',
]);

const ALREADY_SHIPPED_STATUSES = new Set(['DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED']);

export type SmartstoreInvoiceOutcomeKind = 'success' | 'failure' | 'unknown';

export type SmartstoreDispatchParsedResponse = {
  successProductOrderIds: string[];
  failProductOrderInfos: Array<{
    productOrderId: string;
    code: string | null;
    message: string;
  }>;
  structureValid: boolean;
};

export type SmartstoreInvoiceItemStatus =
  | 'DISPATCHED'
  | 'ALREADY_DISPATCHED'
  | 'ORDER_CONFIRMATION_REQUIRED'
  | 'ORDER_STATE_NOT_ELIGIBLE'
  | 'QUANTITY_UNCLEAR'
  | 'FAILED'
  | 'UNCERTAIN';

export type SmartstoreInvoiceItemResult = {
  productOrderId: string;
  status: SmartstoreInvoiceItemStatus;
  message: string;
};

export type SmartstoreInvoiceTransmitResult = {
  outcomeKind: SmartstoreInvoiceOutcomeKind;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: false;
  providerRequestId: string | null;
  responseSummary: {
    httpStatus: number | null;
    providerStatusCode: string | null;
    message: string | null;
  };
  itemResults: SmartstoreInvoiceItemResult[];
};

function asTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function sanitizeMessage(raw: string | null | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  return sanitizePublicIntegrationErrorMessage(raw, fallback);
}

export function isAmbiguousDispatchHttpStatus(httpStatus: number): boolean {
  return AMBIGUOUS_HTTP_STATUSES.has(httpStatus) || httpStatus === 0;
}

export function isSafeSmartstoreTrackingNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false;
  return /^[0-9A-Za-z\-]+$/.test(trimmed);
}

/** mallLineItemIds에서 productOrderId만 추출(중복 제거). bundle: 제외. */
export function extractSmartstoreDispatchProductOrderIds(
  mallLineItemIds: readonly string[] | null | undefined,
): string[] {
  if (!mallLineItemIds?.length) return [];
  const ids = new Set<string>();
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (!value || value.startsWith('bundle:')) continue;
    ids.add(value);
  }
  return [...ids];
}

export function chunkDispatchItems<T>(items: readonly T[], size = SMARTSTORE_DISPATCH_MAX_BATCH): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function buildSmartstoreDispatchDate(now: Date = new Date()): string {
  return formatSmartstoreApiDateTime(now);
}

export function resolveSmartstoreDeliveryCompanyCode(input: {
  courierCode: string | null;
  courierName: string | null;
}): { ok: true; deliveryCompanyCode: string } | { ok: false; message: string } {
  const deliveryCompanyCode = resolveProviderCourierCode({
    provider: 'SMARTSTORE',
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!deliveryCompanyCode) {
    return {
      ok: false,
      message: '스마트스토어에서 지원하지 않는 택배사입니다. 택배사를 확인해 주세요.',
    };
  }
  // CH1은 해외출고 전용 — 일반 fallback으로 쓰지 않음.
  if (deliveryCompanyCode === 'CH1') {
    return {
      ok: false,
      message: '스마트스토어에서 지원하지 않는 택배사입니다. 택배사를 확인해 주세요.',
    };
  }
  return { ok: true, deliveryCompanyCode };
}

function hasActiveClaim(detail: SmartstoreProductOrderDetail): boolean {
  const productOrder = detail.productOrder;
  if (!productOrder) return false;
  const claimType = asTrimmedString(productOrder.claimType).toUpperCase();
  if (claimType === 'CANCEL' || claimType === 'RETURN' || claimType === 'EXCHANGE') return true;
  const claimStatus = asTrimmedString(productOrder.claimStatus).toUpperCase();
  if (claimStatus && claimStatus !== 'NONE') return true;
  const current = productOrder.currentClaim;
  if (!current) return false;
  return (
    (current.cancel?.requestQuantity ?? 0) > 0 ||
    (current.return?.requestQuantity ?? 0) > 0 ||
    (current.exchange?.requestQuantity ?? 0) > 0
  );
}

function detailProductOrderId(detail: SmartstoreProductOrderDetail): string {
  return asTrimmedString(detail.productOrder?.productOrderId);
}

function normalizeTracking(value: string | null | undefined): string {
  return normalizeFingerprintTrackingNumber(value ?? '');
}

function deliveryTrackingOf(detail: SmartstoreProductOrderDetail): string {
  return normalizeTracking(detail.delivery?.trackingNumber);
}

function deliveryCompanyCodeOf(detail: SmartstoreProductOrderDetail): string {
  return asTrimmedString(detail.delivery?.deliveryCompanyCode).toUpperCase();
}

export type SmartstoreDispatchPreflightDecision =
  | { action: 'DISPATCH' }
  | { action: 'ALREADY_DISPATCHED'; message: string }
  | {
      action: 'BLOCK';
      status: Exclude<SmartstoreInvoiceItemStatus, 'DISPATCHED' | 'ALREADY_DISPATCHED'>;
      errorCode: string;
      message: string;
    };

/**
 * 발송처리 POST 직전 상태 판정.
 * PAYED + placeOrderStatus=OK + 클레임 없음만 DISPATCH.
 * NOT_YET → ORDER_CONFIRMATION_REQUIRED (자동 confirm 금지).
 */
export function classifySmartstoreDispatchPreflight(input: {
  detail: SmartstoreProductOrderDetail | null;
  requestedProductOrderId: string;
  expectedMallOrderNo: string;
  requestedTrackingNumber: string;
  requestedDeliveryCompanyCode: string;
}): SmartstoreDispatchPreflightDecision {
  const { detail, requestedProductOrderId } = input;
  if (!detail) {
    return {
      action: 'BLOCK',
      status: 'FAILED',
      errorCode: 'PRODUCT_ORDER_NOT_FOUND',
      message: '상품주문을 확인하지 못했습니다. 권한이 없거나 존재하지 않는 번호일 수 있습니다.',
    };
  }

  const actualId = detailProductOrderId(detail);
  if (!actualId || actualId !== requestedProductOrderId) {
    return {
      action: 'BLOCK',
      status: 'FAILED',
      errorCode: 'PRODUCT_ORDER_ID_MISMATCH',
      message: '상품주문번호 연결이 불명확하여 송장 전송을 진행하지 않았습니다.',
    };
  }

  const orderId = asTrimmedString(detail.order?.orderId);
  if (input.expectedMallOrderNo.trim() && orderId && orderId !== input.expectedMallOrderNo.trim()) {
    return {
      action: 'BLOCK',
      status: 'FAILED',
      errorCode: 'ORDER_ID_MISMATCH',
      message: '조회한 주문번호가 전송 대상과 일치하지 않습니다.',
    };
  }

  const productStatus = asTrimmedString(detail.productOrder?.productOrderStatus).toUpperCase();
  const placeStatus = normalizeSmartstorePlaceOrderStatus(detail.productOrder?.placeOrderStatus);
  const normalized = normalizeSmartstoreOrderStatus(productStatus);

  if (hasActiveClaim(detail) || BLOCKED_PRODUCT_ORDER_STATUSES.has(productStatus)) {
    return {
      action: 'BLOCK',
      status: 'ORDER_STATE_NOT_ELIGIBLE',
      errorCode: 'ORDER_STATE_NOT_ELIGIBLE',
      message: '취소·반품·교환·클레임 진행 중이거나 송장 전송 대상이 아닌 상태입니다.',
    };
  }

  if (ALREADY_SHIPPED_STATUSES.has(productStatus)) {
    const remoteTracking = deliveryTrackingOf(detail);
    const requestedTracking = normalizeTracking(input.requestedTrackingNumber);
    const remoteCompany = deliveryCompanyCodeOf(detail);
    const requestedCompany = input.requestedDeliveryCompanyCode.trim().toUpperCase();
    const trackingMatches = Boolean(remoteTracking) && remoteTracking === requestedTracking;
    const companyMatches =
      !remoteCompany || !requestedCompany || remoteCompany === requestedCompany;

    if (trackingMatches && companyMatches) {
      return {
        action: 'ALREADY_DISPATCHED',
        message: '이미 동일 송장정보로 발송 처리된 주문입니다.',
      };
    }
    return {
      action: 'BLOCK',
      status: 'UNCERTAIN',
      errorCode: 'DISPATCH_STATE_CONFLICT',
      message:
        '이미 발송 이후 상태이지만 송장정보가 일치하지 않아 확인이 필요합니다. 자동으로 다시 전송하지 않습니다.',
    };
  }

  if (placeStatus === 'NOT_YET') {
    return {
      action: 'BLOCK',
      status: 'ORDER_CONFIRMATION_REQUIRED',
      errorCode: 'ORDER_CONFIRMATION_REQUIRED',
      message:
        '발주확인이 필요합니다. 주문조회 화면에서 발주확인을 먼저 진행한 뒤 송장을 전송해 주세요.',
    };
  }

  if (normalized !== 'PAYED' && productStatus !== 'PAYED') {
    return {
      action: 'BLOCK',
      status: 'ORDER_STATE_NOT_ELIGIBLE',
      errorCode: 'ORDER_STATE_NOT_ELIGIBLE',
      message: '결제완료(PAYED) 상태가 아니어서 송장 전송을 진행하지 않았습니다.',
    };
  }

  if (placeStatus !== 'OK') {
    return {
      action: 'BLOCK',
      status: 'UNCERTAIN',
      errorCode: 'PROVIDER_STATUS_UNKNOWN',
      message: '발주확인 상태를 확인할 수 없어 송장 전송을 진행하지 않았습니다.',
    };
  }

  const remain = detail.productOrder?.remainQuantity;
  if (remain == null || typeof remain !== 'number' || !Number.isFinite(remain)) {
    return {
      action: 'BLOCK',
      status: 'QUANTITY_UNCLEAR',
      errorCode: 'QUANTITY_UNCLEAR',
      message:
        '발송 가능 수량(remainQuantity)을 확인할 수 없어 송장 전송을 진행하지 않았습니다.',
    };
  }
  if (remain < 1) {
    return {
      action: 'BLOCK',
      status: 'ORDER_STATE_NOT_ELIGIBLE',
      errorCode: 'ORDER_STATE_NOT_ELIGIBLE',
      message: '발송 가능 수량이 없어 송장 전송을 진행하지 않았습니다.',
    };
  }

  return { action: 'DISPATCH' };
}

export function parseSmartstoreDispatchResponse(bodyText: string): SmartstoreDispatchParsedResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { successProductOrderIds: [], failProductOrderInfos: [], structureValid: false };
  }

  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  if (!root) {
    return { successProductOrderIds: [], failProductOrderInfos: [], structureValid: false };
  }

  const record = root as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;
  if (!data) {
    return { successProductOrderIds: [], failProductOrderInfos: [], structureValid: false };
  }

  // confirm 응답(successProductOrderInfos)과 혼동 금지.
  if ('successProductOrderInfos' in data && !('successProductOrderIds' in data)) {
    return { successProductOrderIds: [], failProductOrderInfos: [], structureValid: false };
  }

  const successRaw = data.successProductOrderIds;
  const failRaw = data.failProductOrderInfos;
  if (!Array.isArray(successRaw) || !Array.isArray(failRaw)) {
    return { successProductOrderIds: [], failProductOrderInfos: [], structureValid: false };
  }

  const successProductOrderIds: string[] = [];
  for (const entry of successRaw) {
    const id = asTrimmedString(entry);
    if (id) successProductOrderIds.push(id);
  }

  const failProductOrderInfos: SmartstoreDispatchParsedResponse['failProductOrderInfos'] = [];
  for (const entry of failRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const productOrderId = asTrimmedString(row.productOrderId);
    if (!productOrderId) continue;
    failProductOrderInfos.push({
      productOrderId,
      code: asTrimmedString(row.code) || null,
      message: sanitizeMessage(asTrimmedString(row.message) || null, '송장 전송에 실패했습니다.'),
    });
  }

  return { successProductOrderIds, failProductOrderInfos, structureValid: true };
}

function failureResult(input: {
  errorCode: string;
  errorMessage: string;
  outcomeKind?: SmartstoreInvoiceOutcomeKind;
  httpStatus?: number | null;
  itemResults?: SmartstoreInvoiceItemResult[];
}): SmartstoreInvoiceTransmitResult {
  return {
    outcomeKind: input.outcomeKind ?? 'failure',
    success: false,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryable: false,
    providerRequestId: null,
    responseSummary: {
      httpStatus: input.httpStatus ?? null,
      providerStatusCode: input.errorCode,
      message: input.errorMessage,
    },
    itemResults: input.itemResults ?? [],
  };
}

async function confirmDispatchByRefetch(input: {
  productOrderId: string;
  requestedTrackingNumber: string;
  requestedDeliveryCompanyCode: string;
  fetchByIds: (productOrderIds: readonly string[]) => Promise<SmartstoreProductOrderDetail[]>;
}): Promise<SmartstoreInvoiceItemResult> {
  try {
    const details = await input.fetchByIds([input.productOrderId]);
    const detail = details.find((row) => detailProductOrderId(row) === input.productOrderId);
    if (!detail) {
      return {
        productOrderId: input.productOrderId,
        status: 'UNCERTAIN',
        message: '송장 전송 여부를 확인하지 못했습니다. 상태 확인 후 다시 조회해 주세요.',
      };
    }

    const productStatus = asTrimmedString(detail.productOrder?.productOrderStatus).toUpperCase();
    const remoteTracking = deliveryTrackingOf(detail);
    const requestedTracking = normalizeTracking(input.requestedTrackingNumber);
    const remoteCompany = deliveryCompanyCodeOf(detail);
    const requestedCompany = input.requestedDeliveryCompanyCode.trim().toUpperCase();
    const trackingMatches = Boolean(remoteTracking) && remoteTracking === requestedTracking;
    const companyMatches =
      !remoteCompany || !requestedCompany || remoteCompany === requestedCompany;

    if (ALREADY_SHIPPED_STATUSES.has(productStatus) && trackingMatches && companyMatches) {
      return {
        productOrderId: input.productOrderId,
        status: 'ALREADY_DISPATCHED',
        message: '동일 송장정보 반영이 확인되었습니다.',
      };
    }

    return {
      productOrderId: input.productOrderId,
      status: 'UNCERTAIN',
      message: '송장 전송 여부를 확인하지 못했습니다. 자동으로 다시 전송하지 않습니다.',
    };
  } catch {
    return {
      productOrderId: input.productOrderId,
      status: 'UNCERTAIN',
      message: '송장 전송 여부를 확인하지 못했습니다. 자동으로 다시 전송하지 않습니다.',
    };
  }
}

function aggregateMatchOutcome(
  itemResults: SmartstoreInvoiceItemResult[],
): Pick<
  SmartstoreInvoiceTransmitResult,
  'outcomeKind' | 'success' | 'errorCode' | 'errorMessage'
> {
  if (itemResults.length === 0) {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: 'NO_ITEMS',
      errorMessage: '송장 전송 대상 상품주문이 없습니다.',
    };
  }

  const allOk = itemResults.every(
    (row) => row.status === 'DISPATCHED' || row.status === 'ALREADY_DISPATCHED',
  );
  if (allOk) {
    return {
      outcomeKind: 'success',
      success: true,
      errorCode: null,
      errorMessage: null,
    };
  }

  const confirmation = itemResults.find((row) => row.status === 'ORDER_CONFIRMATION_REQUIRED');
  if (confirmation && itemResults.every((row) => row.status === 'ORDER_CONFIRMATION_REQUIRED' || row.status === 'ALREADY_DISPATCHED')) {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: 'ORDER_CONFIRMATION_REQUIRED',
      errorMessage: confirmation.message,
    };
  }

  const anyUncertain = itemResults.some((row) => row.status === 'UNCERTAIN');
  const anySuccess = itemResults.some(
    (row) => row.status === 'DISPATCHED' || row.status === 'ALREADY_DISPATCHED',
  );
  const anyFailed = itemResults.some(
    (row) =>
      row.status === 'FAILED' ||
      row.status === 'ORDER_STATE_NOT_ELIGIBLE' ||
      row.status === 'ORDER_CONFIRMATION_REQUIRED',
  );

  if (anyUncertain || (anySuccess && anyFailed)) {
    const message =
      itemResults.find((row) => row.status === 'UNCERTAIN')?.message ||
      '일부만 처리되었을 수 있어 확인이 필요합니다. 자동으로 다시 전송하지 않습니다.';
    return {
      outcomeKind: 'unknown',
      success: false,
      errorCode: anyUncertain ? 'UNCERTAIN' : 'PARTIAL_ERROR',
      errorMessage: message,
    };
  }

  const firstFail = itemResults.find(
    (row) =>
      row.status === 'FAILED' ||
      row.status === 'ORDER_STATE_NOT_ELIGIBLE' ||
      row.status === 'QUANTITY_UNCLEAR' ||
      row.status === 'ORDER_CONFIRMATION_REQUIRED',
  );
  return {
    outcomeKind: 'failure',
    success: false,
    errorCode:
      firstFail?.status === 'ORDER_CONFIRMATION_REQUIRED'
        ? 'ORDER_CONFIRMATION_REQUIRED'
        : firstFail?.status === 'QUANTITY_UNCLEAR'
          ? 'QUANTITY_UNCLEAR'
          : firstFail?.status === 'ORDER_STATE_NOT_ELIGIBLE'
            ? 'ORDER_STATE_NOT_ELIGIBLE'
            : 'DISPATCH_FAILED',
    errorMessage: firstFail?.message ?? '송장 전송에 실패했습니다.',
  };
}

/**
 * 스마트스토어 송장 발송처리 오케스트레이션.
 * - 자동 발주확인(confirm) 호출 금지
 * - POST 직전 상세 재조회 필수
 * - 최대 30건 분할, 부분 성공 보존, 자동 재시도 없음
 */
export async function runSmartstoreInvoiceTransmission(input: {
  mallOrderNo: string;
  mallLineItemIds: readonly string[] | null;
  courierCode: string | null;
  courierName: string | null;
  trackingNumber: string;
  fetchByIds: (productOrderIds: readonly string[]) => Promise<SmartstoreProductOrderDetail[]>;
  dispatchBatch: (
    items: ReadonlyArray<SmartstoreDispatchProductOrderRequest>,
  ) => Promise<{ httpStatus: number; bodyText: string }>;
  /** 테스트용 clock. 기본은 서버 현재 시각. */
  now?: () => Date;
}): Promise<SmartstoreInvoiceTransmitResult> {
  const productOrderIds = extractSmartstoreDispatchProductOrderIds(input.mallLineItemIds);
  if (productOrderIds.length === 0) {
    return failureResult({
      errorCode: 'PRODUCT_ORDER_ID_MISSING',
      errorMessage: '상품주문번호(productOrderId)가 없어 송장 전송할 수 없습니다.',
    });
  }

  // orderId(mallOrderNo)를 productOrderId로 쓰지 않도록 차단.
  if (productOrderIds.every((id) => id === input.mallOrderNo.trim()) && productOrderIds.length === 1) {
    // 단일 ID가 mallOrderNo와 같으면 혼동 가능성 — 재조회로 실제 productOrderId 확인.
  }

  const courier = resolveSmartstoreDeliveryCompanyCode({
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!courier.ok) {
    return failureResult({
      errorCode: 'COURIER_UNSUPPORTED',
      errorMessage: courier.message,
      itemResults: productOrderIds.map((productOrderId) => ({
        productOrderId,
        status: 'FAILED',
        message: courier.message,
      })),
    });
  }

  if (!isSafeSmartstoreTrackingNumber(input.trackingNumber)) {
    return failureResult({
      errorCode: 'TRACKING_NUMBER_INVALID',
      errorMessage: '송장번호가 올바르지 않습니다.',
    });
  }

  const trackingNumber = input.trackingNumber.trim();
  const deliveryCompanyCode = courier.deliveryCompanyCode;

  let details: SmartstoreProductOrderDetail[];
  try {
    details = await input.fetchByIds(productOrderIds);
  } catch {
    return failureResult({
      errorCode: 'PROVIDER_STATUS_UNKNOWN',
      errorMessage: '발송 전 주문 상태 조회에 실패하여 송장 전송을 중단했습니다.',
      outcomeKind: 'unknown',
      itemResults: productOrderIds.map((productOrderId) => ({
        productOrderId,
        status: 'UNCERTAIN',
        message: '발송 전 주문 상태 조회에 실패했습니다.',
      })),
    });
  }

  const detailById = new Map<string, SmartstoreProductOrderDetail>();
  for (const detail of details) {
    const id = detailProductOrderId(detail);
    if (id) detailById.set(id, detail);
  }

  const itemResults: SmartstoreInvoiceItemResult[] = [];
  const dispatchTargets: string[] = [];

  for (const productOrderId of productOrderIds) {
    const decision = classifySmartstoreDispatchPreflight({
      detail: detailById.get(productOrderId) ?? null,
      requestedProductOrderId: productOrderId,
      expectedMallOrderNo: input.mallOrderNo,
      requestedTrackingNumber: trackingNumber,
      requestedDeliveryCompanyCode: deliveryCompanyCode,
    });

    if (decision.action === 'DISPATCH') {
      dispatchTargets.push(productOrderId);
      continue;
    }
    if (decision.action === 'ALREADY_DISPATCHED') {
      itemResults.push({
        productOrderId,
        status: 'ALREADY_DISPATCHED',
        message: decision.message,
      });
      continue;
    }
    itemResults.push({
      productOrderId,
      status: decision.status,
      message: decision.message,
    });
  }

  // NOT_YET 등이 있으면 전체 POST 차단(자동 confirm 금지, fail-closed).
  const blocking = itemResults.find(
    (row) =>
      row.status === 'ORDER_CONFIRMATION_REQUIRED' ||
      row.status === 'ORDER_STATE_NOT_ELIGIBLE' ||
      row.status === 'QUANTITY_UNCLEAR' ||
      row.status === 'UNCERTAIN' ||
      row.status === 'FAILED',
  );
  if (blocking && dispatchTargets.length > 0) {
    // 일부만 가능해도 확정 불가 사유가 있으면 POST하지 않음.
    if (
      itemResults.some(
        (row) =>
          row.status === 'ORDER_CONFIRMATION_REQUIRED' ||
          row.status === 'ORDER_STATE_NOT_ELIGIBLE' ||
          row.status === 'QUANTITY_UNCLEAR' ||
          row.status === 'UNCERTAIN' ||
          (row.status === 'FAILED' && row.message.includes('불명확')),
      )
    ) {
      const blockedIds = new Set(itemResults.map((row) => row.productOrderId));
      for (const productOrderId of dispatchTargets) {
        if (blockedIds.has(productOrderId)) continue;
        itemResults.push({
          productOrderId,
          status: blocking.status,
          message: `${blocking.message} (같은 주문의 다른 상품주문 상태로 전송을 중단했습니다.)`,
        });
      }
      const aggregated = aggregateMatchOutcome(itemResults);
      return {
        ...aggregated,
        retryable: false,
        providerRequestId: null,
        responseSummary: {
          httpStatus: null,
          providerStatusCode: aggregated.errorCode,
          message: aggregated.errorMessage,
        },
        itemResults,
      };
    }
  }

  // 발주확인 필요만 있고 dispatch 대상 없음
  if (dispatchTargets.length === 0) {
    const aggregated = aggregateMatchOutcome(itemResults);
    return {
      ...aggregated,
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus: null,
        providerStatusCode: aggregated.errorCode,
        message: aggregated.errorMessage,
      },
      itemResults,
    };
  }

  const now = input.now?.() ?? new Date();
  const dispatchDate = buildSmartstoreDispatchDate(now);
  const chunks = chunkDispatchItems(dispatchTargets, SMARTSTORE_DISPATCH_MAX_BATCH);

  for (const chunk of chunks) {
    const requestItems: SmartstoreDispatchProductOrderRequest[] = chunk.map((productOrderId) => ({
      productOrderId,
      deliveryMethod: 'DELIVERY',
      deliveryCompanyCode,
      trackingNumber,
      dispatchDate,
    }));

    let httpStatus = 0;
    let bodyText = '';
    let transportError = false;

    try {
      const response = await input.dispatchBatch(requestItems);
      httpStatus = response.httpStatus;
      bodyText = response.bodyText;
    } catch {
      transportError = true;
    }

    if (transportError || isAmbiguousDispatchHttpStatus(httpStatus)) {
      for (const productOrderId of chunk) {
        itemResults.push(
          await confirmDispatchByRefetch({
            productOrderId,
            requestedTrackingNumber: trackingNumber,
            requestedDeliveryCompanyCode: deliveryCompanyCode,
            fetchByIds: input.fetchByIds,
          }),
        );
      }
      continue;
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      for (const productOrderId of chunk) {
        itemResults.push({
          productOrderId,
          status: 'FAILED',
          message: '송장 전송 요청이 거부되었습니다.',
        });
      }
      continue;
    }

    const parsed = parseSmartstoreDispatchResponse(bodyText);
    if (!parsed.structureValid) {
      for (const productOrderId of chunk) {
        itemResults.push(
          await confirmDispatchByRefetch({
            productOrderId,
            requestedTrackingNumber: trackingNumber,
            requestedDeliveryCompanyCode: deliveryCompanyCode,
            fetchByIds: input.fetchByIds,
          }),
        );
      }
      continue;
    }

    const successSet = new Set(parsed.successProductOrderIds);
    const failById = new Map(
      parsed.failProductOrderInfos.map((row) => [row.productOrderId, row]),
    );

    for (const productOrderId of chunk) {
      // 요청하지 않은 ID는 무시.
      if (successSet.has(productOrderId)) {
        // successProductOrderIds에 있으면 접수 성공으로 보존(실패·누락과 혼동 금지).
        // 동일 송장 반영 재조회는 보강이며, 반영 전이어도 성공 배열을 실패로 덮지 않음.
        const confirmed = await confirmDispatchByRefetch({
          productOrderId,
          requestedTrackingNumber: trackingNumber,
          requestedDeliveryCompanyCode: deliveryCompanyCode,
          fetchByIds: input.fetchByIds,
        });
        itemResults.push({
          productOrderId,
          status: 'DISPATCHED',
          message:
            confirmed.status === 'ALREADY_DISPATCHED'
              ? '송장 전송과 반영이 확인되었습니다.'
              : '송장 전송이 접수되었습니다.',
        });
        continue;
      }

      const fail = failById.get(productOrderId);
      if (fail) {
        // 실패 코드만으로 이미 발송 단정 금지 — 재조회로만 ALREADY 판정.
        const rechecked = await confirmDispatchByRefetch({
          productOrderId,
          requestedTrackingNumber: trackingNumber,
          requestedDeliveryCompanyCode: deliveryCompanyCode,
          fetchByIds: input.fetchByIds,
        });
        if (rechecked.status === 'ALREADY_DISPATCHED') {
          itemResults.push(rechecked);
        } else {
          itemResults.push({
            productOrderId,
            status: 'FAILED',
            message: fail.message,
          });
        }
        continue;
      }

      // 응답에서 누락 → 성공 추정 금지.
      itemResults.push(
        await confirmDispatchByRefetch({
          productOrderId,
          requestedTrackingNumber: trackingNumber,
          requestedDeliveryCompanyCode: deliveryCompanyCode,
          fetchByIds: input.fetchByIds,
        }),
      );
    }
  }

  // 요청 순서 유지
  const byId = new Map(itemResults.map((row) => [row.productOrderId, row]));
  const ordered = productOrderIds
    .map((id) => byId.get(id))
    .filter((row): row is SmartstoreInvoiceItemResult => Boolean(row));

  const aggregated = aggregateMatchOutcome(ordered);
  return {
    ...aggregated,
    retryable: false,
    providerRequestId: null,
    responseSummary: {
      httpStatus: null,
      providerStatusCode: aggregated.errorCode,
      message: aggregated.errorMessage ?? (aggregated.success ? '송장 전송이 접수되었습니다.' : null),
    },
    itemResults: ordered,
  };
}
