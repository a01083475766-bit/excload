import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import {
  loadShipmentTransmissionAttemptResults,
  type ShipmentTransmissionAttemptQueryClient,
} from '@/app/lib/order-integration/transmission/read-repository';
import { prisma } from '@/app/lib/prisma';


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;
  const userId = auth.userId;

  const { batchId } = await params;
  const validatedBatchId = validateShipmentUploadBatchId(batchId);
  if (typeof validatedBatchId !== 'string') {
    return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
  }

  const body = await loadShipmentTransmissionAttemptResults(
    prisma as unknown as ShipmentTransmissionAttemptQueryClient,
    { userId, batchId: validatedBatchId },
  );
  return NextResponse.json(body);
}
