import {
  buildCoupangInvoiceBodyText,
  isCoupangPositiveIntegerId,
  parseCoupangJson,
  type CoupangInvoiceApplyDtoInput,
} from '@/app/lib/coupang/coupang-json';
import type { CoupangOrderItem, CoupangOrderSheet } from '@/app/lib/coupang/client';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';

export const COUPANG_INVOICE_PATH_SUFFIX = '/orders/invoices';

const AMBIGUOUS_HTTP_STATUSES = new Set([500, 502, 503, 504, 521]);
const CONFIRMED_SHIP_STATUSES = new Set(['DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY']);
const ALLOWED_SHIPMENT_TYPE = 'THIRD_PARTY';

export type CoupangInvoiceOutcomeKind = 'success' | 'failure' | 'unknown';

export type CoupangInvoiceParsedItem = {
  shipmentBoxId: string;
  succeed: boolean;
  resultCode: string | null;
  resultMessage: string | null;
  retryRequired: boolean | null;
};

export type CoupangInvoiceParsedResponse = {
  responseCode: number | null;
  responseMessage: string | null;
  responseList: CoupangInvoiceParsedItem[];
};

export type CoupangInvoiceJudgment = {
  outcomeKind: CoupangInvoiceOutcomeKind;
  errorCode: string | null;
  message: string;
  retryRequired: boolean | null;
};

export type CoupangInvoicePreflightOk = {
  ok: true;
  shipmentBoxId: string;
  orderId: string;
  vendorItemIds: string[];
  deliveryCompanyCode: string;
  invoiceNumber: string;
  sheet: CoupangOrderSheet;
};

export type CoupangInvoicePreflightFail = {
  ok: false;
  errorCode: string;
  message: string;
};

export type CoupangInvoiceTransmitResult = {
  outcomeKind: CoupangInvoiceOutcomeKind;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  providerRequestId: string | null;
  responseSummary: {
    httpStatus: number | null;
    providerStatusCode: string | null;
    message: string | null;
  };
  /** 요청한 송장번호 — verify 보강용 (PII 아님) */
  requestedInvoiceNumber: string | null;
  requestedShipmentBoxId: string | null;
};

function asTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return 0;
}

export function buildCoupangInvoicePath(vendorId: string): string {
  return `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(vendorId.trim())}${COUPANG_INVOICE_PATH_SUFFIX}`;
}

export function isAmbiguousInvoiceHttpStatus(httpStatus: number): boolean {
  return AMBIGUOUS_HTTP_STATUSES.has(httpStatus) || httpStatus === 0;
}

export function isConfirmedCoupangShipStatus(status: string | null | undefined): boolean {
  return CONFIRMED_SHIP_STATUSES.has((status ?? '').trim().toUpperCase());
}

/**
 * candidate.mallLineItemIds 의 bundle: 접두에서 unique shipmentBoxId 추출.
 */
export function extractUniqueShipmentBoxIdsFromMallLineItemIds(
  mallLineItemIds: readonly string[] | null | undefined,
): string[] {
  if (!mallLineItemIds?.length) return [];
  const ids = new Set<string>();
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (!value.startsWith('bundle:')) continue;
    const boxId = value.slice('bundle:'.length).trim();
    if (boxId) ids.add(boxId);
  }
  return [...ids];
}

export function requireSingleShipmentBoxId(
  mallLineItemIds: readonly string[] | null | undefined,
): { ok: true; shipmentBoxId: string } | { ok: false; message: string } {
  const ids = extractUniqueShipmentBoxIdsFromMallLineItemIds(mallLineItemIds);
  if (ids.length === 0) {
    return {
      ok: false,
      message: '쿠팡 묶음배송 번호가 없어 자동 전송할 수 없습니다.',
    };
  }
  if (ids.length > 1) {
    return {
      ok: false,
      message: '쿠팡 묶음배송 번호가 여러 개여서 현재 자동 전송할 수 없습니다.',
    };
  }
  const shipmentBoxId = ids[0]!;
  if (!isCoupangPositiveIntegerId(shipmentBoxId)) {
    return {
      ok: false,
      message: '쿠팡 묶음배송 번호 형식이 올바르지 않습니다.',
    };
  }
  return { ok: true, shipmentBoxId };
}

export function computeShipableQuantity(item: CoupangOrderItem): number {
  const shippingCount = toNonNegativeInt(item.shippingCount);
  const hold = toNonNegativeInt(item.holdCountForCancel);
  const cancel = toNonNegativeInt(item.cancelCount);
  return shippingCount - (hold + cancel);
}

