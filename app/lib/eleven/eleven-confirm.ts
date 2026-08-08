import type { ElevenCredentials, ElevenMutationResult } from '@/app/lib/eleven/client';
import {
  buildElevenProductOrderNo,
  isElevenAlreadyPackagingStatus,
  isElevenConfirmableStatus,
  normalizeElevenAddPrdNoForPath,
  normalizeElevenAddPrdYn,
  type ElevenLineIds,
} from '@/app/lib/eleven/eleven-ids';
import {
  mapElevenOrderToStandardRow,
} from '@/app/lib/eleven/map-eleven-orders';
import { buildOrderFetchViewsFromStandardRows } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';

export type ElevenConfirmItemStatus =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  | 'FAILED'
  | 'SKIPPED_NOT_COMPLETE';

export type ElevenConfirmRequestItem = {
  ordNo: string;
  ordPrdSeq: string;
  dlvNo: string;
  addPrdYn?: string | null;
  addPrdNo?: string | null;
  /** 화면/스냅샷 상태 코드 또는 라벨 */
  ordStat?: string | null;
  ordStatNm?: string | null;
};

export type ElevenConfirmItemResult = {
  productOrderNo: string;
  ordNo: string;
  ordPrdSeq: string;
  dlvNo: string;
  status: ElevenConfirmItemStatus;
  message: string;
  standardRows?: StandardOrderRow[];
  views?: OrderFetchView[];
};

export type ElevenConfirmRunResult = {
  requestedCount: number;
  confirmedCount: number;
  alreadyConfirmedCount: number;
  failedCount: number;
  skippedCount: number;
  results: ElevenConfirmItemResult[];
};

