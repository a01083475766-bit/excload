import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import {
  loadShipmentTransmissionAttemptResults,
  type ShipmentTransmissionAttemptQueryClient,
} from '@/app/lib/order-integration/transmission/read-repository';
import { prisma } from '@/app/lib/prisma';

async function resolveAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim();
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

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