/**
 * 전송 직전 orderItems 기준 발송 가능 vendorItemId 목록.
 */
export function collectShipableVendorItemIds(
  items: readonly CoupangOrderItem[] | null | undefined,
): { ok: true; vendorItemIds: string[] } | { ok: false; errorCode: string; message: string } {
  if (!items?.length) {
    return {
      ok: false,
      errorCode: 'ORDER_ITEMS_MISSING',
      message: '주문 상품 정보를 확인할 수 없습니다.',
    };
  }

  const vendorItemIds: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (toNonNegativeInt(item.holdCountForCancel) > 0) {
      return {
        ok: false,
        errorCode: 'CANCEL_HOLD_PRESENT',
        message: '취소 대기 상품이 있어 송장 전송할 수 없습니다.',
      };
    }

    if (item.canceled === true) continue;
    if (computeShipableQuantity(item) <= 0) continue;

    const vendorItemId = asTrimmedString(item.vendorItemId);
    if (!vendorItemId || !isCoupangPositiveIntegerId(vendorItemId)) {
      return {
        ok: false,
        errorCode: 'VENDOR_ITEM_ID_INVALID',
        message: '상품 옵션 식별자가 올바르지 않아 송장 전송할 수 없습니다.',
      };
    }
    if (seen.has(vendorItemId)) continue;
    seen.add(vendorItemId);
    vendorItemIds.push(vendorItemId);
  }

  if (vendorItemIds.length === 0) {
    return {
      ok: false,
      errorCode: 'NO_SHIPABLE_ITEMS',
      message: '발송 가능한 상품이 없어 송장 전송할 수 없습니다.',
    };
  }

  return { ok: true, vendorItemIds };
}

export function isSafeInvoiceNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 64) return false;
  // 제어문자·공백 포함 금지. 앞자리 0 허용.
  return /^[0-9A-Za-z\-]+$/.test(trimmed);
}

