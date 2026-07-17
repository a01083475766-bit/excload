import { OrderIntegrationAccountStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import { categorizeApiError, worsensConnection } from './error-categories';
import type {
  ConnectionHealthResult,
  HealthErrorCategory,
  HealthFieldsPatch,
  HealthStatus,
  PreviousHealthState,
} from './types';

/** 일시적(soft) 오류가 연속 이 횟수 이상일 때만 healthStatus를 강등한다. */
export const FAILURE_DEGRADE_THRESHOLD = 3;

/** 연속 실패 누적으로만 상태를 강등하는 오류(첫 실패에는 상태를 바꾸지 않음). */
function isSoftFailure(status: ConnectionHealthResult['status']): boolean {
  return status === 'TEMPORARY_ERROR' || status === 'UNKNOWN';
}

/**
 * 검사 결과를 계정 헬스 필드 업데이트로 변환한다(순수 함수, DB 접근 없음).
 *
 * 규칙:
 * - HEALTHY: healthStatus=HEALTHY, lastSuccessAt 갱신, 오류 필드 초기화, 연속 실패 0.
 * - REQUEST_INVALID(중립): lastCheckedAt만 갱신. 연결 상태/카운터/실패시각을 건드리지 않는다.
 * - 즉시 조치 오류(AUTH_REQUIRED·IP_NOT_ALLOWED·PERMISSION_DENIED·APPROVAL_REQUIRED·
 *   ACCOUNT_CONFIG_ERROR)와 RATE_LIMITED: 첫 실패부터 healthStatus에 즉시 기록.
 * - TEMPORARY_ERROR·UNKNOWN(일시적): 연속 실패 1~2회는 기존 healthStatus 유지(카테고리·코드·
 *   실패시각·카운터만 갱신), 연속 3회 이상부터 healthStatus 강등.
 *
 * 이 함수는 계정 활성/비활성(`status`)이나 토큰 만료(`expiresAt`)를 절대 변경하지 않는다.
 */
export function computeHealthFields(
  previous: PreviousHealthState,
  result: ConnectionHealthResult,
): HealthFieldsPatch {
  const checkedAt = result.checkedAt;

  if (result.status === 'HEALTHY') {
    return {
      lastCheckedAt: checkedAt,
      healthStatus: 'HEALTHY',
      lastSuccessAt: checkedAt,
      lastErrorCategory: null,
      lastErrorCode: null,
      consecutiveFailureCount: 0,
    };
  }

  // 요청 파라미터 문제는 연결 상태를 악화시키지 않는다(중립).
  if (!worsensConnection(result.status)) {
    return { lastCheckedAt: checkedAt };
  }

  const count = (previous.consecutiveFailureCount ?? 0) + 1;
  const base: HealthFieldsPatch = {
    lastCheckedAt: checkedAt,
    lastFailureAt: checkedAt,
    lastErrorCategory: result.status as HealthErrorCategory,
    lastErrorCode: result.rawCode ?? null,
    consecutiveFailureCount: count,
  };

  // 일시적 오류는 누적 실패가 임계치에 도달하기 전까지 기존 healthStatus를 유지한다.
  if (isSoftFailure(result.status) && count < FAILURE_DEGRADE_THRESHOLD) {
    return base;
  }

  return { ...base, healthStatus: result.status };
}

/** persist 후 화면 표시 계산에 필요한 유효 헬스 필드(이전값+패치 병합). */
export type EffectiveHealth = {
  healthStatus: HealthStatus | null;
  lastErrorCategory: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastCheckedAt: string | null;
  consecutiveFailureCount: number;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * 모든 업무 결과(자동 헬스체크·연결 테스트·주문조회·향후 송장전송)를 하나의 규칙으로 저장한다.
 * - 실제 연결 결과는 healthStatus(및 computeHealthFields 규칙)에 기록
 * - 성공 시 계정 사용 상태를 ACTIVE로 회복(legacy ERROR 복구)하고 오류 메시지 초기화
 * - 실패 시 status를 ERROR로 강등하지 않는다(계정 사용 여부와 연결 실패를 분리)
 * - REQUEST_INVALID(중립)는 healthStatus·실패 횟수·lastFailureAt를 변경하지 않음
 * status(계정 활성/비활성)와 healthStatus(실제 연결)를 서로 다른 상태로 어긋나지 않게 한곳에서 처리한다.
 */
export async function persistConnectionHealth(input: {
  accountId: string;
  result: ConnectionHealthResult;
  /** 레거시 표시용 메시지(lastErrorMessage). 실패 시에만 기록. 비밀정보 금지. */
  userMessage?: string | null;
  /** 레거시 타임스탬프 등 추가로 함께 저장할 필드(lastTestedAt/lastSyncedAt). status·health 필드는 덮어쓰지 않는다. */
  extra?: Prisma.OrderIntegrationAccountUpdateInput;
}): Promise<EffectiveHealth> {
  const previous = await prisma.orderIntegrationAccount.findUnique({
    where: { id: input.accountId },
    select: {
      healthStatus: true,
      consecutiveFailureCount: true,
      lastErrorCategory: true,
      lastSuccessAt: true,
      lastFailureAt: true,
    },
  });

  const patch = computeHealthFields(previous ?? {}, input.result);

  const data: Prisma.OrderIntegrationAccountUpdateInput = { ...(input.extra ?? {}), ...patch };
  if (input.result.status === 'HEALTHY') {
    data.status = OrderIntegrationAccountStatus.ACTIVE;
    data.lastErrorMessage = null;
  } else if (worsensConnection(input.result.status) && input.userMessage !== undefined) {
    data.lastErrorMessage = input.userMessage;
  }

  await prisma.orderIntegrationAccount.update({
    where: { id: input.accountId },
    data,
  });

  const has = (key: keyof HealthFieldsPatch) => Object.prototype.hasOwnProperty.call(patch, key);
  return {
    healthStatus: (has('healthStatus') ? patch.healthStatus : (previous?.healthStatus as HealthStatus | null)) ?? null,
    lastErrorCategory: (has('lastErrorCategory') ? patch.lastErrorCategory : previous?.lastErrorCategory) ?? null,
    lastSuccessAt: toIso(has('lastSuccessAt') ? patch.lastSuccessAt : previous?.lastSuccessAt),
    lastFailureAt: toIso(has('lastFailureAt') ? patch.lastFailureAt : previous?.lastFailureAt),
    lastCheckedAt: toIso(patch.lastCheckedAt),
    consecutiveFailureCount:
      (has('consecutiveFailureCount') ? patch.consecutiveFailureCount : previous?.consecutiveFailureCount) ?? 0,
  };
}

const RAW_MESSAGE_MAX = 200;

/**
 * 사용자용 오류 메시지(문자열)만 있는 경우의 공통 변환.
 * 세부 httpStatus/코드가 없는 test/sync 실패 경로에서 사용한다(정밀 분류는 헬스체크 어댑터가 담당).
 */
export function healthResultFromMessage(message: string, checkedAt: Date): ConnectionHealthResult {
  return {
    status: categorizeApiError({ message }),
    rawMessage: message.length > RAW_MESSAGE_MAX ? `${message.slice(0, RAW_MESSAGE_MAX)}…` : message,
    checkedAt,
  };
}

/**
 * 몰별 markXTestResult 공통 구현(얇은 래퍼).
 * healthStatus 판정·연속 실패 계산·성공 초기화·강등 규칙은 전부 persistConnectionHealth가 담당한다.
 */
export async function recordConnectionTestResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  const now = new Date();
  const message = input.errorMessage ?? '연결 테스트에 실패했습니다.';
  await persistConnectionHealth({
    accountId: input.accountId,
    result: input.success ? { status: 'HEALTHY', checkedAt: now } : healthResultFromMessage(message, now),
    userMessage: input.success ? undefined : message,
    extra: { lastTestedAt: now },
  });
}

/** 몰별 markXSyncResult 공통 구현(얇은 래퍼). lastSyncedAt은 성공 시에만 갱신. */
export async function recordConnectionSyncResult(input: {
  accountId: string;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  const now = new Date();
  const message = input.errorMessage ?? '주문 수집에 실패했습니다.';
  await persistConnectionHealth({
    accountId: input.accountId,
    result: input.success ? { status: 'HEALTHY', checkedAt: now } : healthResultFromMessage(message, now),
    userMessage: input.success ? undefined : message,
    extra: input.success ? { lastSyncedAt: now } : undefined,
  });
}
