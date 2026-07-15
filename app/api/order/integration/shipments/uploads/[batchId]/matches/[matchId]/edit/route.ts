import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

import {
  editShipmentUploadMatch,
  parseEditShipmentUploadMatchBody,
  type EditShipmentUploadMatchClient,
} from '@/app/lib/order-integration/shipments/edit-shipment-upload-match';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { validateShipmentUploadMatchId } from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import { prisma } from '@/app/lib/prisma';


export async function POST(
  request: Request,
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

    const parsed = parseEditShipmentUploadMatchBody(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await editShipmentUploadMatch(prisma as unknown as EditShipmentUploadMatchClient, {
      userId,
      batchId: validatedBatchId,
      matchId: validatedMatchId,
      body: parsed.body,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.body);
  } catch (error) {
    console.error('[ShipmentUploadMatchEdit] failed:', toSafeShipmentMatchLogMessage(error));
    return NextResponse.json({ error: 'Shipment match edit failed safely.' }, { status: 500 });
  }
}
