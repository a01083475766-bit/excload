import {
  domeggookGetOrderView,
  domeggookSetOrdOkDeli,
  toDomeggookOrderNoQueryValue,
  type DomeggookCredentials,
  type DomeggookOrderRecord,
  type DomeggookSession,
  type DomeggookSetOrdOkDeliResult,
} from '@/app/lib/domeggook/client';
import {
  extractDomeggookApiOrderNo,
  extractDomeggookOrderUid,
  extractDomeggookStatusMode,
  isDomeggookInvoiceAddEligibleStatusMode,
  isDomeggookShippedOrLaterStatusMode,
  normalizeDomeggookTrackingForCompare,
} from '@/app/lib/domeggook/domeggook-ids';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';

export const DOMEGGOOK_DELI_METHOD_PARCEL = 'TB';

export type DomeggookInvoiceOutcomeKind = 'success' | 'failure' | 'unknown';

export type DomeggookInvoiceTransmitResult = {
  outcomeKind: DomeggookInvoiceOutcomeKind;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  providerRequestId: string | null;
  responseSummary: {
    httpStatus: number | null;
    providerStatusCode: string | null;
    message: string | null;
    apiOrderNo?: string | null;
    deliCompany?: string | null;
  };
};

function failure(input: {
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  outcomeKind?: DomeggookInvoiceOutcomeKind;
}): DomeggookInvoiceTransmitResult {
  return {
    outcomeKind: input.outcomeKind ?? 'failure',
    success: false,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryable: input.retryable ?? false,
    providerRequestId: null,
    responseSummary: {
      httpStatus: null,
      providerStatusCode: input.errorCode,
      message: input.errorMessage,
    },
  };
}

