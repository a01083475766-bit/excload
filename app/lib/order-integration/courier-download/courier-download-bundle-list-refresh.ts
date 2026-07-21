/**
 * Hub → ShipmentMatchPanel: 택배양식 Bundle 목록 재조회·자동 선택.
 * React 컴포넌트와 분리해 단위 테스트 가능하게 유지.
 */

export type CourierDownloadBundleListRefreshSignal = {
  /** 성공 생성마다 증가. 0 이하는 무시 */
  nonce: number;
  /** POST 응답 bundle.id — 없으면 null(목록만 갱신) */
  selectBundleId: string | null;
};

export function shouldApplyCourierDownloadBundleListRefresh(
  signal: CourierDownloadBundleListRefreshSignal | null | undefined,
  lastHandledNonce: number,
): signal is CourierDownloadBundleListRefreshSignal {
  if (!signal) return false;
  if (!Number.isFinite(signal.nonce) || signal.nonce <= 0) return false;
  return signal.nonce !== lastHandledNonce;
}

/**
 * Bundle 생성 성공 시에만 다음 신호 생성.
 * 예시 미리보기·실패·id 없음(성공이 아님)은 null.
 */
export function buildNextCourierDownloadBundleListRefreshSignal(input: {
  previous: CourierDownloadBundleListRefreshSignal | null | undefined;
  createSucceeded: boolean;
  isExamplePreview: boolean;
  createdBundleId: string | null | undefined;
}): CourierDownloadBundleListRefreshSignal | null {
  if (input.isExamplePreview) return null;
  if (!input.createSucceeded) return null;
  const id = typeof input.createdBundleId === 'string' ? input.createdBundleId.trim() : '';
  if (!id) return null;
  return {
    nonce: (input.previous?.nonce ?? 0) + 1,
    selectBundleId: id,
  };
}

/**
 * 초기 로드: 기존 선택 유지, 없으면 목록 1건일 때만 자동 선택.
 * 재조회(refresh): preferred가 목록에 있으면 무조건 그 ID 선택.
 */
export function resolveSelectedDownloadBundleId(input: {
  mode: 'initial' | 'refresh';
  bundles: ReadonlyArray<{ id: string }>;
  currentSelectedId: string;
  preferredBundleId?: string | null;
}): string {
  const preferred =
    typeof input.preferredBundleId === 'string' ? input.preferredBundleId.trim() : '';
  const ids = new Set(input.bundles.map((b) => b.id));

  if (input.mode === 'refresh' && preferred && ids.has(preferred)) {
    return preferred;
  }

  const current = input.currentSelectedId;
  if (current === 'none') return 'none';
  if (current && ids.has(current)) return current;

  if (input.mode === 'initial' && input.bundles.length === 1) {
    return input.bundles[0]!.id;
  }

  if (input.mode === 'refresh' && input.bundles.length === 1) {
    return input.bundles[0]!.id;
  }

  return '';
}
