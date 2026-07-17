import type { HealthStatus } from './types';

export type ConnectionHealthDisplayInput = {
  healthStatus: HealthStatus | null;
  lastErrorCategory?: string | null;
  lastSuccessAt?: string | Date | null;
  lastFailureAt?: string | Date | null;
  consecutiveFailureCount?: number | null;
};

export type ConnectionHealthDisplay = {
  /** 배지에 표시할 상태(null = 미확인). REQUEST_INVALID 등은 정상으로 숨긴다. */
  status: HealthStatus | null;
  /** 사용자 조치가 필요한 문제 상태인지(정상·미확인·정상 복귀는 false). */
  isProblem: boolean;
  /** 일시적 경고(연결 해제로 표현하지 않음). */
  soft: boolean;
};

function ms(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * 저장된 헬스 필드로부터 화면 표시용 상태를 계산하는 순수 함수.
 *
 * 규칙:
 * - HEALTHY이고 최근 실패 없음 → 연결 정상
 * - healthStatus=HEALTHY지만 lastFailureAt가 lastSuccessAt보다 최근이고 카테고리가
 *   TEMPORARY_ERROR/UNKNOWN이며 연속 실패 1~2회 → 일시적 상태 확인 실패(주황·경고, 연결 해제 아님)
 * - RATE_LIMITED → 일시적 호출 제한(경고, 연결 해제 아님)
 * - AUTH_REQUIRED·IP_NOT_ALLOWED·PERMISSION_DENIED·APPROVAL_REQUIRED·ACCOUNT_CONFIG_ERROR → 조치 필요
 * - 성공이 최근 실패보다 나중이면 정상 복귀
 * - REQUEST_INVALID는 연결 상태 배지에 표시하지 않음(정상으로 처리)
 */
export function resolveConnectionHealthDisplay(
  input: ConnectionHealthDisplayInput,
): ConnectionHealthDisplay {
  const hs = input.healthStatus;
  if (hs == null) return { status: null, isProblem: false, soft: false };

  if (hs === 'REQUEST_INVALID') return { status: 'HEALTHY', isProblem: false, soft: false };

  const successMs = ms(input.lastSuccessAt);
  const failureMs = ms(input.lastFailureAt);
  const count = input.consecutiveFailureCount ?? 0;
  const failureIsNewer = failureMs != null && (successMs == null || failureMs > successMs);
  const successIsNewer = successMs != null && (failureMs == null || successMs >= failureMs);

  if (hs === 'HEALTHY') {
    const cat = input.lastErrorCategory;
    if (failureIsNewer && (cat === 'TEMPORARY_ERROR' || cat === 'UNKNOWN') && count >= 1 && count <= 2) {
      return { status: 'TEMPORARY_ERROR', isProblem: true, soft: true };
    }
    return { status: 'HEALTHY', isProblem: false, soft: false };
  }

  // 저장된 상태가 문제 상태인 경우
  if (successIsNewer) return { status: 'HEALTHY', isProblem: false, soft: false };

  const soft = hs === 'TEMPORARY_ERROR' || hs === 'UNKNOWN' || hs === 'RATE_LIMITED';
  return { status: hs, isProblem: true, soft };
}
