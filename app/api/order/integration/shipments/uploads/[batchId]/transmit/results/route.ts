import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';

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
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;
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
