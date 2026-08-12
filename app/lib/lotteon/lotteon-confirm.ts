import type { LotteonCredentials } from '@/app/lib/lotteon/client';
import {
  fetchLotteonProgressStatesByOdNo,
  postLotteonIfCompleteInform,
} from '@/app/lib/lotteon/client';
import { isLotteonClaimLine, isLotteonTimeoutLikeMessage, type LotteonLineIds } from '@/app/lib/lotteon/lotteon-ids';
import {
  mapLotteonOrderToStandardRow,
  mapLotteonOrdersToFetchViews,
} from '@/app/lib/lotteon/map-lotteon-orders';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export type LotteonConfirmItemStatus =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  | 'FAILED'
  | 'SKIPPED_NOT_ELIGIBLE'
  | 'NEEDS_CHECK';

export type LotteonConfirmRequestItem = {
  odNo: string;
  odSeq: string;
  procSeq?: string;
  dvRtrvDvsCd?: string;
  odTypCd?: string;
  odPrgsStepCd?: string;
  clmNo?: string;
  orglProcSeq?: string;
};

export type LotteonConfirmItemResult = {
  productOrderNo: string;
  odNo: string;
  odSeq: string;
  procSeq: string;
  status: LotteonConfirmItemStatus;
  message: string;
  standardRows?: StandardOrderRow[];
  views?: OrderFetchView[];
};

export type LotteonConfirmRunResult = {
  requestedCount: number;
  confirmedCount: number;
  alreadyConfirmedCount: number;
  failedCount: number;
  skippedCount: number;
  needsCheckCount: number;
  results: LotteonConfirmItemResult[];
};

