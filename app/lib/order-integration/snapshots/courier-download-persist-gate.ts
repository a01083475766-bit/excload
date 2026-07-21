/**
 * 택배양식 다운로드 전 스냅샷 저장 API 응답 판정.
 * flag ON(attempted)이면 저장 실패 시 다운로드를 막는다.
 */

export type CourierDownloadPersistGroupResult = {
  mallId?: string;
  accountId?: string;
  persisted: boolean;
  reason?: string;
  orderCount?: number;
};

export type CourierDownloadPersistApiBody = {
  success?: boolean;
  attempted?: boolean;
  savedOrderCount?: number;
  skippedDuplicateOrEmpty?: number;
  error?: string;
  groupResults?: CourierDownloadPersistGroupResult[];
};

export type CourierDownloadPersistGate =
  | {
      ok: true;
      /** flag OFF 등 — 저장을 시도하지 않음. 다운로드 허용 */
      attempted: false;
      notice: string;
    }
  | {
      ok: true;
      attempted: true;
      savedOrderCount: number;
      notice: string;
    }
  | {
      ok: false;
      message: string;
    };

const FAIL_MESSAGE =
  '송장 매칭·전송용 주문 저장에 실패하여 다운로드를 중단했습니다.\n잠시 후 다시 시도해 주세요.';

/**
 * HTTP 실패 또는 본문 기준으로 다운로드 진행 여부를 판정합니다.
 */
export function evaluateCourierDownloadPersistGate(input: {
  httpOk: boolean;
  body: CourierDownloadPersistApiBody | null;
}): CourierDownloadPersistGate {
  const body = input.body;
  if (!input.httpOk) {
    const fromServer =
      typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
    return { ok: false, message: fromServer ?? FAIL_MESSAGE };
  }

  if (!body || body.success === false) {
    const fromServer =
      typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
    return { ok: false, message: fromServer ?? FAIL_MESSAGE };
  }

  if (!body.attempted) {
    return { ok: true, attempted: false, notice: '' };
  }

  const groups = Array.isArray(body.groupResults) ? body.groupResults : [];
  if (groups.length === 0) {
    return { ok: false, message: FAIL_MESSAGE };
  }

  const anyFailed = groups.some((g) => !g.persisted);
  if (anyFailed) {
    return { ok: false, message: FAIL_MESSAGE };
  }

  const saved = Number(body.savedOrderCount) || 0;
  const notice =
    saved > 0
      ? ` · 송장매칭용 ${saved.toLocaleString()}건 저장`
      : ' · 송장매칭용 주문은 이미 저장되어 있습니다';

  return {
    ok: true,
    attempted: true,
    savedOrderCount: saved,
    notice,
  };
}