export function validateElevenConfirmItems(
  raw: unknown,
): { ok: true; items: ElevenConfirmRequestItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '발주확인할 주문 목록이 필요합니다.' };
  }
  if (raw.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }
  if (raw.length > 100) {
    return { ok: false, error: '한 번에 최대 100건까지 발주확인할 수 있습니다.' };
  }

  const items: ElevenConfirmRequestItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: '주문 항목 형식이 올바르지 않습니다.' };
    }
    const record = entry as Record<string, unknown>;
    const ordNo = String(record.ordNo ?? '').trim();
    const ordPrdSeq = String(record.ordPrdSeq ?? '').trim();
    const dlvNo = String(record.dlvNo ?? '').trim();
    if (!ordNo || !ordPrdSeq || !dlvNo) {
      return {
        ok: false,
        error: 'ordNo·ordPrdSeq·dlvNo가 없는 항목은 발주확인할 수 없습니다.',
      };
    }
    if (/\s/.test(ordNo) || /\s/.test(ordPrdSeq) || /\s/.test(dlvNo)) {
      return { ok: false, error: '주문 식별자에 공백이 포함되어 있습니다.' };
    }
    const key = `${ordNo}|${ordPrdSeq}|${dlvNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      ordNo,
      ordPrdSeq,
      dlvNo,
      addPrdYn: record.addPrdYn == null ? null : String(record.addPrdYn),
      addPrdNo: record.addPrdNo == null ? null : String(record.addPrdNo),
      ordStat: record.ordStat == null ? null : String(record.ordStat),
      ordStatNm: record.ordStatNm == null ? null : String(record.ordStatNm),
    });
  }
  if (items.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }
  return { ok: true, items };
}

function toLineIds(item: ElevenConfirmRequestItem): ElevenLineIds {
  const addPrdYn = normalizeElevenAddPrdYn(item.addPrdYn);
  return {
    ordNo: item.ordNo,
    ordPrdSeq: item.ordPrdSeq,
    dlvNo: item.dlvNo,
    addPrdYn,
    addPrdNo: normalizeElevenAddPrdNoForPath(addPrdYn, item.addPrdNo),
    ordStat: String(item.ordStat ?? '').trim(),
  };
}

function packagingPatchRows(item: ElevenConfirmRequestItem): {
  standardRows: StandardOrderRow[];
  views: OrderFetchView[];
} {
  const addPrdYn = normalizeElevenAddPrdYn(item.addPrdYn);
  const row = mapElevenOrderToStandardRow({
    ordNo: item.ordNo,
    ordPrdSeq: item.ordPrdSeq,
    ordStat: '201',
    ordStatNm: '배송준비중',
    ordPrdNm: '',
    slctPrdOptNm: '',
    ordOptWonStl: '',
    ordQty: '',
    rcvrNm: '',
    rcvrTlphn: '',
    rcvrPrtblNo: '',
    rcvrMailNo: '',
    rcvrBaseAddr: '',
    rcvrDtlsAddr: '',
    ordDlvReqCont: '',
    dlvMsg: '',
    ordNm: '',
    ordTlphnNo: '',
    ordPrtblTel: '',
    ordDt: '',
    ordStlEndDt: '',
    ordPayAmt: '',
    memID: '',
    dlvNo: item.dlvNo,
    addPrdYn,
    addPrdNo: normalizeElevenAddPrdNoForPath(addPrdYn, item.addPrdNo),
    invcNo: '',
    dlvEtprsCd: '',
    dlvMthdCd: '',
  });
  const standardRows = [{ ...row }] as StandardOrderRow[];
  return {
    standardRows,
    views: buildOrderFetchViewsFromStandardRows(standardRows),
  };
}

export async function runElevenConfirm(input: {
  items: ElevenConfirmRequestItem[];
  reqPackaging: (line: ElevenLineIds) => Promise<ElevenMutationResult>;
}): Promise<ElevenConfirmRunResult> {
  const results: ElevenConfirmItemResult[] = [];
  let confirmedCount = 0;
  let alreadyConfirmedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const item of input.items) {
    const productOrderNo = buildElevenProductOrderNo(item.ordNo, item.ordPrdSeq);
    const ordStat = String(item.ordStat ?? '').trim();
    const ordStatNm = String(item.ordStatNm ?? '').trim();

    if (isElevenAlreadyPackagingStatus(ordStat, ordStatNm)) {
      alreadyConfirmedCount += 1;
      const patch = packagingPatchRows(item);
      results.push({
        productOrderNo,
        ordNo: item.ordNo,
        ordPrdSeq: item.ordPrdSeq,
        dlvNo: item.dlvNo,
        status: 'ALREADY_CONFIRMED',
        message: '이미 발주확인(배송준비중) 상태입니다.',
        ...patch,
      });
      continue;
    }

    if (!isElevenConfirmableStatus(ordStat, ordStatNm)) {
      skippedCount += 1;
      results.push({
        productOrderNo,
        ordNo: item.ordNo,
        ordPrdSeq: item.ordPrdSeq,
        dlvNo: item.dlvNo,
        status: 'SKIPPED_NOT_COMPLETE',
        message: '결제완료(complete) 상태 주문만 발주확인할 수 있습니다.',
      });
      continue;
    }

    const line = toLineIds(item);
    try {
      const api = await input.reqPackaging(line);
      if (api.ok) {
        confirmedCount += 1;
        const patch = packagingPatchRows(item);
        results.push({
          productOrderNo,
          ordNo: item.ordNo,
          ordPrdSeq: item.ordPrdSeq,
          dlvNo: item.dlvNo,
          status: 'CONFIRMED',
          message: '발주확인이 완료되었습니다.',
          ...patch,
        });
      } else {
        failedCount += 1;
        results.push({
          productOrderNo,
          ordNo: item.ordNo,
          ordPrdSeq: item.ordPrdSeq,
          dlvNo: item.dlvNo,
          status: 'FAILED',
          message: api.displayMessage || '발주확인에 실패했습니다.',
        });
      }
    } catch (error) {
      failedCount += 1;
      results.push({
        productOrderNo,
        ordNo: item.ordNo,
        ordPrdSeq: item.ordPrdSeq,
        dlvNo: item.dlvNo,
        status: 'FAILED',
        message:
          error instanceof Error && error.message
            ? error.message
            : '발주확인 처리 중 오류가 발생했습니다.',
      });
    }
  }

  return {
    requestedCount: input.items.length,
    confirmedCount,
    alreadyConfirmedCount,
    failedCount,
    skippedCount,
    results,
  };
}

export type ElevenConfirmPackagingCaller = {
  credentials: ElevenCredentials;
  call: typeof import('@/app/lib/eleven/client').elevenReqPackaging;
};

export async function callElevenReqPackagingForLine(
  caller: ElevenConfirmPackagingCaller,
  line: ElevenLineIds,
) {
  return caller.call({
    credentials: caller.credentials,
    ordNo: line.ordNo,
    ordPrdSeq: line.ordPrdSeq,
    addPrdYn: line.addPrdYn,
    addPrdNo: line.addPrdNo,
    dlvNo: line.dlvNo,
  });
}
