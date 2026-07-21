import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/app/api/cron/toss-subscription-renew/route';
import { purgeExpiredCourierDownloadBundles } from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';
import { purgeOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/purge-order-sync-snapshots';
import { scrubExpiredShipmentUploadPii } from '@/app/lib/order-integration/snapshots/scrub-expired-shipment-upload-pii';
import { prisma } from '@/app/lib/prisma';

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let orderSyncResult: Awaited<ReturnType<typeof purgeOrderSyncSnapshots>> | null = null;
  let bundleDeleted = 0;
  let independentScrub: Awaited<ReturnType<typeof scrubExpiredShipmentUploadPii>> | null = null;
  let orderSyncFailed = false;
  let bundleFailed = false;
  let independentScrubFailed = false;

  try {
    orderSyncResult = await purgeOrderSyncSnapshots();
  } catch (error) {
    orderSyncFailed = true;
    console.error(
      '[cron/purge-order-sync-snapshots] orderSync purge failed:',
      error instanceof Error ? error.message : 'failed',
    );
  }

  try {
    const bundlePurge = await purgeExpiredCourierDownloadBundles(prisma);
    bundleDeleted = bundlePurge.deletedBundles;
  } catch (error) {
    bundleFailed = true;
    console.error(
      '[cron/purge-order-sync-snapshots] courier bundle purge failed:',
      error instanceof Error ? error.message : 'failed',
    );
  }

  // OrderSync 만료·SENT와 무관하게 독립 실행
  try {
    independentScrub = await scrubExpiredShipmentUploadPii(prisma);
    if (independentScrub.batchFailures > 0) {
      independentScrubFailed = true;
      console.error(
        '[cron/purge-order-sync-snapshots] independent shipment PII scrub batchFailures=',
        independentScrub.batchFailures,
        'scrubbedUploadRows=',
        independentScrub.scrubbedUploadRows,
        'scrubbedMatches=',
        independentScrub.scrubbedMatches,
      );
    } else {
      console.info(
        '[cron/purge-order-sync-snapshots] independent shipment PII scrub',
        'scrubbedUploadRows=',
        independentScrub.scrubbedUploadRows,
        'scrubbedMatches=',
        independentScrub.scrubbedMatches,
      );
    }
  } catch (error) {
    independentScrubFailed = true;
    console.error(
      '[cron/purge-order-sync-snapshots] independent shipment PII scrub failed:',
      error instanceof Error ? error.message : 'failed',
    );
  }

  const anyFailed = orderSyncFailed || bundleFailed || independentScrubFailed;
  return NextResponse.json(
    {
      success: !anyFailed,
      deletedExpiredOrders: orderSyncResult?.deletedExpiredOrders ?? 0,
      scrubbedExpiredMatches: orderSyncResult?.scrubbedExpiredMatches ?? 0,
      scrubbedExpiredUploadRows: orderSyncResult?.scrubbedExpiredUploadRows ?? 0,
      clearedSentPiiOrders: orderSyncResult?.clearedSentPiiOrders ?? 0,
      clearedUploadRows: orderSyncResult?.clearedUploadRows ?? 0,
      clearedMatches: orderSyncResult?.clearedMatches ?? 0,
      clearedAttempts: orderSyncResult?.clearedAttempts ?? 0,
      deletedExpiredCourierDownloadBundles: bundleDeleted,
      independentScrubbedUploadRows: independentScrub?.scrubbedUploadRows ?? 0,
      independentScrubbedMatches: independentScrub?.scrubbedMatches ?? 0,
      independentScrubBatchFailures: independentScrub?.batchFailures ?? 0,
      orderSyncFailed,
      bundleFailed,
      independentScrubFailed,
    },
    { status: anyFailed ? 500 : 200 },
  );
}

export async function POST(request: NextRequest) {
  return GET(request);
}