export function validateLotteonConfirmItems(
  raw: unknown,
): { ok: true; items: LotteonConfirmRequestItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '연동완료 통보할 주문 목록이 필요합니다.' };
  }
  if (raw.length === 0) {
    return { ok: false, error: '연동완료 통보할 주문을 선택해 주세요.' };
  }
  if (raw.length > 100) {
    return { ok: false, error: '한 번에 최대 100건까지 처리할 수 있습니다.' };
  }

  const items: LotteonConfirmRequestItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: '주문 항목 형식이 올바르지 않습니다.' };
    }
    const record = entry as Record<string, unknown>;
    const odNo = String(record.odNo ?? '').trim();
    const odSeq = String(record.odSeq ?? '').trim();
    if (!odNo || !odSeq) {
      return { ok: false, error: 'odNo·odSeq가 없는 항목은 처리할 수 없습니다.' };
    }
    if (/\s/.test(odNo) || /\s/.test(odSeq)) {
      return { ok: false, error: '주문 식별자에 공백이 포함되어 있습니다.' };
    }
    const procSeq = String(record.procSeq ?? '1').trim() || '1';
    const key = `${odNo}|${odSeq}|${procSeq}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      odNo,
      odSeq,
      procSeq,
      dvRtrvDvsCd: record.dvRtrvDvsCd == null ? 'DV' : String(record.dvRtrvDvsCd),
      odTypCd: record.odTypCd == null ? '10' : String(record.odTypCd),
      odPrgsStepCd: record.odPrgsStepCd == null ? '' : String(record.odPrgsStepCd),
      clmNo: record.clmNo == null ? '' : String(record.clmNo),
      orglProcSeq: record.orglProcSeq == null ? '' : String(record.orglProcSeq),
    });
  }
  if (items.length === 0) {
    return { ok: false, error: '연동완료 통보할 주문을 선택해 주세요.' };
  }
  return { ok: true, items };
}

export function classifyLotteonConfirmPreflight(item: LotteonConfirmRequestItem): {
  status: LotteonConfirmItemStatus;
  message: string;
} | null {
  const ids: LotteonLineIds = {
    odNo: item.odNo,
    odSeq: item.odSeq,
    procSeq: item.procSeq || '1',
    spdNo: '',
    sitmNo: '',
    dvRtrvDvsCd: item.dvRtrvDvsCd || 'DV',
    odTypCd: item.odTypCd || '10',
    slQty: '1',
    clmNo: item.clmNo || '',
    odPrgsStepCd: item.odPrgsStepCd || '11',
  };
  if (isLotteonClaimLine(ids)) {
    return { status: 'SKIPPED_NOT_ELIGIBLE', message: '취소·반품·교환 주문은 연동완료 통보 대상이 아닙니다.' };
  }
  if ((item.dvRtrvDvsCd || 'DV').toUpperCase() !== 'DV') {
    return { status: 'SKIPPED_NOT_ELIGIBLE', message: '배송(DV) 출고지시만 처리할 수 있습니다.' };
  }
  const step = (item.odPrgsStepCd || '11').trim();
  if (step === '12') {
    return { status: 'ALREADY_CONFIRMED', message: '이미 상품준비(연동완료) 상태입니다.' };
  }
  if (step && step !== '11') {
    return { status: 'SKIPPED_NOT_ELIGIBLE', message: '출고지시(11) 상태만 연동완료 통보할 수 있습니다.' };
  }
  return null;
}

function alreadyConfirmedMessage(message: string): boolean {
  return /이미\s*(처리|연동완료|상품준비)|상품준비\s*상태/.test(message);
}

function confirmedPatch(item: LotteonConfirmRequestItem): {
  standardRows: StandardOrderRow[];
  views: OrderFetchView[];
} {
  const order = {
    odNo: item.odNo,
    odSeq: item.odSeq,
    procSeq: item.procSeq || '1',
    orglProcSeq: item.orglProcSeq || '',
    clmNo: item.clmNo || '',
    odPrgsStepCd: '12',
    odPrgsStepNm: '상품준비',
    dvRtrvDvsCd: item.dvRtrvDvsCd || 'DV',
    odTypCd: item.odTypCd || '10',
    odTypDtlCd: '',
    spdNo: '',
    sitmNo: '',
    pdNm: '',
    odQty: '1',
    slQty: '1',
    odCmptDttm: '',
    odAcptDttm: '',
    rcvrNm: '',
    rcvrPhone: '',
    rcvrZipNo: '',
    rcvrBaseAddr: '',
    rcvrDtlAddr: '',
    dlvMsg: '',
    odAmt: '',
    invcNo: '',
    dvCoCd: '',
    raw: {},
  };
  return {
    standardRows: [mapLotteonOrderToStandardRow(order)],
    views: mapLotteonOrdersToFetchViews([order]),
  };
}

function matchesConfirmItem(
  order: { odNo: string; odSeq: string; procSeq?: string; clmNo?: string },
  item: LotteonConfirmRequestItem,
): boolean {
  return (
    order.odNo === item.odNo &&
    order.odSeq === item.odSeq &&
    (order.procSeq || '1') === (item.procSeq || '1') &&
    (order.clmNo || '') === (item.clmNo || '')
  );
}

export async function reconcileLotteonConfirmAfterUncertainty(input: {
  credentials: Pick<LotteonCredentials, 'apiKey'>;
  item: LotteonConfirmRequestItem;
  fetchByOdNo?: typeof fetchLotteonProgressStatesByOdNo;
}): Promise<'CONFIRMED' | 'STILL_OPEN' | 'CHECK_FAILED'> {
  const fetchByOdNo = input.fetchByOdNo ?? fetchLotteonProgressStatesByOdNo;
  try {
    const orders = await fetchByOdNo({ credentials: input.credentials, odNo: input.item.odNo });
    const match = orders.find((order) => matchesConfirmItem(order, input.item));
    const step = (match?.odPrgsStepCd ?? '').trim();
    if (['12', '13', '14', '15'].includes(step)) return 'CONFIRMED';
    if (match && step === '11') return 'STILL_OPEN';
    return 'CHECK_FAILED';
  } catch {
    return 'CHECK_FAILED';
  }
}

export async function runLotteonConfirm(input: {
  credentials: Pick<LotteonCredentials, 'apiKey'>;
  items: LotteonConfirmRequestItem[];
  inform?: typeof postLotteonIfCompleteInform;
  fetchByOdNo?: typeof fetchLotteonProgressStatesByOdNo;
}): Promise<LotteonConfirmRunResult> {
  const inform = input.inform ?? postLotteonIfCompleteInform;
  const results: LotteonConfirmItemResult[] = [];

  for (const item of input.items) {
    const productOrderNo = `${item.odNo}-${item.odSeq}`;
    const procSeq = item.procSeq || '1';
    const preflight = classifyLotteonConfirmPreflight(item);
    if (preflight) {
      results.push({
        productOrderNo,
        odNo: item.odNo,
        odSeq: item.odSeq,
        procSeq,
        status: preflight.status,
        message: preflight.message,
        ...(preflight.status === 'ALREADY_CONFIRMED' ? confirmedPatch(item) : {}),
      });
      continue;
    }

    try {
      await inform({
        credentials: input.credentials,
        items: [
          {
            dvRtrvDvsCd: 'DV',
            odNo: item.odNo,
            odSeq: item.odSeq,
            procSeq,
            orglProcSeq: item.orglProcSeq || undefined,
            clmNo: item.clmNo || undefined,
            ifCplYN: 'Y',
          },
        ],
      });
      const patch = confirmedPatch(item);
      results.push({
        productOrderNo,
        odNo: item.odNo,
        odSeq: item.odSeq,
        procSeq,
        status: 'CONFIRMED',
        message: '연동완료 통보되었습니다. 롯데ON 상태는 상품준비입니다.',
        ...patch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '연동완료 통보에 실패했습니다.';
      if (alreadyConfirmedMessage(message)) {
        const patch = confirmedPatch(item);
        results.push({
          productOrderNo,
          odNo: item.odNo,
          odSeq: item.odSeq,
          procSeq,
          status: 'ALREADY_CONFIRMED',
          message,
          ...patch,
        });
        continue;
      }

      if (isLotteonTimeoutLikeMessage(message)) {
        const reconciled = await reconcileLotteonConfirmAfterUncertainty({
          credentials: input.credentials,
          item,
          fetchByOdNo: input.fetchByOdNo,
        });
        if (reconciled === 'CONFIRMED') {
          const patch = confirmedPatch(item);
          results.push({
            productOrderNo,
            odNo: item.odNo,
            odSeq: item.odSeq,
            procSeq,
            status: 'ALREADY_CONFIRMED',
            message:
              '응답 지연이 있었으나 롯데ON 조회 결과 상품준비(연동완료)로 확인되었습니다. 다시 통보하지 마세요.',
            ...patch,
          });
          continue;
        }
        results.push({
          productOrderNo,
          odNo: item.odNo,
          odSeq: item.odSeq,
          procSeq,
          status: 'NEEDS_CHECK',
          message:
            '응답이 지연되어 처리 여부를 확정하지 못했습니다. 주문조회 후 상품준비인지 확인한 뒤, 아직 출고지시일 때만 다시 시도하세요.',
        });
        continue;
      }

      results.push({
        productOrderNo,
        odNo: item.odNo,
        odSeq: item.odSeq,
        procSeq,
        status: 'FAILED',
        message,
      });
    }
  }

  return {
    requestedCount: input.items.length,
    confirmedCount: results.filter((row) => row.status === 'CONFIRMED').length,
    alreadyConfirmedCount: results.filter((row) => row.status === 'ALREADY_CONFIRMED').length,
    failedCount: results.filter((row) => row.status === 'FAILED').length,
    skippedCount: results.filter((row) => row.status === 'SKIPPED_NOT_ELIGIBLE').length,
    needsCheckCount: results.filter((row) => row.status === 'NEEDS_CHECK').length,
    results,
  };
}
