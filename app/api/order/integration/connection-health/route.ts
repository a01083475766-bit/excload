import { NextResponse } from 'next/server';
import { OrderIntegrationAccountStatus } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { getProviderReadiness } from '@/app/lib/order-integration/connection-health/provider-health-registry';
import { registerBuiltInHealthAdapters } from '@/app/lib/order-integration/connection-health/adapters';
import { formatAuthorizationDate } from '@/app/lib/order-integration/authorization-period';
import {
  normalizeHealthStatusForPublicView,
  orderIntegrationMallIdForProvider,
  toPublicConnectionHealthView,
} from '@/app/lib/order-integration/connection-health/public-health-view';

/** 현재 사용자 계정들의 연결 상태(저장된 최신 헬스) 요약. 원본 코드/민감정보는 반환하지 않는다. */
export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  registerBuiltInHealthAdapters();

  const accounts = await prisma.orderIntegrationAccount.findMany({
    where: { userId: auth.userId },
    select: {
      id: true,
      provider: true,
      status: true,
      healthStatus: true,
      lastCheckedAt: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      lastErrorCategory: true,
      lastErrorCode: true,
      consecutiveFailureCount: true,
      authorizationPeriodStart: true,
      authorizationPeriodEnd: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const items = accounts.map((account) => {
    const mallId = orderIntegrationMallIdForProvider(account.provider);
    const healthStatus = normalizeHealthStatusForPublicView(account.healthStatus);
    const readiness = getProviderReadiness(account.provider);
    const publicHealth = toPublicConnectionHealthView({
      mallId,
      inactive: account.status === OrderIntegrationAccountStatus.INACTIVE,
      readiness,
      healthStatus,
      lastCheckedAt: account.lastCheckedAt,
      lastSuccessAt: account.lastSuccessAt,
      lastFailureAt: account.lastFailureAt,
      lastErrorCategory: account.lastErrorCategory,
      lastErrorCode: account.lastErrorCode,
      consecutiveFailureCount: account.consecutiveFailureCount,
    });
    return {
      accountId: account.id,
      ...publicHealth,
      authorizationPeriodStart: formatAuthorizationDate(account.authorizationPeriodStart),
      authorizationPeriodEnd: formatAuthorizationDate(account.authorizationPeriodEnd),
    };
  });

  return NextResponse.json({ success: true, accounts: items });
}
