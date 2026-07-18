import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getSmartstoreAccountForUser,
  markSmartstoreAccountSyncResult,
  toSmartstoreCredentials,
} from '@/app/lib/order-integration/smartstore-account';
import { fetchSmartstoreProductOrders } from '@/app/lib/smartstore/client';
import { categorizeSmartstoreOperationError } from '@/app/lib/order-integration/connection-health/adapters/smartstore';
import { beginConnectionHealthOperation } from '@/app/lib/order-integration/connection-health/concurrency';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  mapSmartstoreOrdersToFetchViews,
  mapSmartstoreOrdersToOrderStandardFile,
  mapSmartstoreOrdersToPreviewRows,
  SMARTSTORE_PREVIEW_HEADERS,
} from '@/app/lib/smartstore/map-smartstore-orders';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { parseFetchOrderDays } from '@/app/lib/order-integration/parse-fetch-order-days';
import {
  extractDateRangeInput,
  OrderFetchRangeError,
  resolveOrderFetchRange,
  type ResolvedOrderFetchRange,
} from '@/app/lib/order-integration/order-fetch-range';

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const body = await request.json().catch(() => null);
  let range: ResolvedOrderFetchRange | undefined;
  let days = 7;
  try {
    const rangeInput = extractDateRangeInput(body);
    if (rangeInput) {
      range = resolveOrderFetchRange({ from: rangeInput.from, to: rangeInput.to });
    } else {
      days = parseFetchOrderDays(body);
    }
  } catch (error) {
    const message = error instanceof OrderFetchRangeError ? error.message : '조회 기간이 올바르지 않습니다.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '스마트스토어 API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
      },
      { status: 400 },
    );
  }

  const account = await getSmartstoreAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 스마트스토어 연동 정보가 없습니다. 먼저 저장해 주세요.' },
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
            ? '저장된 스마트스토어 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 스마트스토어 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  try {
    const credentials = toSmartstoreCredentials(account);
    const orders = await fetchSmartstoreProductOrders(
      range ? { credentials, range: { fromMs: range.fromMs, toMs: range.toMs } } : { credentials, days },
    );
    const orderStandardFile = mapSmartstoreOrdersToOrderStandardFile(orders);
    const previewRows = mapSmartstoreOrdersToPreviewRows(orders);
    const orderViews = mapSmartstoreOrdersToFetchViews(orders);

    await markSmartstoreAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `스마트스토어 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: SMARTSTORE_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      orderViews,
      snapshotPersist,
    });
  } catch (error) {
    const result = categorizeSmartstoreOperationError(error);
    const message = sanitizePublicIntegrationErrorMessage(result.userMessage);
    console.error('[Smartstore Integration Fetch] failed');
    await markSmartstoreAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { ...result, userMessage: message },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
