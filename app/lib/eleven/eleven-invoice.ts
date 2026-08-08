import {
  elevenReqDelivery,
  formatElevenApiDateTime,
  type ElevenCredentials,
  type ElevenMutationResult,
} from '@/app/lib/eleven/client';
import {
  extractElevenLineIds,
  type ElevenLineIds,
} from '@/app/lib/eleven/eleven-ids';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';

export const ELEVEN_DLV_MTHD_CD_PARCEL = '01';

export type ElevenInvoiceOutcomeKind = 'success' | 'failure' | 'unknown';

export type ElevenInvoiceTransmitResult = {
  outcomeKind: ElevenInvoiceOutcomeKind;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  providerRequestId: string | null;
  responseSummary: {
    httpStatus: number | null;
    providerStatusCode: string | null;
    message: string | null;
    sendDt?: string | null;
    dlvEtprsCd?: string | null;
    dlvNo?: string | null;
    lineCount?: number | null;
  };
};

function failure(input: {
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  outcomeKind?: ElevenInvoiceOutcomeKind;
  providerStatusCode?: string | null;
}): ElevenInvoiceTransmitResult {
  return {
    outcomeKind: input.outcomeKind ?? 'failure',
    success: false,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryable: input.retryable ?? false,
    providerRequestId: null,
    responseSummary: {
      httpStatus: null,
      providerStatusCode: input.providerStatusCode ?? input.errorCode,
      message: input.errorMessage,
    },
  };
}

