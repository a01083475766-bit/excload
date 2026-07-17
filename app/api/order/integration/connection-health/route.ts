import { NextResponse } from 'next/server';
import { OrderIntegrationAccountStatus, OrderIntegrationProvider } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  ORDER_INTEGRATION_MALLS,
  type OrderIntegrationMallId,
} from '@/app/lib/order-integration/malls';
import { getHealthMessageForStatus } from '@/app/lib/order-integration/connection-health/messages';
import { getProviderReadiness } from '@/app/lib/order-integration/connection-health/provider-health-registry';
import { registerBuiltInHealthAdapters } from '@/app/lib/order-integration/connection-health/adapters';
import { formatAuthorizationDate } from '@/app/lib/order-integration/authorization-period';
import type { HealthStatus } from '@/app/lib/order-integration/connection-health/types';

const PROVIDER_TO_MALL_ID: Partial<Record<OrderIntegrationProvider, OrderIntegrationMallId>> = {
  COUPANG: 'coupang',
  ELEVEN: 'eleven',
  SMARTSTORE: 'smartstore',
  CAFE24: 'cafe24',
  LOTTEON: 'lotteon',
  SSG: 'ssg',
  CJONSTYLE: 'cjonstyle',
  SHOPBY: 'shopby',
  GODOMALL: 'godomall',
  MAKESHOP: 'makeshop',
};

function mapAccountStatus(status: OrderIntegrationAccountStatus): 'active' | 'inactive' | 'error' {
  if (status === OrderIntegrationAccountStatus.ACTIVE) return 'active';
  if (status === OrderIntegrationAccountStatus.ERROR) return 'error';
  return 'inactive';
}

const HEALTH_STATUSES: ReadonlySet<string> = new Set<HealthStatus>([
  'HEALTHY',
  'AUTH_REQUIRED',
  'IP_NOT_ALLOWED',
  'PERMISSION_DENIED',
  'APPROVAL_REQUIRED',
  'RATE_LIMITED',
  'TEMPORARY_ERROR',
  'ACCOUNT_CONFIG_ERROR',
  'REQUEST_INVALID',
  'UNKNOWN',
]);

function normalizeHealthStatus(value: string | null): HealthStatus | null {
  if (value && HEALTH_STATUSES.has(value)) return value as HealthStatus;
  return null;
}

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
      accountName: true,
      status: true,
      healthStatus: true,
      lastCheckedAt: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      lastErrorCategory: true,
      consecutiveFailureCount: true,
      authorizationPeriodStart: true,
      authorizationPeriodEnd: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const items = accounts.map((account) => {
    const mallId = PROVIDER_TO_MALL_ID[account.provider] ?? null;
    const meta = mallId ? ORDER_INTEGRATION_MALLS.find((m) => m.id === mallId) : undefined;
    const healthStatus = normalizeHealthStatus(account.healthStatus);
    const readiness = getProviderReadiness(account.provider);
    const notInactive = account.status !== OrderIntegrationAccountStatus.INACTIVE;
    return {
      accountId: account.id,
      provider: account.provider,
      mallId,
      name: meta?.name ?? account.provider,
      accountName: account.accountName,
      accountStatus: mapAccountStatus(account.status),
      // 공급자 준비 상태(자동 확인 게이팅·화면 표시용).
      readiness,
      // 자동 검사 대상: INACTIVE 제외 && VERIFIED 공급자만. PROVISIONAL/미등록은 자동 확인하지 않는다.
      checkable: notInactive && readiness === 'VERIFIED',
      healthStatus,
      message: healthStatus ? getHealthMessageForStatus(healthStatus) : null,
      lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
      lastSuccessAt: account.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: account.lastFailureAt?.toISOString() ?? null,
      lastErrorCategory: account.lastErrorCategory,
      consecutiveFailureCount: account.consecutiveFailureCount,
      authorizationPeriodStart: formatAuthorizationDate(account.authorizationPeriodStart),
      authorizationPeriodEnd: formatAuthorizationDate(account.authorizationPeriodEnd),
    };
  });

  return NextResponse.json({ success: true, accounts: items });
}
