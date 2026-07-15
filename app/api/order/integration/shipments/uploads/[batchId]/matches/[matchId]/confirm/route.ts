import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import {
  confirmShipmentUploadMatch,
  validateShipmentUploadMatchId,
  type ConfirmShipmentUploadMatchClient,
} from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { prisma } from '@/app/lib/prisma';


export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string; matchId: string }> },
) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;
    const userId = auth.userId;

    const { batchId, matchId } = await params;
    const validatedBatchId = validateShipmentUploadBatchId(batchId);
    if (typeof validatedBatchId !== 'string') {
      return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
    }

    const validatedMatchId = validateShipmentUploadMatchId(matchId);
    if (typeof validatedMatchId !== 'string') {
      return NextResponse.json({ error: validatedMatchId.error }, { status: 400 });
    }

    const result = await confirmShipmentUploadMatch(
      prisma as unknown as ConfirmShipmentUploadMatchClient,
      {
        userId,
        batchId: validatedBatchId,
        matchId: validatedMatchId,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadMatchConfirm] failed:', errorMessage);
    return NextResponse.json(
      { error: '매칭 확정 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
