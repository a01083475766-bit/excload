import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import {
  loadShipmentUploadBatchDetail,
  validateShipmentUploadBatchId,
  type ShipmentUploadBatchDetailLoadClient,
} from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { prisma } from '@/app/lib/prisma';


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;
    const userId = auth.userId;

    const { batchId } = await params;
    const validatedBatchId = validateShipmentUploadBatchId(batchId);
    if (typeof validatedBatchId !== 'string') {
      return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
    }

    const result = await loadShipmentUploadBatchDetail(
      prisma as unknown as ShipmentUploadBatchDetailLoadClient,
      {
      userId,
        batchId: validatedBatchId,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadBatchDetail] failed:', errorMessage);
    return NextResponse.json(
      { error: '업로드 배치 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
