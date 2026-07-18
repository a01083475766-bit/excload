import { NextResponse } from 'next/server';
import {
  OrderIntegrationAccountStatus,
  type OrderIntegrationAccount,
} from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { getHealthAdapter } from '@/app/lib/order-integration/connection-health/provider-health-registry';
import { registerBuiltInHealthAdapters } from '@/app/lib/order-integration/connection-health/adapters';
import { persistConnectionHealth } from '@/app/lib/order-integration/connection-health/persist-health-result';
import { getHealthMessageForStatus } from '@/app/lib/order-integration/connection-health/messages';
import {
  claimConnectionHealthCheck,
  releaseConnectionHealthCheckLease,
} from '@/app/lib/order-integration/connection-health/concurrency';
import {
  normalizeHealthStatusForPublicView,
  orderIntegrationMallIdForProvider,
  toPublicConnectionHealthView,
} from '@/app/lib/order-integration/connection-health/public-health-view';
import type {
  ConnectionHealthResult,
  ConnectionOperationResult,
  ProviderReadiness,
} from '@/app/lib/order-integration/connection-health/types';

const HEALTH_CHECK_TIMEOUT_MS = 15_000;

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

async function getOwnedAccount(
  accountId: string,
  userId: string,
): Promise<OrderIntegrationAccount | null> {
  return prisma.orderIntegrationAccount.findFirst({
    where: { id: accountId, userId },
  });
}

function storedPublicHealth(
  account: OrderIntegrationAccount,
  readiness: ProviderReadiness | null,
) {
  return toPublicConnectionHealthView({
    mallId: orderIntegrationMallIdForProvider(account.provider),
    inactive: account.status === OrderIntegrationAccountStatus.INACTIVE,
    readiness,
    healthStatus: normalizeHealthStatusForPublicView(account.healthStatus),
    lastCheckedAt: account.lastCheckedAt,
    lastSuccessAt: account.lastSuccessAt,
    lastFailureAt: account.lastFailureAt,
    lastErrorCategory: account.lastErrorCategory,
    lastErrorCode: account.lastErrorCode,
    consecutiveFailureCount: account.consecutiveFailureCount,
  });
}

function notFoundResponse() {
  return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
}

function unavailableResponse(input: {
  account: OrderIntegrationAccount;
  readiness: ProviderReadiness | null;
  message: string;
}) {
  return NextResponse.json({
    success: false,
    message: input.message,
    ...storedPublicHealth(input.account, input.readiness),
  });
}

function getAdapterForAccount(account: OrderIntegrationAccount) {
  registerBuiltInHealthAdapters();
  return getHealthAdapter(account.provider);
}

/** 동일 계정의 실시간 연결 상태를 소유자만 확인한다. */
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

  const force = new URL(request.url).searchParams.get('force') === '1';
  const claim = await claimConnectionHealthCheck({
    accountId,
    userId: auth.userId,
    mode: force ? 'manual' : 'automatic',
  });

  if (!claim.claimed) {
    if (claim.reason === 'NOT_FOUND') return notFoundResponse();

    const account = await getOwnedAccount(accountId, auth.userId);
    if (!account) return notFoundResponse();

    const adapter = getAdapterForAccount(account);
    const publicHealth = storedPublicHealth(account, adapter?.readiness ?? null);

    if (claim.reason === 'INACTIVE') {
      return NextResponse.json({
        success: false,
        message: '비활성화된 계정은 연결 상태를 확인하지 않습니다.',
        ...publicHealth,
      });
    }
    if (claim.reason === 'IN_PROGRESS') {
      return NextResponse.json(
        {
          success: true,
          inProgress: true,
          message: '연결 상태를 확인 중입니다.',
          ...publicHealth,
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      success: true,
      cached: true,
      throttled: claim.reason === 'THROTTLED',
      message:
        claim.reason === 'THROTTLED'
          ? '잠시 후 다시 확인해 주세요.'
          : '최근 확인 결과를 표시합니다.',
      ...publicHealth,
    });
  }

  try {
    // claim 트랜잭션이 끝난 뒤 계정과 자격정보를 읽고 외부 공급자 API를 호출한다.
    const account = await getOwnedAccount(accountId, auth.userId);
    if (!account) return notFoundResponse();

    const adapter = getAdapterForAccount(account);

    // claim 직후 비활성화된 경우에도 외부 API를 호출하지 않는다.
    if (account.status === OrderIntegrationAccountStatus.INACTIVE) {
      return unavailableResponse({
        account,
        readiness: adapter?.readiness ?? null,
        message: '비활성화된 계정은 연결 상태를 확인하지 않습니다.',
      });
    }
    if (!adapter) {
      return unavailableResponse({
        account,
        readiness: null,
        message: '이 쇼핑몰의 실시간 연결 확인은 준비 중입니다.',
      });
    }
    if (adapter.readiness === 'DISABLED') {
      return unavailableResponse({
        account,
        readiness: adapter.readiness,
        message: '이 쇼핑몰은 연결 확인을 지원하지 않습니다.',
      });
    }
    const isDevExplicitProvisional =
      adapter.readiness === 'PROVISIONAL' && process.env.NODE_ENV !== 'production' && force;
    if (adapter.readiness === 'PROVISIONAL' && !isDevExplicitProvisional) {
      return unavailableResponse({
        account,
        readiness: adapter.readiness,
        message: '이 쇼핑몰의 실시간 연결 확인은 준비 중입니다.',
      });
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

    const operationResult: ConnectionOperationResult =
      result.status === 'HEALTHY'
        ? { success: true }
        : {
            success: false,
            category: result.status,
            errorCode: result.rawCode,
            userMessage: getHealthMessageForStatus(result.status).description,
            rawMessage: result.rawMessage,
          };
    const effective = await persistConnectionHealth({
      accountId,
      userId: auth.userId,
      operationSequence: claim.operationSequence,
      leaseToken: claim.leaseToken,
      result: operationResult,
    });
    const health = toPublicConnectionHealthView({
      mallId: orderIntegrationMallIdForProvider(account.provider),
      inactive: false,
      readiness: adapter.readiness,
      healthStatus: effective.healthStatus,
      lastCheckedAt: effective.lastCheckedAt,
      lastSuccessAt: effective.lastSuccessAt,
      lastFailureAt: effective.lastFailureAt,
      lastErrorCategory: effective.lastErrorCategory,
      lastErrorCode: result.rawCode,
      consecutiveFailureCount: effective.consecutiveFailureCount,
    });

    return NextResponse.json({
      success: true,
      ...health,
    });
  } finally {
    try {
      await releaseConnectionHealthCheckLease({
        accountId,
        userId: auth.userId,
        leaseToken: claim.leaseToken,
      });
    } catch {
      // lease에는 만료 시간이 있으며 해제 함수도 소유 토큰 조건부로 멱등 처리된다.
    }
  }
}
