import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';

import {
  buildCoupangAcknowledgementPath,
  runCoupangAcknowledgement,
  validateAcknowledgementShipmentBoxIds,
  type CoupangAcknowledgementItemResult,
} from '@/app/lib/coupang/coupang-acknowledgement';
import {
  fetchCoupangOrderSheetByShipmentBoxId,
  patchCoupangOrderSheetAcknowledgement,
} from '@/app/lib/coupang/client';
import { CoupangApiError, toUserFacingCoupangErrorMessage } from '@/app/lib/coupang/errors';
import {
  getCoupangAccountForUser,
  isCoupangApiKeyExpired,
  toCoupangCredentials,
} from '@/app/lib/order-integration/coupang-account';
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

type PublicAcknowledgementItem = {
  shipmentBoxId: string;
  status: CoupangAcknowledgementItemResult['status'];
  message: string;
  retryRequired: boolean | null;
  refreshedStatus: string | null;
  hubEligible: boolean;
};

function toPublicItem(row: CoupangAcknowledgementItemResult): PublicAcknowledgementItem {
  return {
    shipmentBoxId: row.shipmentBoxId,
    status: row.status,
    message: row.message,
    retryRequired: row.retryRequired,
    refreshedStatus: row.refreshedStatus,
    hubEligible: row.hubEligible,
  };
}

function parseRequestBody(raw: unknown): { ok: true; shipmentBoxIds: string[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const record = raw as Record<string, unknown>;
  if ('vendorId' in record) {
    return { ok: false, error: 'vendorId는 서버에서 확인합니다.' };
  }
  return validateAcknowledgementShipmentBoxIds(record.shipmentBoxIds);
}

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

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

  const account = await getCoupangAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json({ error: '저장된 쿠팡 연동 정보가 없습니다.' }, { status: 404 });
  }

  if (isCoupangApiKeyExpired(account.expiresAt)) {
    return NextResponse.json({ error: '쿠팡 API 키가 만료되었을 수 있습니다.' }, { status: 400 });
  }

  let credentials;
  try {
    credentials = toCoupangCredentials(account);
  } catch {
    return NextResponse.json({ error: '쿠팡 연결 정보를 확인해 주세요.' }, { status: 400 });
  }

  try {
    const result = await runCoupangAcknowledgement({
      vendorId: credentials.vendorId,
      shipmentBoxIds: parsed.shipmentBoxIds,
      patchAcknowledgement: (bodyText) =>
        patchCoupangOrderSheetAcknowledgement({
          vendorId: credentials.vendorId,
          accessKey: credentials.accessKey,
          secretKey: credentials.secretKey,
          bodyText,
        }),
      fetchByBoxId: (shipmentBoxId) =>
        fetchCoupangOrderSheetByShipmentBoxId({
          vendorId: credentials.vendorId,
          accessKey: credentials.accessKey,
          secretKey: credentials.secretKey,
          shipmentBoxId,
        }),
      preflightByBoxId: async (shipmentBoxId) => {
        try {
          const sheet = await fetchCoupangOrderSheetByShipmentBoxId({
            vendorId: credentials.vendorId,
            accessKey: credentials.accessKey,
            secretKey: credentials.secretKey,
            shipmentBoxId,
          });
          if ((sheet.status ?? '').trim().toUpperCase() !== 'ACCEPT') {
            return {
              ok: false,
              message: '결제완료(ACCEPT) 상태의 주문만 상품준비중 처리할 수 있습니다.',
            };
          }
          return { ok: true };
        } catch {
          return { ok: false, message: '주문 상태를 확인하지 못했습니다.' };
        }
      },
    });

    const patches = result.results
      .filter((row) => row.hubEligible && row.standardRows && row.views)
      .map((row) => ({
        shipmentBoxId: row.shipmentBoxId,
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
        provider: OrderIntegrationProvider.COUPANG,
        integrationAccountId: account.id,
        orderStandardFile: {
          rows: mergedRows,
        },
        fetchedAt: new Date(),
        memo: 'coupang-ack-refetch',
      });
    }

    return NextResponse.json({
      success: true,
      path: buildCoupangAcknowledgementPath(credentials.vendorId),
      summary: {
        requested: result.requestedCount,
        succeeded: result.succeededCount,
        failed: result.failedCount,
        uncertain: result.uncertainCount,
      },
      results: result.results.map(toPublicItem),
      patches: patches.map((patch) => ({
        shipmentBoxId: patch.shipmentBoxId,
        standardRows: patch.standardRows,
        views: patch.views,
      })),
      snapshotPersist,
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingCoupangErrorMessage(error));
    console.error('[Coupang Acknowledgement] failed');
    const status = error instanceof CoupangApiError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
