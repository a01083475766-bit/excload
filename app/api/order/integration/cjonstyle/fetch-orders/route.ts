import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getCjonstyleAccountForUser,
  markCjonstyleAccountSyncResult,
  toCjonstyleCredentials,
} from '@/app/lib/order-integration/cjonstyle-account';
import { fetchCjonstyleOrders, toUserFacingCjonstyleErrorMessage } from '@/app/lib/cjonstyle/client';
import {
  CJONSTYLE_PREVIEW_HEADERS,
  mapCjonstyleOrdersToOrderStandardFile,
  mapCjonstyleOrdersToPreviewRows,
} from '@/app/lib/cjonstyle/map-cjonstyle-orders';
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
        error: 'CJ온스타일 API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
      },
      { status: 400 },
    );
  }

  const account = await getCjonstyleAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 CJ온스타일 연동 정보가 없습니다. 먼저 저장해 주세요.' },
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
            ? '저장된 CJ온스타일 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 CJ온스타일 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  try {
    const credentials = toCjonstyleCredentials(account);
    const orders = await fetchCjonstyleOrders({ credentials, days });
    const orderStandardFile = mapCjonstyleOrdersToOrderStandardFile(orders);
    const previewRows = mapCjonstyleOrdersToPreviewRows(orders);

    await markCjonstyleAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.CJONSTYLE,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `CJ온스타일 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: CJONSTYLE_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingCjonstyleErrorMessage(error));
    console.error('[Cjonstyle Integration Fetch] failed');
    await markCjonstyleAccountSyncResult({
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
