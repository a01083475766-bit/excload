import { NextResponse } from 'next/server';
import { OrderIntegrationProvider } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  ORDER_INTEGRATION_MALLS,
  type OrderIntegrationMallId,
} from '@/app/lib/order-integration/malls';

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
  DOMEGGOOK: 'domeggook',
};

/** 현재 사용자에게 저장된(연동된) 쇼핑몰 목록 */
export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const accounts = await prisma.orderIntegrationAccount.findMany({
    where: { userId: auth.userId },
    select: {
      id: true,
      provider: true,
      accountName: true,
      status: true,
      lastTestedAt: true,
      updatedAt: true,
      accessKeyCiphertext: true,
      accessKeyIv: true,
      accessKeyAuthTag: true,
      secretKeyCiphertext: true,
      secretKeyIv: true,
      secretKeyAuthTag: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const availableIds = new Set(
    ORDER_INTEGRATION_MALLS.filter((m) => m.status === 'available').map((m) => m.id)
  );

  const seen = new Set<string>();
  const malls: {
    mallId: OrderIntegrationMallId;
    name: string;
    accountId: string;
    accountName: string;
    status: string;
    lastCheckedAt: string | null;
  }[] = [];

  for (const account of accounts) {
    const mallId = PROVIDER_TO_MALL_ID[account.provider];
    if (!mallId || !availableIds.has(mallId)) continue;
    // 동일 provider라도 계정별로 모두 노출 (findFirst/최신 1개 대체 금지).
    if (seen.has(account.id)) continue;
    seen.add(account.id);
    const meta = ORDER_INTEGRATION_MALLS.find((m) => m.id === mallId);
    if (!meta) continue;

    // 카페24: 개인 Client 없는 레거시(공용앱 토큰만)는 ACTIVE여도 연결됨으로 표시하지 않음
    const cafe24Ready =
      account.provider !== OrderIntegrationProvider.CAFE24 ||
      Boolean(
        account.accessKeyCiphertext &&
          account.accessKeyIv &&
          account.accessKeyAuthTag &&
          account.secretKeyCiphertext &&
          account.secretKeyIv &&
          account.secretKeyAuthTag,
      );
    const status =
      account.provider === OrderIntegrationProvider.CAFE24 && !cafe24Ready
        ? 'INACTIVE'
        : account.status;

    malls.push({
      mallId,
      name: meta.name,
      accountId: account.id,
      accountName: account.accountName,
      status,
      lastCheckedAt: (account.lastTestedAt ?? account.updatedAt)?.toISOString() ?? null,
    });
  }

  malls.sort((a, b) => {
    const pa = ORDER_INTEGRATION_MALLS.find((m) => m.id === a.mallId)?.priority ?? 99;
    const pb = ORDER_INTEGRATION_MALLS.find((m) => m.id === b.mallId)?.priority ?? 99;
    return pa - pb;
  });

  return NextResponse.json({ success: true, malls });
}
