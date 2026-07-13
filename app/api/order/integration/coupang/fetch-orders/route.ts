import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { fetchCoupangOrderSheets } from '@/app/lib/coupang/client';
import { getCoupangTransportInfo } from '@/app/lib/coupang/transport/resolve-transport';
import {
  COUPANG_PREVIEW_HEADERS,
  mapCoupangOrdersToOrderStandardFile,
  mapCoupangOrdersToPreviewRows,
} from '@/app/lib/coupang/map-coupang-orders';
import { toUserFacingCoupangErrorMessage } from '@/app/lib/coupang/errors';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
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

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const days = await readFetchOrderDays(request);

  const account = await getCoupangAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json({ error: '저장된 쿠팡 연동 정보가 없습니다. 먼저 저장해 주세요.' }, { status: 404 });
  }

  if (isCoupangApiKeyExpired(account.expiresAt)) {
    const message = '쿠팡 API 키가 만료되었을 수 있습니다.';
    await markCoupangAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
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

    await markCoupangAccountSyncResult({ accountId: account.id, success: true });

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

    const transport = getCoupangTransportInfo();

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
      debug: {
        transport,
        rawOrderCount: orders.length,
        queriedStatuses: ['ACCEPT', 'INSTRUCT'],
        failedStatuses,
      },
    });
  } catch (error) {
    const message = toUserFacingCoupangErrorMessage(error);
    console.error('[Coupang Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markCoupangAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