export function resolveDomeggookDeliCompany(input: {
  courierCode: string | null;
  courierName: string | null;
}): { ok: true; deliCompany: string } | { ok: false; errorCode: string; message: string } {
  const mapped = resolveProviderCourierCode({
    provider: 'DOMEGGOOK',
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!mapped) {
    return {
      ok: false,
      errorCode: 'COURIER_UNSUPPORTED',
      message:
        '도매꾹에서 지원하지 않는 택배사입니다. CJ·한진·롯데·로젠·우체국만 전송할 수 있습니다.',
    };
  }
  return { ok: true, deliCompany: mapped };
}

export function resolveDomeggookApiOrderNoFromCandidate(input: {
  mallOrderNo: string;
  mallLineItemIds: string[] | null;
}): string | null {
  const fromIds = extractDomeggookApiOrderNo(input.mallLineItemIds);
  if (fromIds) return fromIds;
  const fromMall = toDomeggookOrderNoQueryValue(input.mallOrderNo);
  return fromMall || null;
}

export type RunDomeggookInvoiceTransmissionInput = {
  credentials: DomeggookCredentials;
  session: DomeggookSession;
  mallOrderNo: string;
  mallLineItemIds: string[] | null;
  courierCode: string | null;
  courierName: string | null;
  trackingNumber: string;
  /** 계정에 저장된 0|1. null이면 외부 호출 금지 */
  deliWithTax: 0 | 1 | null;
  getOrderView?: (input: {
    credentials: DomeggookCredentials;
    session: DomeggookSession;
    orderNo?: string;
    orderUid?: string;
  }) => Promise<DomeggookOrderRecord>;
  setOrdOkDeli?: (input: {
    credentials: DomeggookCredentials;
    session: DomeggookSession;
    apiOrderNo: string;
    type: 'add';
    deliMethod: string;
    deliCompany: string;
    deliCode: string;
    deliWithTax: 0 | 1;
  }) => Promise<DomeggookSetOrdOkDeliResult>;
};

export async function runDomeggookInvoiceTransmission(
  input: RunDomeggookInvoiceTransmissionInput,
): Promise<DomeggookInvoiceTransmitResult> {
  const deliCode = String(input.trackingNumber ?? '').trim();
  if (!deliCode) {
    return failure({
      errorCode: 'TRACKING_NUMBER_MISSING',
      errorMessage: '송장번호가 없습니다.',
    });
  }
  if (input.deliWithTax !== 0 && input.deliWithTax !== 1) {
    return failure({
      errorCode: 'DELI_WITH_TAX_REQUIRED',
      errorMessage:
        '세금계산서 포함 여부(미포함/포함)를 도매꾹 연동 설정에서 선택한 뒤 다시 전송해 주세요.',
    });
  }

  const apiOrderNo = resolveDomeggookApiOrderNoFromCandidate({
    mallOrderNo: input.mallOrderNo,
    mallLineItemIds: input.mallLineItemIds,
  });
  if (!apiOrderNo) {
    return failure({
      errorCode: 'MALL_ORDER_NO_MISSING',
      errorMessage: '도매꾹 숫자 주문번호가 없어 송장을 전송할 수 없습니다.',
    });
  }

  const courier = resolveDomeggookDeliCompany({
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!courier.ok) {
    return failure({ errorCode: courier.errorCode, errorMessage: courier.message });
  }

  const orderUid = extractDomeggookOrderUid(input.mallLineItemIds) ?? '';
  const getView = input.getOrderView ?? domeggookGetOrderView;
  let latest: DomeggookOrderRecord | null = null;
  try {
    latest = await getView({
      credentials: input.credentials,
      session: input.session,
      orderNo: apiOrderNo,
      orderUid: orderUid || undefined,
    });
  } catch (error) {
    return failure({
      errorCode: 'ORDER_LOOKUP_FAILED',
      errorMessage:
        error instanceof Error && error.message
          ? error.message
          : '도매꾹 주문 상세 조회에 실패했습니다.',
      retryable: true,
    });
  }

  const statusMode =
    latest.statusMode ||
    extractDomeggookStatusMode(input.mallLineItemIds) ||
    '';
  const statusLabel = latest.orderStatus || '';

  if (isDomeggookShippedOrLaterStatusMode(statusMode)) {
    const existingCode = String(latest.deliveryCode ?? '').trim();
    if (
      existingCode &&
      normalizeDomeggookTrackingForCompare(existingCode) ===
        normalizeDomeggookTrackingForCompare(deliCode) &&
      (!latest.deliveryCompany ||
        latest.deliveryCompany.trim().toUpperCase() === courier.deliCompany.toUpperCase())
    ) {
      return {
        outcomeKind: 'success',
        success: true,
        errorCode: null,
        errorMessage: null,
        retryable: false,
        providerRequestId: apiOrderNo,
        responseSummary: {
          httpStatus: 200,
          providerStatusCode: 'IDEMPOTENT_SUCCESS',
          message: '이미 동일한 발송정보가 등록되어 있습니다.',
          apiOrderNo,
          deliCompany: courier.deliCompany,
        },
      };
    }
    return failure({
      errorCode: 'ALREADY_SHIPPED',
      errorMessage: '이미 발송 이후 상태라 송장을 중복 등록하지 않았습니다.',
    });
  }

  const existingCode = String(latest.deliveryCode ?? '').trim();
  if (existingCode) {
    if (
      normalizeDomeggookTrackingForCompare(existingCode) ===
        normalizeDomeggookTrackingForCompare(deliCode) &&
      (!latest.deliveryCompany ||
        latest.deliveryCompany.trim().toUpperCase() === courier.deliCompany.toUpperCase())
    ) {
      return {
        outcomeKind: 'success',
        success: true,
        errorCode: null,
        errorMessage: null,
        retryable: false,
        providerRequestId: apiOrderNo,
        responseSummary: {
          httpStatus: 200,
          providerStatusCode: 'IDEMPOTENT_SUCCESS',
          message: '이미 동일한 발송정보가 등록되어 있습니다.',
          apiOrderNo,
          deliCompany: courier.deliCompany,
        },
      };
    }
    return failure({
      errorCode: 'SHIPMENT_CONFLICT',
      errorMessage: '해당 주문에 다른 송장이 이미 등록되어 있습니다. 송장 수정은 이번 범위에 포함되지 않습니다.',
    });
  }

  if (!isDomeggookInvoiceAddEligibleStatusMode(statusMode, statusLabel)) {
    return failure({
      errorCode: 'ORDER_STATUS_NOT_ELIGIBLE',
      errorMessage: '결제완료·배송준비중 상태에서만 발송정보를 등록할 수 있습니다.',
    });
  }

  const call = input.setOrdOkDeli ?? domeggookSetOrdOkDeli;
  let posted: DomeggookSetOrdOkDeliResult;
  try {
    posted = await call({
      credentials: input.credentials,
      session: input.session,
      apiOrderNo,
      type: 'add',
      deliMethod: DOMEGGOOK_DELI_METHOD_PARCEL,
      deliCompany: courier.deliCompany,
      deliCode,
      deliWithTax: input.deliWithTax,
    });
  } catch (error) {
    return failure({
      errorCode: 'PROVIDER_REQUEST_FAILED',
      errorMessage:
        error instanceof Error && error.message
          ? error.message
          : '도매꾹 송장 전송 중 오류가 발생했습니다.',
      retryable: true,
    });
  }

  if (!posted.ok || posted.resultFlag !== true) {
    return failure({
      errorCode: 'PROVIDER_REJECTED',
      errorMessage: posted.message || '도매꾹 발송정보 등록이 거절되었습니다.',
    });
  }

  return {
    outcomeKind: 'success',
    success: true,
    errorCode: null,
    errorMessage: null,
    retryable: false,
    providerRequestId: apiOrderNo,
    responseSummary: {
      httpStatus: 200,
      providerStatusCode: 'true',
      message: '도매꾹 발송정보 접수에 성공했습니다. 반영 여부는 상태 확인으로 검증하세요.',
      apiOrderNo,
      deliCompany: courier.deliCompany,
    },
  };
}

export type DomeggookVerifyDecision =
  | {
      status: 'CONFIRMED' | 'PENDING' | 'ATTENTION' | 'CHECK_FAILED';
      mallStatusCode: string | null;
      mallStatusLabel: string | null;
      message: string;
    };

export function decideDomeggookVerifyFromOrderView(input: {
  order: DomeggookOrderRecord | null;
  expectedTracking: string;
  expectedDeliCompany: string | null;
}): DomeggookVerifyDecision {
  if (!input.order) {
    return {
      status: 'CHECK_FAILED',
      mallStatusCode: null,
      mallStatusLabel: null,
      message: '도매꾹에서 주문을 찾지 못했습니다.',
    };
  }

  const mode = (input.order.statusMode || '').trim().toUpperCase();
  const label = input.order.orderStatus || mode || null;
  const code = String(input.order.deliveryCode ?? '').trim();
  const company = String(input.order.deliveryCompany ?? '').trim().toUpperCase();
  const expected = normalizeDomeggookTrackingForCompare(input.expectedTracking);
  const actual = normalizeDomeggookTrackingForCompare(code);
  const expectedCompany = (input.expectedDeliCompany ?? '').trim().toUpperCase();

  if (code && actual && expected && actual !== expected) {
    return {
      status: 'ATTENTION',
      mallStatusCode: mode || null,
      mallStatusLabel: label,
      message: '도매꾹에 등록된 운송장번호가 전송값과 다릅니다.',
    };
  }
  if (code && expectedCompany && company && company !== expectedCompany) {
    return {
      status: 'ATTENTION',
      mallStatusCode: mode || null,
      mallStatusLabel: label,
      message: '도매꾹에 등록된 택배사가 전송값과 다릅니다.',
    };
  }

  if (
    isDomeggookShippedOrLaterStatusMode(mode) &&
    actual &&
    expected &&
    actual === expected &&
    (!expectedCompany || !company || company === expectedCompany)
  ) {
    return {
      status: 'CONFIRMED',
      mallStatusCode: mode || null,
      mallStatusLabel: label,
      message: '도매꾹 주문 상세에서 발송정보 반영을 확인했습니다.',
    };
  }

  if (
    (mode === 'WAITCHK' || mode === 'WAITDELI' || !mode) &&
    !code
  ) {
    return {
      status: 'PENDING',
      mallStatusCode: mode || null,
      mallStatusLabel: label,
      message: '아직 발송정보가 반영되지 않았습니다.',
    };
  }

  if (actual && expected && actual === expected) {
    return {
      status: 'CONFIRMED',
      mallStatusCode: mode || null,
      mallStatusLabel: label,
      message: '도매꾹 주문 상세에서 운송장 반영을 확인했습니다.',
    };
  }

  return {
    status: 'PENDING',
    mallStatusCode: mode || null,
    mallStatusLabel: label,
    message: '도매꾹 반영 상태를 아직 확정하지 못했습니다.',
  };
}

/**
 * 같은 주문번호에 매칭된 송장들을 검사.
 * - 동일 송장 → 1회만 전송
 * - 상충 송장 → 외부 호출 전 차단
 */
export function assertDomeggookShipmentConsistency(input: {
  trackingNumbers: string[];
  courierCodes: Array<string | null>;
  courierNames: Array<string | null>;
}): { ok: true; trackingNumber: string } | { ok: false; errorCode: string; message: string } {
  const tracks = [
    ...new Set(input.trackingNumbers.map((t) => t.trim()).filter(Boolean)),
  ];
  if (tracks.length === 0) {
    return { ok: false, errorCode: 'TRACKING_NUMBER_MISSING', message: '송장번호가 없습니다.' };
  }
  if (tracks.length > 1) {
    return {
      ok: false,
      errorCode: 'SHIPMENT_CONFLICT',
      message: '같은 주문에 서로 다른 운송장번호가 매칭되어 전송할 수 없습니다.',
    };
  }

  const companies = new Set<string>();
  for (let i = 0; i < Math.max(input.courierCodes.length, input.courierNames.length); i += 1) {
    const resolved = resolveDomeggookDeliCompany({
      courierCode: input.courierCodes[i] ?? null,
      courierName: input.courierNames[i] ?? null,
    });
    if (!resolved.ok) {
      return { ok: false, errorCode: resolved.errorCode, message: resolved.message };
    }
    companies.add(resolved.deliCompany);
  }
  if (companies.size > 1) {
    return {
      ok: false,
      errorCode: 'SHIPMENT_CONFLICT',
      message: '같은 주문에 서로 다른 택배사가 매칭되어 전송할 수 없습니다.',
    };
  }

  return { ok: true, trackingNumber: tracks[0]! };
}
