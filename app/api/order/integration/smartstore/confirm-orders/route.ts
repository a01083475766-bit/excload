import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';

import {
  fetchSmartstoreProductOrdersByIds,
  postSmartstoreProductOrdersConfirm,
  SMARTSTORE_CONFIRM_PATH,
  SmartstoreApiError,
  toUserFacingSmartstoreErrorMessage,
} from '@/app/lib/smartstore/client';
import {
  runSmartstoreConfirm,
  validateConfirmProductOrderIds,
  type SmartstoreConfirmItemResult,
} from '@/app/lib/smartstore/smartstore-confirm';
import {
  extractAccountIdFromRequestBody,
  resolveSmartstoreAccountForRequest,
  toSmartstoreCredentials,
} from '@/app/lib/order-integration/smartstore-account';
import {
  isOrderSyncSnapshotPersistEnabled,
  persistOrderSyncSnapshotsFromStandardRows,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { prisma } from '@/app/lib/prisma';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';

type PublicConfirmItem = {
  productOrderId: string;
  status: SmartstoreConfirmItemResult['status'];
  message: string;
  isReceiverAddressChanged: boolean;
  refreshedPlaceOrderStatus: string | null;
};

function toPublicItem(row: SmartstoreConfirmItemResult): PublicConfirmItem {
  return {
    productOrderId: row.productOrderId,
    status: row.status,
    message: row.message,
    isReceiverAddressChanged: row.isReceiverAddressChanged,
    refreshedPlaceOrderStatus: row.refreshedPlaceOrderStatus,
  };
}

function parseRequestBody(
  raw: unknown,
):
  | { ok: true; productOrderIds: string[]; accountId: string | null }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const record = raw as Record<string, unknown>;
  if ('clientId' in record || 'clientSecret' in record || 'accessToken' in record) {
    return { ok: false, error: '인증 정보는 서버에서 확인합니다.' };
  }
  const ids = validateConfirmProductOrderIds(record.productOrderIds);
  if (!ids.ok) return ids;
  return {
    ok: true,
    productOrderIds: ids.productOrderIds,
    accountId: extractAccountIdFromRequestBody(raw),
  };
}

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      { error: '스마트스토어 API는 고정 IP 프록시 설정이 필요합니다.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 해석하지 못했습니다.' }, { status: 400 });
  }

  const parsed = parseRequestBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const resolvedAccount = await resolveSmartstoreAccountForRequest({
    userId: auth.userId,
    accountId: parsed.accountId,
  });
  if (!resolvedAccount.ok) {
    return NextResponse.json(
      { error: resolvedAccount.error },
      { status: resolvedAccount.status },
    );
  }
  const account = resolvedAccount.account;

  let credentials;
  try {
    credentials = toSmartstoreCredentials(account);
  } catch {
    return NextResponse.json({ error: '스마트스토어 연결 정보를 확인해 주세요.' }, { status: 400 });
  }

  try {
    const result = await runSmartstoreConfirm({
      productOrderIds: parsed.productOrderIds,
      fetchByIds: (productOrderIds) =>
        fetchSmartstoreProductOrdersByIds({
          credentials,
          productOrderIds,
        }),
      confirmBatch: (productOrderIds) =>
        postSmartstoreProductOrdersConfirm({
          credentials,
          productOrderIds,
        }),
    });

    const patches = result.results
      .filter((row) => row.standardRows && row.views)
      .map((row) => ({
        productOrderId: row.productOrderId,
        standardRows: row.standardRows!,
        views: row.views!,
      }));

    let snapshotPersist: Awaited<ReturnType<typeof persistOrderSyncSnapshotsFromStandardRows>> | null =
      null;
    if (isOrderSyncSnapshotPersistEnabled() && patches.length > 0) {
      const mergedRows = patches.flatMap((patch) => patch.standardRows);
      snapshotPersist = await persistOrderSyncSnapshotsFromStandardRows({
        client: prisma,
        enabled: true,
        userId: auth.userId,
        provider: OrderIntegrationProvider.SMARTSTORE,
        integrationAccountId: account.id,
        orderStandardFile: {
          rows: mergedRows,
        },
        fetchedAt: new Date(),
        memo: 'smartstore-confirm-refetch',
      });
    }

    return NextResponse.json({
      success: true,
      path: SMARTSTORE_CONFIRM_PATH,
      summary: {
        requested: result.requestedCount,
        confirmed: result.confirmedCount,
        alreadyConfirmed: result.alreadyConfirmedCount,
        addressChanged: result.addressChangedCount,
        failed: result.failedCount,
        uncertain: result.uncertainCount,
      },
      results: result.results.map(toPublicItem),
      patches: patches.map((patch) => ({
        productOrderId: patch.productOrderId,
        standardRows: patch.standardRows,
        views: patch.views,
      })),
      addressChangedWarning: (() => {
        if (result.addressChangedCount > 0) {
          return '배송지가 변경된 주문이 있습니다. 갱신된 정보로 택배 양식을 다시 내려받아 주세요.';
        }
        const addressUncertain = result.results.some(
          (row) => row.isReceiverAddressChanged && row.status === 'UNCERTAIN',
        );
        if (addressUncertain) {
          return '배송지가 변경됐지만 최신 주문정보를 불러오지 못했습니다. 기존 택배 양식은 사용하지 말고, 주문조회 후 양식을 다시 내려받아 주세요.';
        }
        return null;
      })(),
      snapshotPersist,
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingSmartstoreErrorMessage(error));
    console.error('[Smartstore Confirm] failed');
    const status = error instanceof SmartstoreApiError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
