import { NextResponse } from 'next/server';

import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { listCourierDownloadBundleOrders } from '@/app/lib/order-integration/courier-download/list-courier-download-bundle-orders';
import { prisma } from '@/app/lib/prisma';

/**
 * 선택한 택배양식 다운로드 Bundle의 WorkItem 주문 요약.
 * GET .../orders/courier-download-bundles/{bundleId}/orders
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

    const { bundleId: rawBundleId } = await params;
    const bundleId = typeof rawBundleId === 'string' ? rawBundleId.trim() : '';
    if (!bundleId) {
      return NextResponse.json({ error: 'Download bundle not found.' }, { status: 404 });
    }

    const result = await listCourierDownloadBundleOrders(prisma, {
      userId: auth.userId,
      bundleId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Download bundle not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      bundleId: result.bundleId,
      orderCount: result.orderCount,
      orders: result.orders.map((order) => ({
        id: order.id,
        mallLabel: order.mallLabel,
        mallOrderNo: order.mallOrderNo,
        sourceType: order.sourceType,
        sourceTypeLabel: order.sourceTypeLabel,
        excloadOrderNo: order.excloadOrderNo,
      })),
    });
  } catch (error) {
    console.error(
      '[CourierDownloadBundleOrders] list failed:',
      error instanceof Error ? error.message : 'failed',
    );
    return NextResponse.json({ error: 'Failed to list download bundle orders.' }, { status: 500 });
  }
}
