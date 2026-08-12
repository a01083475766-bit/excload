import {
  fetchLotteonProgressStatesByOdNo,
  formatLotteonApiDateTime,
  postLotteonDeliveryProgressInform,
  type LotteonCredentials,
  type LotteonDeliveryProgressInformItem,
} from '@/app/lib/lotteon/client';
import {
  extractLotteonLineIds,
  isLotteonClaimLine,
  isLotteonTimeoutLikeMessage,
  type LotteonLineIds,
} from '@/app/lib/lotteon/lotteon-ids';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';

export type LotteonInvoiceOutcomeKind = 'success' | 'failure' | 'unknown';

export type LotteonInvoiceTransmitResult = {
  outcomeKind: LotteonInvoiceOutcomeKind;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  providerRequestId: string | null;
  responseSummary: {
    httpStatus: number | null;
    providerStatusCode: string | null;
    message: string | null;
    lineCount?: number | null;
    dvCoCd?: string | null;
  };
};

function failure(input: {
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  outcomeKind?: LotteonInvoiceOutcomeKind;
}): LotteonInvoiceTransmitResult {
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

export function normalizeLotteonTrackingNumber(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

export function resolveLotteonDeliveryCompanyCode(input: {
  courierCode: string | null;
  courierName: string | null;
}): { ok: true; dvCoCd: string } | { ok: false; errorCode: string; message: string } {
  const mapped = resolveProviderCourierCode({
    provider: 'LOTTEON',
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!mapped) {
    return {
      ok: false,
      errorCode: 'COURIER_UNSUPPORTED',
      message: '롯데ON에서 지원하지 않는 택배사입니다. CJ·한진·롯데·로젠·우체국만 전송할 수 있습니다.',
    };
  }
  return { ok: true, dvCoCd: mapped };
}

export function buildLotteonDispatchInformItem(input: {
  line: LotteonLineIds;
  dvCoCd: string;
  invcNo: string;
  now?: Date;
}): LotteonDeliveryProgressInformItem {
  return {
    dvRtrvDvsCd: 'DV',
    odNo: input.line.odNo,
    odSeq: input.line.odSeq,
    procSeq: input.line.procSeq || '1',
    orglProcSeq: '',
    clmNo: input.line.clmNo || '',
    odPrgsStepCd: '13',
    dvTrcStatDttm: formatLotteonApiDateTime(input.now ?? new Date(), 'exact'),
    invcNbr: '1',
    dvCoCd: input.dvCoCd,
    invcNo: input.invcNo,
    spdNo: input.line.spdNo,
    sitmNo: input.line.sitmNo,
    slQty: input.line.slQty || '1',
  };
}

function matchesVerifyLine(
  order: {
    odNo: string;
    odSeq: string;
    procSeq?: string;
    spdNo?: string;
    sitmNo?: string;
  },
  line: LotteonLineIds,
): boolean {
  if (order.odNo !== line.odNo || order.odSeq !== line.odSeq) return false;
  if ((order.procSeq || '1') !== (line.procSeq || '1')) return false;
  if (line.spdNo && order.spdNo && order.spdNo !== line.spdNo) return false;
  if (line.sitmNo && order.sitmNo && order.sitmNo !== line.sitmNo) return false;
  return true;
}

export function decideLotteonVerifyFromOrders(input: {
  lines: LotteonLineIds[];
  expectedTracking: string;
  expectedDvCoCd: string | null;
  orders: Array<{
    odNo: string;
    odSeq: string;
    procSeq?: string;
    spdNo?: string;
    sitmNo?: string;
    odPrgsStepCd?: string;
    invcNo?: string;
    dvCoCd?: string;
  }>;
}): {
  status: 'CONFIRMED' | 'PENDING' | 'ATTENTION' | 'CHECK_FAILED';
  mallStatusCode: string | null;
  mallStatusLabel: string | null;
  message: string;
} {
  const expected = normalizeLotteonTrackingNumber(input.expectedTracking);
  let confirmed = 0;
  let pending = 0;
  let attention = 0;
  let lastStep = '';

  for (const line of input.lines) {
    const match = input.orders.find((order) => matchesVerifyLine(order, line));
    if (!match) {
      pending += 1;
      continue;
    }
    lastStep = match.odPrgsStepCd ?? '';
    const step = lastStep.trim();
    if (['21', '22', '23', '24', '25', '26', '27'].includes(step)) {
      attention += 1;
      continue;
    }
    const tracking = normalizeLotteonTrackingNumber(match.invcNo);
    if (step === '13' || step === '14' || step === '15') {
      if (expected && tracking && tracking !== expected) {
        attention += 1;
        continue;
      }
      if (input.expectedDvCoCd && match.dvCoCd && match.dvCoCd !== input.expectedDvCoCd) {
        attention += 1;
        continue;
      }
      confirmed += 1;
      continue;
    }
    pending += 1;
  }

  if (attention > 0) {
    return {
      status: 'ATTENTION',
      mallStatusCode: lastStep || null,
      mallStatusLabel: lastStep || null,
      message: '롯데ON 상태가 취소·회수이거나 송장 정보가 다릅니다.',
    };
  }
  if (confirmed === input.lines.length) {
    return {
      status: 'CONFIRMED',
      mallStatusCode: lastStep || '13',
      mallStatusLabel: '발송완료',
      message: '롯데ON에 발송완료로 반영되었습니다.',
    };
  }
  return {
    status: 'PENDING',
    mallStatusCode: lastStep || null,
    mallStatusLabel: lastStep || null,
    message: '롯데ON에 발송완료가 아직 반영되지 않았습니다.',
  };
}

const inFlightByLine = new Map<string, Promise<LotteonInvoiceTransmitResult>>();

export async function runLotteonInvoiceTransmission(input: {
  credentials: Pick<LotteonCredentials, 'apiKey'>;
  mallOrderNo: string;
  mallLineItemIds: string[];
  courierCode: string | null;
  courierName: string | null;
  trackingNumber: string;
  inform?: typeof postLotteonDeliveryProgressInform;
  fetchByOdNo?: typeof fetchLotteonProgressStatesByOdNo;
}): Promise<LotteonInvoiceTransmitResult> {
  const tracking = normalizeLotteonTrackingNumber(input.trackingNumber);
  if (!tracking) {
    return failure({ errorCode: 'TRACKING_NUMBER_MISSING', errorMessage: '운송장번호가 없습니다.' });
  }

  const courier = resolveLotteonDeliveryCompanyCode({
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!courier.ok) {
    return failure({ errorCode: courier.errorCode, errorMessage: courier.message });
  }

  const lines = extractLotteonLineIds(input.mallLineItemIds, input.mallOrderNo);
  if (lines.length === 0) {
    return failure({
      errorCode: 'LINE_IDS_MISSING',
      errorMessage:
        '롯데ON 주문·단품 식별값(odNo·odSeq·procSeq)이 없습니다. 주문을 다시 조회한 뒤 택배양식을 받아 주세요.',
    });
  }

  const shippable = lines.filter((line) => !isLotteonClaimLine(line));
  if (shippable.length === 0) {
    return failure({
      errorCode: 'CLAIM_EXCLUDED',
      errorMessage: '취소·반품·교환 주문은 송장 전송 대상이 아닙니다.',
    });
  }

  const missingIds = shippable.filter((line) => !line.spdNo || !line.sitmNo);
  if (missingIds.length > 0) {
    return failure({
      errorCode: 'PRODUCT_IDS_MISSING',
      errorMessage: '롯데ON 상품번호(spdNo)·단품번호(sitmNo)가 없어 발송완료 통보를 할 수 없습니다.',
    });
  }

  const zeroQty = shippable.filter((line) => {
    const qty = Number(line.slQty || '0');
    return Number.isFinite(qty) && qty <= 0;
  });
  if (zeroQty.length > 0) {
    return failure({
      errorCode: 'QUANTITY_ZERO',
      errorMessage: '발송 가능 수량이 0인 라인은 송장 전송할 수 없습니다.',
    });
  }

  const items = shippable.map((line) =>
    buildLotteonDispatchInformItem({ line, dvCoCd: courier.dvCoCd, invcNo: tracking }),
  );
  const flightKey = items.map((item) => `${item.odNo}|${item.odSeq}|${item.procSeq}`).join(',');
  const existing = inFlightByLine.get(flightKey);
  if (existing) return existing;

  const inform = input.inform ?? postLotteonDeliveryProgressInform;
  const fetchByOdNo = input.fetchByOdNo ?? fetchLotteonProgressStatesByOdNo;

  const promise = (async () => {
    let succeeded = 0;
    let failed = 0;
    let uncertain = 0;
    let lastError = '';

    for (const item of items) {
      try {
        await inform({ credentials: input.credentials, items: [item] });
        succeeded += 1;
      } catch (error) {
        lastError = error instanceof Error ? error.message : '롯데ON 발송완료 통보에 실패했습니다.';
        if (isLotteonTimeoutLikeMessage(lastError)) {
          uncertain += 1;
        } else {
          failed += 1;
        }
      }
    }

    if (uncertain > 0) {
      try {
        const orders = await fetchByOdNo({ credentials: input.credentials, odNo: input.mallOrderNo });
        const decision = decideLotteonVerifyFromOrders({
          lines: shippable,
          expectedTracking: tracking,
          expectedDvCoCd: courier.dvCoCd,
          orders,
        });
        if (decision.status === 'CONFIRMED') {
          return {
            outcomeKind: 'success' as const,
            success: true,
            errorCode: null,
            errorMessage: null,
            retryable: false,
            providerRequestId: null,
            responseSummary: {
              httpStatus: 200,
              providerStatusCode: '0000',
              message: '응답 지연 후 롯데ON 조회로 발송완료가 확인되었습니다.',
              lineCount: items.length,
              dvCoCd: courier.dvCoCd,
            },
          };
        }
      } catch {
        // 조회 실패 시에도 불확실 유지
      }

      return failure({
        errorCode: 'PROVIDER_STATUS_UNKNOWN',
        errorMessage:
          '응답이 지연되어 송장 반영 여부를 확정하지 못했습니다. 「상태 다시 확인」으로 확인한 뒤, 반영되지 않았을 때만 재전송하세요.',
        retryable: false,
        outcomeKind: 'unknown',
      });
    }

    if (failed === 0) {
      return {
        outcomeKind: 'success' as const,
        success: true,
        errorCode: null,
        errorMessage: null,
        retryable: false,
        providerRequestId: null,
        responseSummary: {
          httpStatus: 200,
          providerStatusCode: '0000',
          message: '발송완료 통보되었습니다.',
          lineCount: items.length,
          dvCoCd: courier.dvCoCd,
        },
      };
    }

    if (succeeded > 0) {
      // 부분 성공은 전체 SENT로 저장하지 않음. 자동 재전송도 막음(UNKNOWN).
      return failure({
        errorCode: 'PARTIAL_ERROR',
        errorMessage: `발송완료 통보 ${succeeded}건 성공, ${failed}건 실패. 상태 확인 후 실패 라인만 재처리하세요.`,
        retryable: false,
        outcomeKind: 'unknown',
      });
    }

    return failure({
      errorCode: 'INFORM_FAILED',
      errorMessage: lastError || '롯데ON 발송완료 통보에 실패했습니다.',
      retryable: false,
      outcomeKind: 'failure',
    });
  })().finally(() => {
    inFlightByLine.delete(flightKey);
  });

  inFlightByLine.set(flightKey, promise);
  return promise;
}
