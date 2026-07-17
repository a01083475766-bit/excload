import { NextResponse } from 'next/server';
import { OrderIntegrationAccountStatus } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getHealthAdapter,
  isHealthCheckFresh,
} from '@/app/lib/order-integration/connection-health/provider-health-registry';
import { registerBuiltInHealthAdapters } from '@/app/lib/order-integration/connection-health/adapters';
import { persistConnectionHealth } from '@/app/lib/order-integration/connection-health/persist-health-result';
import { configErrorScopeFromCode } from '@/app/lib/order-integration/connection-health/provider-connection-help';
import type {
  ConnectionHealthResult,
  HealthStatus,
} from '@/app/lib/order-integration/connection-health/types';

const HEALTH_CHECK_TIMEOUT_MS = 15_000;
/** 강제(force) 재확인이라도 이 간격 안에는 실제 재호출하지 않는다(과호출 방어). */
const FORCE_MIN_INTERVAL_MS = 30_000;

async function runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('HEALTH_CHECK_TIMEOUT')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * 단일 계정의 실시간 연결 상태를 확인한다.
 * 반드시 계정 소유자만 자신의 accountId를 검사할 수 있다.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const { accountId } = await context.params;
  if (!accountId) {
    return NextResponse.json({ error: '계정 ID가 필요합니다.' }, { status: 400 });
  }

  // 소유권 검증: 다른 사용자의 accountId는 조회·검사할 수 없다.
  const account = await prisma.orderIntegrationAccount.findFirst({
    where: { id: accountId, userId: auth.userId },
  });
  if (!account) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
  }

  // INACTIVE(비활성) 계정은 검사하지 않는다. status=ERROR는 사용 중 계정으로 보고 검사 대상.
  if (account.status === OrderIntegrationAccountStatus.INACTIVE) {
    return NextResponse.json({
      success: false,
      skipped: 'INACTIVE',
      message: '비활성 계정은 연결 확인을 하지 않습니다.',
    });
  }

  registerBuiltInHealthAdapters();
  const adapter = getHealthAdapter(account.provider);
  if (!adapter) {
    // 아직 provider 어댑터가 없으므로 DB를 바꾸지 않고 준비 중임을 알린다.
    return NextResponse.json({
      success: false,
      ready: false,
      readiness: null,
      message: '이 쇼핑몰의 실시간 연결 확인은 준비 중입니다.',
    });
  }

  const force = new URL(request.url).searchParams.get('force') === '1';

  // 준비 상태 게이팅: 운영 자동/수동 확인은 VERIFIED만 실제 호출한다.
  // - DISABLED: 헬스체크 호출 금지
  // - PROVISIONAL: 공식 사양/실계정 검증 전. 운영에서는 외부 호출하지 않고 저장된 상태만 표시.
  //   (개발 환경에서 명시적 force일 때만 검사 허용)
  if (adapter.readiness === 'DISABLED') {
    return NextResponse.json({
      success: false,
      ready: false,
      readiness: 'DISABLED',
      message: '이 쇼핑몰은 연결 확인을 지원하지 않습니다.',
    });
  }
  const isDevExplicitProvisional =
    adapter.readiness === 'PROVISIONAL' && process.env.NODE_ENV !== 'production' && force;
  if (adapter.readiness === 'PROVISIONAL' && !isDevExplicitProvisional) {
    return NextResponse.json({
      success: false,
      ready: false,
      readiness: 'PROVISIONAL',
      healthStatus: (account.healthStatus as HealthStatus | null) ?? null,
      lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
      message: '이 쇼핑몰의 실시간 연결 확인은 준비 중입니다.',
    });
  }

  // 강제 재검사는 명시적 옵션(force)이 있을 때만. 그 외에는 최근 10분 결과를 재사용한다.
  const cachedResponse = (throttled: boolean) =>
    NextResponse.json({
      success: true,
      ready: true,
      cached: true,
      throttled,
      healthStatus: (account.healthStatus as HealthStatus | null) ?? null,
      lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
      lastSuccessAt: account.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: account.lastFailureAt?.toISOString() ?? null,
      lastErrorCategory: account.lastErrorCategory ?? null,
      configErrorScope:
        account.healthStatus === 'ACCOUNT_CONFIG_ERROR'
          ? configErrorScopeFromCode(account.lastErrorCode)
          : null,
      consecutiveFailureCount: account.consecutiveFailureCount ?? 0,
    });

  // 자동 확인(비강제): 최근 10분 결과 재사용.
  if (!force && isHealthCheckFresh(account.lastCheckedAt)) {
    return cachedResponse(false);
  }
  // 강제 확인이라도 최소 재호출 간격(30초) 안에는 재사용해 연속 클릭 과호출을 막는다.
  if (force && isHealthCheckFresh(account.lastCheckedAt, new Date(), FORCE_MIN_INTERVAL_MS)) {
    return cachedResponse(true);
  }

  let result: ConnectionHealthResult;
  try {
    result = await runWithTimeout(adapter.checkConnection(account), HEALTH_CHECK_TIMEOUT_MS);
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'HEALTH_CHECK_TIMEOUT';
    result = {
      status: isTimeout ? 'TEMPORARY_ERROR' : 'UNKNOWN',
      rawCode: isTimeout ? 'TIMEOUT' : 'ADAPTER_THROW',
      checkedAt: new Date(),
    };
  }

  const effective = await persistConnectionHealth({ accountId, result });

  return NextResponse.json({
    success: true,
    ready: true,
    readiness: adapter.readiness,
    healthStatus: effective.healthStatus,
    lastCheckedAt: effective.lastCheckedAt,
    lastSuccessAt: effective.lastSuccessAt,
    lastFailureAt: effective.lastFailureAt,
    lastErrorCategory: effective.lastErrorCategory,
    // 설정 오류일 때만 안전한 원인 구분을 전달(원본 rawCode는 노출하지 않음).
    configErrorScope:
      effective.healthStatus === 'ACCOUNT_CONFIG_ERROR'
        ? configErrorScopeFromCode(result.rawCode)
        : null,
    consecutiveFailureCount: effective.consecutiveFailureCount,
  });
}
