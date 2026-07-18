import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getGodomallAccountForUser,
  markGodomallAccountSyncResult,
  toGodomallCredentials,
} from '@/app/lib/order-integration/godomall-account';
import { fetchGodomallOrders, toUserFacingGodomallErrorMessage } from '@/app/lib/godomall/client';
import {
  GODOMALL_PREVIEW_HEADERS,
  mapGodomallOrdersToOrderStandardFile,
  mapGodomallOrdersToPreviewRows,
} from '@/app/lib/godomall/map-godomall-orders';
import { isGodomallPartnerKeyConfigured } from '@/app/lib/godomall/partner-key';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { readFetchOrderDays } from '@/app/lib/order-integration/parse-fetch-order-days';
import { classifyMallErrorMessage } from '@/app/lib/order-integration/connection-health/adapters/probe-health';
import { connectionOperationFailure } from '@/app/lib/order-integration/connection-health/operation-result';
import { beginConnectionHealthOperation } from '@/app/lib/order-integration/connection-health/concurrency';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const days = await readFetchOrderDays(request);

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '고도몰 API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
      },
      { status: 400 },
    );
  }

  const account = await getGodomallAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 고도몰 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  const operation = await beginConnectionHealthOperation({
    accountId: account.id,
    userId: auth.userId,
    source: 'fetch_orders',
  });
  if (!operation.started) {
    return NextResponse.json(
      {
        error:
          operation.reason === 'NOT_FOUND'
            ? '저장된 고도몰 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 고도몰 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  if (!isGodomallPartnerKeyConfigured() && !account.accessKeyCiphertext) {
    const message = '고도몰 API 연결을 위한 서버 인증 설정이 필요합니다. 관리자에게 문의해 주세요.';
    await markGodomallAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: false, category: 'ACCOUNT_CONFIG_ERROR', userMessage: message },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const credentials = toGodomallCredentials(account);
    const orders = await fetchGodomallOrders({ credentials, days });
    const orderStandardFile = mapGodomallOrdersToOrderStandardFile(orders);
    const previewRows = mapGodomallOrdersToPreviewRows(orders);

    await markGodomallAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.GODOMALL,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `고도몰 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: GODOMALL_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingGodomallErrorMessage(error));
    console.error('[Godomall Integration Fetch] failed');
    await markGodomallAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: connectionOperationFailure({
        error,
        category: classifyMallErrorMessage(error),
        userMessage: message,
      }),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
