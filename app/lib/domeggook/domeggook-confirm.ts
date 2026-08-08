import type { DomeggookSetOrdChkResult } from '@/app/lib/domeggook/client';
import {
  isDomeggookAlreadyConfirmedStatusMode,
  isDomeggookConfirmableStatusMode,
} from '@/app/lib/domeggook/domeggook-ids';
import { toDomeggookOrderNoQueryValue } from '@/app/lib/domeggook/client';

export type DomeggookConfirmItemStatus =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  | 'FAILED'
  | 'SKIPPED_NOT_WAITCHK';

export type DomeggookConfirmRequestItem = {
  /** 화면 표시용 원본 주문번호 */
  displayOrderNo: string;
  /** API용 숫자 주문번호 (OR 제거됨) */
  apiOrderNo: string;
  orderUid?: string | null;
  statusMode?: string | null;
  statusLabel?: string | null;
};

export type DomeggookConfirmItemResult = {
  displayOrderNo: string;
  apiOrderNo: string;
  orderUid: string;
  status: DomeggookConfirmItemStatus;
  message: string;
};

export type DomeggookConfirmRunResult = {
  requestedCount: number;
  confirmedCount: number;
  alreadyConfirmedCount: number;
  failedCount: number;
  skippedCount: number;
  results: DomeggookConfirmItemResult[];
};

export function validateDomeggookConfirmItems(
  raw: unknown,
): { ok: true; items: DomeggookConfirmRequestItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '발주확인할 주문 목록이 필요합니다.' };
  }
  if (raw.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }
  if (raw.length > 100) {
    return { ok: false, error: '한 번에 최대 100건까지 발주확인할 수 있습니다.' };
  }

  const items: DomeggookConfirmRequestItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: '주문 항목 형식이 올바르지 않습니다.' };
    }
    const record = entry as Record<string, unknown>;
    const displayOrderNo = String(record.displayOrderNo ?? record.orderNo ?? '').trim();
    const apiOrderNoRaw = String(record.apiOrderNo ?? '').trim();
    const apiOrderNo =
      apiOrderNoRaw && /^\d+$/.test(apiOrderNoRaw)
        ? apiOrderNoRaw
        : toDomeggookOrderNoQueryValue(displayOrderNo);
    if (!displayOrderNo || !apiOrderNo) {
      return {
        ok: false,
        error: '숫자 주문번호가 없는 항목은 발주확인할 수 없습니다.',
      };
    }
    if (seen.has(apiOrderNo)) continue;
    seen.add(apiOrderNo);
    items.push({
      displayOrderNo,
      apiOrderNo,
      orderUid: record.orderUid == null ? null : String(record.orderUid),
      statusMode: record.statusMode == null ? null : String(record.statusMode),
      statusLabel: record.statusLabel == null ? null : String(record.statusLabel),
    });
  }
  if (items.length === 0) {
    return { ok: false, error: '발주확인할 주문을 선택해 주세요.' };
  }
  return { ok: true, items };
}

function mapApiNos(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim()).filter((v) => /^\d+$/.test(v)));
}

export async function runDomeggookConfirm(input: {
  items: DomeggookConfirmRequestItem[];
  setOrdChk: (apiOrderNos: string[]) => Promise<DomeggookSetOrdChkResult>;
}): Promise<DomeggookConfirmRunResult> {
  const results: DomeggookConfirmItemResult[] = [];
  const toCall: DomeggookConfirmRequestItem[] = [];
  let alreadyConfirmedCount = 0;
  let skippedCount = 0;

  for (const item of input.items) {
    const statusMode = String(item.statusMode ?? '').trim();
    const statusLabel = String(item.statusLabel ?? '').trim();
    if (isDomeggookAlreadyConfirmedStatusMode(statusMode, statusLabel)) {
      alreadyConfirmedCount += 1;
      results.push({
        displayOrderNo: item.displayOrderNo,
        apiOrderNo: item.apiOrderNo,
        orderUid: String(item.orderUid ?? '').trim(),
        status: 'ALREADY_CONFIRMED',
        message: '이미 발주확인(배송준비중 이상) 상태입니다.',
      });
      continue;
    }
    if (!isDomeggookConfirmableStatusMode(statusMode, statusLabel)) {
      skippedCount += 1;
      results.push({
        displayOrderNo: item.displayOrderNo,
        apiOrderNo: item.apiOrderNo,
        orderUid: String(item.orderUid ?? '').trim(),
        status: 'SKIPPED_NOT_WAITCHK',
        message: '결제완료(WAITCHK) 주문만 발주확인할 수 있습니다.',
      });
      continue;
    }
    toCall.push(item);
  }

  let confirmedCount = 0;
  let failedCount = 0;

  if (toCall.length > 0) {
    const apiResult = await input.setOrdChk(toCall.map((item) => item.apiOrderNo));
    const successSet = mapApiNos(apiResult.successNos);
    const failSet = mapApiNos(apiResult.failNos);

    for (const item of toCall) {
      if (successSet.has(item.apiOrderNo)) {
        confirmedCount += 1;
        results.push({
          displayOrderNo: item.displayOrderNo,
          apiOrderNo: item.apiOrderNo,
          orderUid: String(item.orderUid ?? '').trim(),
          status: 'CONFIRMED',
          message: '발주확인이 완료되었습니다.',
        });
        continue;
      }
      if (failSet.has(item.apiOrderNo)) {
        failedCount += 1;
        results.push({
          displayOrderNo: item.displayOrderNo,
          apiOrderNo: item.apiOrderNo,
          orderUid: String(item.orderUid ?? '').trim(),
          status: 'FAILED',
          message: '도매꾹 발주확인에 실패했습니다.',
        });
        continue;
      }
      // success/fail 목록에 없으면 API result 플래그만으로 추정하지 않고 실패로 보존
      failedCount += 1;
      results.push({
        displayOrderNo: item.displayOrderNo,
        apiOrderNo: item.apiOrderNo,
        orderUid: String(item.orderUid ?? '').trim(),
        status: 'FAILED',
        message: apiResult.apiResultFlag
          ? '발주확인 응답에서 해당 주문 결과를 확인하지 못했습니다.'
          : '도매꾹 발주확인에 실패했습니다.',
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