export function evaluateCoupangInvoicePreflight(input: {
  sheet: CoupangOrderSheet;
  expectedShipmentBoxId: string;
  expectedOrderId: string;
  courierCode: string | null;
  courierName: string | null;
  invoiceNumber: string;
}): CoupangInvoicePreflightOk | CoupangInvoicePreflightFail {
  const sheetBoxId = asTrimmedString(input.sheet.shipmentBoxId);
  if (!sheetBoxId || sheetBoxId !== input.expectedShipmentBoxId) {
    return {
      ok: false,
      errorCode: 'SHIPMENT_BOX_MISMATCH',
      message: '조회한 묶음배송 번호가 전송 대상과 일치하지 않습니다.',
    };
  }

  const sheetOrderId = asTrimmedString(input.sheet.orderId);
  if (!sheetOrderId || sheetOrderId !== input.expectedOrderId.trim()) {
    return {
      ok: false,
      errorCode: 'ORDER_ID_MISMATCH',
      message: '조회한 주문번호가 전송 대상과 일치하지 않습니다.',
    };
  }
  if (!isCoupangPositiveIntegerId(sheetOrderId)) {
    return {
      ok: false,
      errorCode: 'ORDER_ID_INVALID',
      message: '주문번호 형식이 올바르지 않습니다.',
    };
  }

  const status = asTrimmedString(input.sheet.status).toUpperCase();
  if (status !== 'INSTRUCT') {
    return {
      ok: false,
      errorCode: 'INVALID_STATUS',
      message: '상품준비중(INSTRUCT) 상태의 주문만 송장 전송할 수 있습니다.',
    };
  }

  if (input.sheet.splitShipping === true) {
    return {
      ok: false,
      errorCode: 'SPLIT_SHIPPING_BLOCKED',
      message: '분리배송 주문은 현재 자동 전송할 수 없습니다.',
    };
  }

  const shipmentType = asTrimmedString(input.sheet.shipmentType).toUpperCase();
  if (shipmentType !== ALLOWED_SHIPMENT_TYPE) {
    return {
      ok: false,
      errorCode: 'SHIPMENT_TYPE_UNSUPPORTED',
      message: '지원하지 않는 배송 유형이라 자동 전송할 수 없습니다.',
    };
  }

  const existingInvoice = asTrimmedString(input.sheet.invoiceNumber);
  if (existingInvoice) {
    return {
      ok: false,
      errorCode: 'INVOICE_ALREADY_PRESENT',
      message: '이미 송장번호가 등록된 주문입니다.',
    };
  }

  const itemsResult = collectShipableVendorItemIds(input.sheet.orderItems);
  if (!itemsResult.ok) {
    return {
      ok: false,
      errorCode: itemsResult.errorCode,
      message: itemsResult.message,
    };
  }

  const deliveryCompanyCode = resolveProviderCourierCode({
    provider: 'COUPANG',
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!deliveryCompanyCode) {
    return {
      ok: false,
      errorCode: 'COURIER_UNSUPPORTED',
      message: '쿠팡에서 지원하지 않는 택배사입니다. 택배사를 확인해 주세요.',
    };
  }

  if (!isSafeInvoiceNumber(input.invoiceNumber)) {
    return {
      ok: false,
      errorCode: 'INVOICE_NUMBER_INVALID',
      message: '송장번호가 올바르지 않습니다.',
    };
  }

  return {
    ok: true,
    shipmentBoxId: sheetBoxId,
    orderId: sheetOrderId,
    vendorItemIds: itemsResult.vendorItemIds,
    deliveryCompanyCode,
    invoiceNumber: input.invoiceNumber.trim(),
    sheet: input.sheet,
  };
}

export function buildCoupangInvoiceDtos(input: {
  shipmentBoxId: string;
  orderId: string;
  vendorItemIds: readonly string[];
  deliveryCompanyCode: string;
  invoiceNumber: string;
}): CoupangInvoiceApplyDtoInput[] {
  return input.vendorItemIds.map((vendorItemId) => ({
    shipmentBoxId: input.shipmentBoxId,
    orderId: input.orderId,
    vendorItemId,
    deliveryCompanyCode: input.deliveryCompanyCode,
    invoiceNumber: input.invoiceNumber,
    splitShipping: false,
    preSplitShipped: false,
    estimatedShippingDate: '',
  }));
}

export function buildCoupangInvoiceRequestBodyText(input: {
  vendorId: string;
  shipmentBoxId: string;
  orderId: string;
  vendorItemIds: readonly string[];
  deliveryCompanyCode: string;
  invoiceNumber: string;
}): string {
  return buildCoupangInvoiceBodyText({
    vendorId: input.vendorId,
    orderSheetInvoiceApplyDtos: buildCoupangInvoiceDtos(input),
  });
}

function extractInvoicePayload(parsed: unknown): CoupangInvoiceParsedResponse {
  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const record = root as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : record;

  const responseCodeRaw = data.responseCode ?? record.responseCode;
  let responseCode: number | null = null;
  if (typeof responseCodeRaw === 'number' && Number.isFinite(responseCodeRaw)) {
    responseCode = responseCodeRaw;
  } else if (typeof responseCodeRaw === 'string' && /^-?\d+$/.test(responseCodeRaw.trim())) {
    responseCode = Number.parseInt(responseCodeRaw.trim(), 10);
  }

  const responseMessage = asTrimmedString(data.responseMessage ?? record.responseMessage) || null;
  const listRaw = data.responseList ?? record.responseList;
  const responseList: CoupangInvoiceParsedItem[] = [];

  if (Array.isArray(listRaw)) {
    for (const entry of listRaw) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const shipmentBoxId = asTrimmedString(row.shipmentBoxId);
      if (!shipmentBoxId) continue;
      responseList.push({
        shipmentBoxId,
        succeed: row.succeed === true,
        resultCode: asTrimmedString(row.resultCode) || null,
        resultMessage: asTrimmedString(row.resultMessage) || null,
        retryRequired: typeof row.retryRequired === 'boolean' ? row.retryRequired : null,
      });
    }
  }

  return { responseCode, responseMessage, responseList };
}

export function parseCoupangInvoiceResponse(bodyText: string): CoupangInvoiceParsedResponse {
  const parsed = parseCoupangJson(bodyText);
  return extractInvoicePayload(parsed);
}

