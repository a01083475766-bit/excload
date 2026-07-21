import { NextResponse } from 'next/server';

import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { buildManualRegistrationRows } from '@/app/lib/order-integration/courier-download/manual-registration-view';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { prisma } from '@/app/lib/prisma';

/**
 * 송장 배치에 연결된 Bundle 기준 수동 등록 안내 목록.
 * GET .../shipments/uploads/{batchId}/manual-registration
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

    const { batchId: rawBatchId } = await params;
    const batchId = validateShipmentUploadBatchId(rawBatchId);
    if (typeof batchId !== 'string') {
      return NextResponse.json({ error: batchId.error }, { status: 400 });
    }

    const batch = await prisma.shipmentUploadBatch.findFirst({
      where: { id: batchId, userId: auth.userId },
      select: {
        id: true,
        downloadBundleId: true,
        rows: {
          select: {
            mallOrderNo: true,
            excloadOrderNo: true,
            trackingNumber: true,
            carrierName: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Upload batch not found.' }, { status: 404 });
    }

    if (!batch.downloadBundleId) {
      return NextResponse.json({
        success: true,
        downloadBundleId: null,
        summary: { ready: 0, needsTrackingLink: 0, needsMallOrderInfo: 0 },
        rows: [],
      });
    }

    const workItems = await prisma.courierDownloadWorkItem.findMany({
      where: {
        userId: auth.userId,
        downloadBundleId: batch.downloadBundleId,
        expiresAt: { gte: new Date() },
      },
      select: {
        id: true,
        downloadBundleId: true,
        inputSource: true,
        sourceMallKey: true,
        sourceMallLabel: true,
        mallOrderNo: true,
        excloadOrderNo: true,
      },
    });

    const rows = buildManualRegistrationRows({
      workItems,
      shipmentLinks: batch.rows.map((row) => ({
        mallOrderNo: row.mallOrderNo,
        excloadOrderNo: row.excloadOrderNo,
        trackingNumber: row.trackingNumber,
        carrierName: row.carrierName,
        sourceMallKey: null,
      })),
    });

    const summary = {
      ready: rows.filter((r) => r.status === 'READY').length,
      needsTrackingLink: rows.filter((r) => r.status === 'NEEDS_TRACKING_LINK').length,
      needsMallOrderInfo: rows.filter((r) => r.status === 'NEEDS_MALL_ORDER_INFO').length,
    };

    return NextResponse.json({
      success: true,
      downloadBundleId: batch.downloadBundleId,
      summary,
      rows,
    });
  } catch (error) {
    console.error(
      '[ManualRegistration] failed:',
      error instanceof Error ? error.message : 'failed',
    );
    return NextResponse.json({ error: 'Failed to load manual registration list.' }, { status: 500 });
  }
}
