import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';

import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import {
  loadLinkableOrdersForShipmentUploadBatch,
  parseLinkableOrdersLimit,
  parseLinkableOrdersQuery,
  validateLinkableOrdersBatchId,
  type LinkableOrdersLoadClient,
} from '@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch';
import { prisma } from '@/app/lib/prisma';


export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireOrderIntegrationAdmin();
    if (isAdminAuthFailure(auth)) return auth.response;
    const userId = auth.userId;

    const { batchId } = await params;
    const validatedBatchId = validateLinkableOrdersBatchId(batchId);
    if (typeof validatedBatchId !== 'string') {
      return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
    }

    const url = new URL(request.url);
    const parsedLimit = parseLinkableOrdersLimit(url.searchParams.get('limit'));
    if (typeof parsedLimit !== 'number') {
      return NextResponse.json({ error: parsedLimit.error }, { status: 400 });
    }

    const q = parseLinkableOrdersQuery(url.searchParams.get('q'));

    const result = await loadLinkableOrdersForShipmentUploadBatch(
      prisma as unknown as LinkableOrdersLoadClient,
      {
        userId,
        batchId: validatedBatchId,
        q,
        limit: parsedLimit,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadLinkableOrders] failed:', errorMessage);
    return NextResponse.json(
      { error: '연결 가능한 주문 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