export function judgeCoupangInvoiceHttpResponse(input: {
  httpStatus: number;
  bodyText: string;
  requestedShipmentBoxId: string;
}): CoupangInvoiceJudgment {
  if (isAmbiguousInvoiceHttpStatus(input.httpStatus)) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'AMBIGUOUS_HTTP',
      message: '송장 전송 결과가 불명확합니다. 상태 확인 후 다시 시도해 주세요.',
      retryRequired: null,
    };
  }

  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return {
      outcomeKind: 'failure',
      errorCode: 'HTTP_ERROR',
      message: '송장 전송 요청이 거부되었습니다.',
      retryRequired: null,
    };
  }

  let parsed: CoupangInvoiceParsedResponse;
  try {
    parsed = parseCoupangInvoiceResponse(input.bodyText);
  } catch {
    return {
      outcomeKind: 'unknown',
      errorCode: 'MALFORMED_RESPONSE',
      message: '송장 전송 응답을 해석하지 못했습니다.',
      retryRequired: null,
    };
  }

  return judgeCoupangInvoiceParsedResponse({
    parsed,
    requestedShipmentBoxId: input.requestedShipmentBoxId,
  });
}

export function judgeCoupangInvoiceParsedResponse(input: {
  parsed: CoupangInvoiceParsedResponse;
  requestedShipmentBoxId: string;
}): CoupangInvoiceJudgment {
  const { parsed, requestedShipmentBoxId } = input;
  const anyRetry = parsed.responseList.some((row) => row.retryRequired === true);

  if (parsed.responseCode === null) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'RESPONSE_CODE_MISSING',
      message: '송장 전송 결과 코드를 확인하지 못했습니다.',
      retryRequired: anyRetry || null,
    };
  }

  if (parsed.responseCode === -1) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'RESPONSE_NONE',
      message: '송장 전송 결과가 확인되지 않습니다.',
      retryRequired: anyRetry || null,
    };
  }

  if (!parsed.responseList.length) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'RESPONSE_LIST_EMPTY',
      message: '송장 전송 개별 결과가 없습니다.',
      retryRequired: anyRetry || null,
    };
  }

  const unexpected = parsed.responseList.some(
    (row) => row.shipmentBoxId !== requestedShipmentBoxId,
  );
  if (unexpected) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'RESPONSE_ID_MISMATCH',
      message: '송장 전송 응답의 묶음배송 번호가 요청과 일치하지 않습니다.',
      retryRequired: anyRetry || null,
    };
  }

  const allOk = parsed.responseList.every(
    (row) => row.succeed === true && row.resultCode === 'OK',
  );
  const allFailed = parsed.responseList.every(
    (row) => row.succeed !== true || row.resultCode !== 'OK',
  );

  if (parsed.responseCode === 0) {
    if (allOk) {
      return {
        outcomeKind: 'success',
        errorCode: null,
        message: '송장 전송이 접수되었습니다.',
        retryRequired: anyRetry || null,
      };
    }
    return {
      outcomeKind: 'unknown',
      errorCode: 'RESPONSE_INCONSISTENT',
      message: '송장 전송 응답이 일치하지 않아 확인이 필요합니다.',
      retryRequired: anyRetry || null,
    };
  }

  if (parsed.responseCode === 1) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'PARTIAL_ERROR',
      message: '일부만 처리되었을 수 있어 확인이 필요합니다. 자동으로 다시 전송하지 않습니다.',
      retryRequired: anyRetry || null,
    };
  }

  if (parsed.responseCode === 99) {
    if (allFailed && !allOk) {
      const firstMessage =
        parsed.responseList.find((row) => row.resultMessage)?.resultMessage ||
        parsed.responseMessage ||
        '송장 전송에 실패했습니다.';
      return {
        outcomeKind: 'failure',
        errorCode: parsed.responseList[0]?.resultCode || 'FAILED',
        message: firstMessage,
        retryRequired: anyRetry || null,
      };
    }
    return {
      outcomeKind: 'unknown',
      errorCode: 'FAILED_INCONSISTENT',
      message: '송장 전송 실패 응답이 불명확하여 확인이 필요합니다.',
      retryRequired: anyRetry || null,
    };
  }

  if (!allOk && !allFailed) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'MIXED_RESULTS',
      message: '송장 전송 결과가 혼재되어 확인이 필요합니다.',
      retryRequired: anyRetry || null,
    };
  }

  return {
    outcomeKind: 'unknown',
    errorCode: 'UNKNOWN_RESPONSE_CODE',
    message: '알 수 없는 송장 전송 결과입니다.',
    retryRequired: anyRetry || null,
  };
}