export function normalizeElevenTrackingNumber(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function buildElevenSendDt(now = new Date()): string {
  return formatElevenApiDateTime(now);
}

export function resolveElevenDeliveryEnterpriseCode(input: {
  courierCode: string | null;
  courierName: string | null;
}): { ok: true; dlvEtprsCd: string } | { ok: false; errorCode: string; message: string } {
  const mapped = resolveProviderCourierCode({
    provider: 'ELEVEN',
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!mapped) {
    return {
      ok: false,
      errorCode: 'COURIER_UNSUPPORTED',
      message:
        '11번가에서 지원하지 않는 택배사입니다. CJ·한진·롯데·로젠·우체국만 전송할 수 있습니다.',
    };
  }
  return { ok: true, dlvEtprsCd: mapped };
}

export type RunElevenInvoiceTransmissionInput = {
  credentials: ElevenCredentials;
  mallOrderNo: string;
  mallLineItemIds: string[] | null;
  courierCode: string | null;
  courierName: string | null;
  trackingNumber: string;
  partDlvYn?: 'Y' | 'N';
  now?: () => Date;
  reqDelivery?: (input: {
    credentials: ElevenCredentials;
    sendDt: string;
    dlvMthdCd: string;
    dlvEtprsCd: string;
    invcNo: string;
    dlvNo: string;
    partDlvYn: 'Y' | 'N';
    ordNo: string;
    ordPrdSeq: string;
  }) => Promise<ElevenMutationResult>;
};

export async function runElevenInvoiceTransmission(
  input: RunElevenInvoiceTransmissionInput,
): Promise<ElevenInvoiceTransmitResult> {
  const invcNo = normalizeElevenTrackingNumber(input.trackingNumber);
  if (!invcNo) {
    return failure({
      errorCode: 'TRACKING_NUMBER_MISSING',
      errorMessage: '송장번호가 없습니다.',
    });
  }
  if (/[/\s]/.test(invcNo)) {
    return failure({
      errorCode: 'TRACKING_NUMBER_INVALID',
      errorMessage: '송장번호 형식이 올바르지 않습니다.',
    });
  }

  const lines = extractElevenLineIds(input.mallLineItemIds, input.mallOrderNo);
  if (lines.length === 0) {
    return failure({
      errorCode: 'ELEVEN_LINE_IDS_MISSING',
      errorMessage:
        '11번가 전송에 필요한 주문번호·상품순번·배송번호(dlvNo)가 없습니다. 주문을 다시 조회·다운로드해 주세요.',
    });
  }
  for (const line of lines) {
    if (!line.ordNo || !line.ordPrdSeq || !line.dlvNo) {
      return failure({
        errorCode: 'ELEVEN_LINE_IDS_MISSING',
        errorMessage: '11번가 전송 필수 식별자(ordNo·ordPrdSeq·dlvNo)가 누락되었습니다.',
      });
    }
  }

  const courier = resolveElevenDeliveryEnterpriseCode({
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!courier.ok) {
    return failure({ errorCode: courier.errorCode, errorMessage: courier.message });
  }

  const sendDt = buildElevenSendDt(input.now?.() ?? new Date());
  // 가이드 필수. 부분발송이 확정되지 않은 일반 전송은 N.
  const partDlvYn = input.partDlvYn ?? 'N';
  const call = input.reqDelivery ?? elevenReqDelivery;

  let lastOk: ElevenMutationResult | null = null;
  for (const line of lines) {
    let result: ElevenMutationResult;
    try {
      result = await call({
        credentials: input.credentials,
        sendDt,
        dlvMthdCd: ELEVEN_DLV_MTHD_CD_PARCEL,
        dlvEtprsCd: courier.dlvEtprsCd,
        invcNo,
        dlvNo: line.dlvNo,
        partDlvYn,
        ordNo: line.ordNo,
        ordPrdSeq: line.ordPrdSeq,
      });
    } catch (error) {
      return failure({
        errorCode: 'PROVIDER_REQUEST_FAILED',
        errorMessage:
          error instanceof Error && error.message
            ? error.message
            : '11번가 송장 전송 중 오류가 발생했습니다.',
        retryable: true,
      });
    }

    if (!result.ok) {
      return failure({
        errorCode: 'PROVIDER_REJECTED',
        errorMessage: result.displayMessage || '11번가 송장 전송이 거절되었습니다.',
        providerStatusCode: result.code || 'PROVIDER_REJECTED',
      });
    }
    lastOk = result;
  }

  return {
    outcomeKind: 'success',
    success: true,
    errorCode: null,
    errorMessage: null,
    retryable: false,
    providerRequestId: lines[0]?.dlvNo ?? null,
    responseSummary: {
      httpStatus: 200,
      providerStatusCode: lastOk?.code || '0',
      message: '11번가 송장 접수에 성공했습니다. 반영 여부는 상태 확인으로 검증하세요.',
      sendDt,
      dlvEtprsCd: courier.dlvEtprsCd,
      dlvNo: lines[0]?.dlvNo ?? null,
      lineCount: lines.length,
    },
  };
}

export type ElevenVerifyMatchInput = {
  lines: ElevenLineIds[];
  expectedTracking: string;
  expectedDlvEtprsCd: string | null;
  orders: Array<{
    ordNo?: string;
    ordPrdSeq?: string;
    dlvNo?: string;
    ordStat?: string;
    ordStatNm?: string;
    invcNo?: string;
    dlvEtprsCd?: string;
  }>;
};

export type ElevenVerifyDecision =
  | {
      status: 'CONFIRMED';
      mallStatusCode: string | null;
      mallStatusLabel: string | null;
      message: string;
    }
  | {
      status: 'PENDING';
      mallStatusCode: string | null;
      mallStatusLabel: string | null;
      message: string;
    }
  | {
      status: 'ATTENTION';
      mallStatusCode: string | null;
      mallStatusLabel: string | null;
      message: string;
    }
  | {
      status: 'CHECK_FAILED';
      mallStatusCode: null;
      mallStatusLabel: null;
      message: string;
    };

function findOrderForLine(
  orders: ElevenVerifyMatchInput['orders'],
  line: ElevenLineIds,
) {
  const byDlv = orders.find((o) => String(o.dlvNo ?? '').trim() === line.dlvNo);
  if (byDlv) return byDlv;
  return orders.find(
    (o) =>
      String(o.ordNo ?? '').trim() === line.ordNo &&
      String(o.ordPrdSeq ?? '').trim() === line.ordPrdSeq,
  );
}

/**
 * complete/packaging 목록 재조회로 송장 반영 여부를 판정.
 * 배송중 전용 목록 endpoint가 가이드 확정 범위에 없으면 미조회로 PENDING 처리(가짜 CONFIRMED 금지).
 */
export function decideElevenVerifyFromOrders(input: ElevenVerifyMatchInput): ElevenVerifyDecision {
  const expectedTracking = normalizeElevenTrackingNumber(input.expectedTracking);
  if (!expectedTracking || input.lines.length === 0) {
    return {
      status: 'CHECK_FAILED',
      mallStatusCode: null,
      mallStatusLabel: null,
      message: '확인에 필요한 송장·주문 식별자가 없습니다.',
    };
  }

  let foundCount = 0;
  let matchedInvoice = 0;
  let conflict = false;
  let lastLabel: string | null = null;
  let lastCode: string | null = null;

  for (const line of input.lines) {
    const found = findOrderForLine(input.orders, line);
    if (!found) continue;
    foundCount += 1;
    lastCode = String(found.ordStat ?? '').trim() || null;
    lastLabel = String(found.ordStatNm ?? found.ordStat ?? '').trim() || null;
    const invc = normalizeElevenTrackingNumber(found.invcNo);
    if (!invc) continue;
    if (invc === expectedTracking) {
      if (
        input.expectedDlvEtprsCd &&
        String(found.dlvEtprsCd ?? '').trim() &&
        String(found.dlvEtprsCd).trim() !== input.expectedDlvEtprsCd
      ) {
        conflict = true;
        continue;
      }
      matchedInvoice += 1;
    } else {
      conflict = true;
    }
  }

  if (conflict) {
    return {
      status: 'ATTENTION',
      mallStatusCode: lastCode,
      mallStatusLabel: lastLabel,
      message: '11번가에 등록된 운송장번호가 전송값과 다릅니다.',
    };
  }

  if (matchedInvoice === input.lines.length) {
    return {
      status: 'CONFIRMED',
      mallStatusCode: lastCode,
      mallStatusLabel: lastLabel,
      message: '11번가 목록에서 운송장 반영을 확인했습니다.',
    };
  }

  if (foundCount > 0) {
    return {
      status: 'PENDING',
      mallStatusCode: lastCode,
      mallStatusLabel: lastLabel,
      message: '주문을 찾았으나 운송장번호가 아직 반영되지 않았습니다.',
    };
  }

  return {
    status: 'PENDING',
    mallStatusCode: null,
    mallStatusLabel: null,
    message:
      'complete/packaging 목록에서 주문을 찾지 못했습니다. 배송중 전용 재조회 경로가 가이드에서 확정되지 않아 반영 대기로 둡니다.',
  };
}
