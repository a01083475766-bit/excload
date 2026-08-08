import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getElevenAccountForUser,
  markElevenAccountSyncResult,
  toElevenCredentials,
} from '@/app/lib/order-integration/eleven-account';
import { fetchElevenOrders, toUserFacingElevenErrorMessage, splitElevenErrorCode } from '@/app/lib/eleven/client';
import {
  ELEVEN_PREVIEW_HEADERS,
  mapElevenOrdersToOrderStandardFile,
  mapElevenOrdersToPreviewRows,
} from '@/app/lib/eleven/map-eleven-orders';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { readFetchOrderDays } from '@/app/lib/order-integration/parse-fetch-order-days';
import { classifyElevenOperationError } from '@/app/lib/order-integration/connection-health/adapters/eleven';
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
        error: '11번가 API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
      },
      { status: 400 },
    );
  }

  const account = await getElevenAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 11번가 연동 정보가 없습니다. 먼저 저장해 주세요.' },
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
            ? '저장된 11번가 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 11번가 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  try {
    const credentials = toElevenCredentials(account);
    const orders = await fetchElevenOrders({ credentials, days });
    const orderStandardFile = mapElevenOrdersToOrderStandardFile(orders);
    const previewRows = mapElevenOrdersToPreviewRows(orders);

    await markElevenAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.ELEVEN,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `11번가 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: ELEVEN_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
    });
  } catch (error) {
    const rawMessage = toUserFacingElevenErrorMessage(error);
    const { code } = splitElevenErrorCode(rawMessage);
    const message = sanitizePublicIntegrationErrorMessage(rawMessage);
    console.error('[Eleven Integration Fetch] failed', {
      httpOrApiCode: code ?? null,
    });
    await markElevenAccountSyncResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: connectionOperationFailure({
        error,
        category: classifyElevenOperationError(error),
        userMessage: message,
        errorCode: code,
      }),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
