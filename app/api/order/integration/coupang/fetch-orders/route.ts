import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { fetchCoupangOrderSheets } from '@/app/lib/coupang/client';
import {
  COUPANG_PREVIEW_HEADERS,
  mapCoupangOrdersToOrderStandardFile,
  mapCoupangOrdersToPreviewRows,
} from '@/app/lib/coupang/map-coupang-orders';
import { CoupangApiError, toUserFacingCoupangErrorMessage } from '@/app/lib/coupang/errors';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getCoupangAccountForUser,
  isCoupangApiKeyExpired,
  markCoupangAccountSyncResult,
  toCoupangCredentials,
} from '@/app/lib/order-integration/coupang-account';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { readFetchOrderDays } from '@/app/lib/order-integration/parse-fetch-order-days';
import { classifyCoupangError } from '@/app/lib/order-integration/connection-health/adapters/coupang';
import { connectionOperationFailure } from '@/app/lib/order-integration/connection-health/operation-result';
import { beginConnectionHealthOperation } from '@/app/lib/order-integration/connection-health/concurrency';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const days = await readFetchOrderDays(request);

  const account = await getCoupangAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json({ error: '저장된 쿠팡 연동 정보가 없습니다. 먼저 저장해 주세요.' }, { status: 404 });
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
            ? '저장된 쿠팡 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 쿠팡 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  if (isCoupangApiKeyExpired(account.expiresAt)) {
    const message = '쿠팡 API 키가 만료되었을 수 있습니다.';
    await markCoupangAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: {
        success: false,
        category: 'AUTH_REQUIRED',
        errorCode: 'API_KEY_EXPIRED',
        userMessage: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const credentials = toCoupangCredentials(account);
    const { orders, failedStatuses } = await fetchCoupangOrderSheets({ ...credentials, days });

    if (!orders.length && failedStatuses.length > 0) {
      throw new Error('쿠팡 주문 조회에 실패했습니다.');
    }

    const orderStandardFile = mapCoupangOrdersToOrderStandardFile(orders);
    const previewRows = mapCoupangOrdersToPreviewRows(orders);

    await markCoupangAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.COUPANG,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `쿠팡 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      failedStatusCount: failedStatuses.length,
      failedStatuses,
      previewHeaders: COUPANG_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingCoupangErrorMessage(error));
    console.error('[Coupang Integration Fetch] failed');
    await markCoupangAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: connectionOperationFailure({
        error,
        category: classifyCoupangError(error),
        errorCode: error instanceof CoupangApiError ? error.code : undefined,
        userMessage: message,
      }),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