export function confirmInvoiceByRefetch(input: {
  sheet: CoupangOrderSheet;
  requestedInvoiceNumber: string;
  /** POST 직전 preflight에서 INSTRUCT였는지 */
  wasInstructBeforePost: boolean;
}): CoupangInvoiceJudgment {
  if (!input.wasInstructBeforePost) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'PRE_STATUS_INVALID',
      message: '전송 전 상태를 확인할 수 없어 결과를 확정하지 않습니다.',
      retryRequired: null,
    };
  }

  const status = asTrimmedString(input.sheet.status).toUpperCase();
  const invoice = asTrimmedString(input.sheet.invoiceNumber);

  if (!isConfirmedCoupangShipStatus(status)) {
    if (status === 'INSTRUCT') {
      return {
        outcomeKind: 'unknown',
        errorCode: 'STILL_INSTRUCT',
        message: '송장 반영 여부를 확인할 수 없습니다. 상태 확인 후 다시 시도해 주세요.',
        retryRequired: null,
      };
    }
    return {
      outcomeKind: 'unknown',
      errorCode: 'UNEXPECTED_STATUS',
      message: '예상하지 못한 주문 상태라 전송 결과를 확정하지 않습니다.',
      retryRequired: null,
    };
  }

  if (!invoice) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'INVOICE_MISSING_AFTER',
      message: '재조회에서 송장번호를 확인하지 못했습니다.',
      retryRequired: null,
    };
  }

  if (invoice !== input.requestedInvoiceNumber.trim()) {
    return {
      outcomeKind: 'unknown',
      errorCode: 'INVOICE_MISMATCH',
      message: '재조회 송장번호가 요청과 일치하지 않습니다.',
      retryRequired: null,
    };
  }

  return {
    outcomeKind: 'success',
    errorCode: null,
    message: '송장 전송과 반영이 확인되었습니다.',
    retryRequired: null,
  };
}

