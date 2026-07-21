import { NextResponse } from 'next/server';

import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { parseVerifyTransmissionBody } from '@/app/lib/order-integration/transmission/parse-verify-transmission-body';
import {
  createVerifyTransmissionAccountLoader,
  createVerifyTransmissionFindAttempts,
} from '@/app/lib/order-integration/transmission/verify-transmission-prisma';
import { runVerifyTransmissionService } from '@/app/lib/order-integration/transmission/verify-transmission-status';
import { prisma } from '@/app/lib/prisma';

async function readOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

export async function POST(
  request: Request,
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

    let rawBody: unknown = null;
    try {
      rawBody = await readOptionalJsonBody(request);
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const parsed = parseVerifyTransmissionBody(rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await runVerifyTransmissionService(
      {
        findAttempts: createVerifyTransmissionFindAttempts(prisma),
        loadAccount: createVerifyTransmissionAccountLoader(prisma),
      },
      {
        userId,
        batchId: validatedBatchId,
        attemptIds: parsed.body.attemptIds,
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.safeMessage, reasonCode: result.reasonCode },
        { status: result.status },
      );
    }

    return NextResponse.json(result.body);
  } catch (error) {
    console.error('[ShipmentTransmissionVerify] failed:', toSafeShipmentMatchLogMessage(error));
    return NextResponse.json(
      { error: 'Transmission status verification failed safely.' },
      { status: 500 },
    );
  }
}