export async function runCoupangInvoiceTransmission(input: {
  vendorId: string;
  accessKey: string;
  secretKey: string;
  mallOrderNo: string;
  mallLineItemIds: readonly string[] | null;
  courierCode: string | null;
  courierName: string | null;
  invoiceNumber: string;
  fetchByBoxId: (shipmentBoxId: string) => Promise<CoupangOrderSheet>;
  postInvoices: (bodyText: string) => Promise<{ httpStatus: number; bodyText: string }>;
}): Promise<CoupangInvoiceTransmitResult> {
  const boxResult = requireSingleShipmentBoxId(input.mallLineItemIds);
  if (!boxResult.ok) {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: 'SHIPMENT_BOX_COUNT',
      errorMessage: boxResult.message,
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus: null,
        providerStatusCode: 'SHIPMENT_BOX_COUNT',
        message: boxResult.message,
      },
      requestedInvoiceNumber: null,
      requestedShipmentBoxId: null,
    };
  }

  const shipmentBoxId = boxResult.shipmentBoxId;
  const invoiceNumber = input.invoiceNumber.trim();

  let sheet: CoupangOrderSheet;
  try {
    sheet = await input.fetchByBoxId(shipmentBoxId);
  } catch {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: 'PREFLIGHT_FETCH_FAILED',
      errorMessage: '주문 상태를 확인하지 못해 송장 전송을 중단했습니다.',
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus: null,
        providerStatusCode: 'PREFLIGHT_FETCH_FAILED',
        message: '주문 상태를 확인하지 못해 송장 전송을 중단했습니다.',
      },
      requestedInvoiceNumber: invoiceNumber,
      requestedShipmentBoxId: shipmentBoxId,
    };
  }

  const preflight = evaluateCoupangInvoicePreflight({
    sheet,
    expectedShipmentBoxId: shipmentBoxId,
    expectedOrderId: input.mallOrderNo,
    courierCode: input.courierCode,
    courierName: input.courierName,
    invoiceNumber,
  });

  if (!preflight.ok) {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: preflight.errorCode,
      errorMessage: preflight.message,
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus: null,
        providerStatusCode: preflight.errorCode,
        message: preflight.message,
      },
      requestedInvoiceNumber: invoiceNumber,
      requestedShipmentBoxId: shipmentBoxId,
    };
  }

  const bodyText = buildCoupangInvoiceRequestBodyText({
    vendorId: input.vendorId,
    shipmentBoxId: preflight.shipmentBoxId,
    orderId: preflight.orderId,
    vendorItemIds: preflight.vendorItemIds,
    deliveryCompanyCode: preflight.deliveryCompanyCode,
    invoiceNumber: preflight.invoiceNumber,
  });

  let httpStatus = 0;
  let responseBodyText = '';
  let transportError = false;

  try {
    const response = await input.postInvoices(bodyText);
    httpStatus = response.httpStatus;
    responseBodyText = response.bodyText;
  } catch {
    transportError = true;
  }

  let judgment: CoupangInvoiceJudgment;
  if (transportError) {
    judgment = {
      outcomeKind: 'unknown',
      errorCode: 'TRANSPORT_ERROR',
      message: '송장 전송 결과가 불명확합니다. 상태 확인 후 다시 시도해 주세요.',
      retryRequired: null,
    };
  } else {
    judgment = judgeCoupangInvoiceHttpResponse({
      httpStatus,
      bodyText: responseBodyText,
      requestedShipmentBoxId: shipmentBoxId,
    });
  }

  // 명확한 HTTP/업무 실패(재조회 없이 FAILED) — ambiguous/partial/unknown은 재조회
  if (judgment.outcomeKind === 'failure' && !transportError && !isAmbiguousInvoiceHttpStatus(httpStatus)) {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: judgment.errorCode,
      errorMessage: judgment.message,
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus,
        providerStatusCode: judgment.errorCode,
        message: judgment.message,
      },
      requestedInvoiceNumber: preflight.invoiceNumber,
      requestedShipmentBoxId: shipmentBoxId,
    };
  }

  // success 후보 또는 unknown → 단건 재조회로 확정/UNKNOWN
  let refetchSheet: CoupangOrderSheet | null = null;
  try {
    refetchSheet = await input.fetchByBoxId(shipmentBoxId);
  } catch {
    return {
      outcomeKind: 'unknown',
      success: false,
      errorCode: 'REFETCH_FAILED',
      errorMessage: '송장 전송 후 최신 상태를 확인하지 못했습니다.',
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus: transportError ? null : httpStatus,
        providerStatusCode: 'REFETCH_FAILED',
        message: '송장 전송 후 최신 상태를 확인하지 못했습니다.',
      },
      requestedInvoiceNumber: preflight.invoiceNumber,
      requestedShipmentBoxId: shipmentBoxId,
    };
  }

  const confirmed = confirmInvoiceByRefetch({
    sheet: refetchSheet,
    requestedInvoiceNumber: preflight.invoiceNumber,
    wasInstructBeforePost: true,
  });

  if (judgment.outcomeKind === 'success' && confirmed.outcomeKind === 'success') {
    return {
      outcomeKind: 'success',
      success: true,
      errorCode: null,
      errorMessage: null,
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus,
        providerStatusCode: 'OK',
        message: confirmed.message,
      },
      requestedInvoiceNumber: preflight.invoiceNumber,
      requestedShipmentBoxId: shipmentBoxId,
    };
  }

  // POST 응답이 불명확해도 재조회로 SENT 확정 가능 (timeout 후 DEPARTURE+동일송장)
  if (confirmed.outcomeKind === 'success') {
    return {
      outcomeKind: 'success',
      success: true,
      errorCode: null,
      errorMessage: null,
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus: transportError ? null : httpStatus,
        providerStatusCode: 'OK',
        message: confirmed.message,
      },
      requestedInvoiceNumber: preflight.invoiceNumber,
      requestedShipmentBoxId: shipmentBoxId,
    };
  }

  // POST는 성공 판정이었으나 재조회 실패/불일치 → UNKNOWN
  if (judgment.outcomeKind === 'success') {
    return {
      outcomeKind: 'unknown',
      success: false,
      errorCode: confirmed.errorCode || 'POST_OK_REFETCH_UNCERTAIN',
      errorMessage: confirmed.message,
      retryable: false,
      providerRequestId: null,
      responseSummary: {
        httpStatus,
        providerStatusCode: confirmed.errorCode,
        message: confirmed.message,
      },
      requestedInvoiceNumber: preflight.invoiceNumber,
      requestedShipmentBoxId: shipmentBoxId,
    };
  }

  return {
    outcomeKind: 'unknown',
    success: false,
    errorCode: judgment.errorCode || confirmed.errorCode || 'UNKNOWN',
    errorMessage: judgment.message || confirmed.message,
    retryable: false,
    providerRequestId: null,
    responseSummary: {
      httpStatus: transportError ? null : httpStatus,
      providerStatusCode: judgment.errorCode || confirmed.errorCode,
      message: judgment.message || confirmed.message,
    },
    requestedInvoiceNumber: preflight.invoiceNumber,
    requestedShipmentBoxId: shipmentBoxId,
  };
}
