import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';

import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { createMockShipmentTransmissionAdapter } from '@/app/lib/order-integration/transmission/mock-adapter';
import {
  readMockTransmitGuardEnvFromProcess,
} from '@/app/lib/order-integration/transmission/mock-transmit-guard';
import { runMockTransmitService } from '@/app/lib/order-integration/transmission/mock-transmit-service';
import { parseTransmitMockBody } from '@/app/lib/order-integration/transmission/parse-transmit-mock-body';
import { runPersistedShipmentTransmission } from '@/app/lib/order-integration/transmission/persisted-executor';
import {
  createShipmentTransmissionReadRepository,
  type ShipmentTransmissionReadPrismaClient,
} from '@/app/lib/order-integration/transmission/read-repository';
import type { ShipmentTransmissionPersistClient } from '@/app/lib/order-integration/transmission/repository';
import { prisma } from '@/app/lib/prisma';


async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireOrderIntegrationAdmin();
    if (isAdminAuthFailure(auth)) return auth.response;
    const userId = auth.userId;

    const { batchId } = await params;
    const validatedBatchId = validateShipmentUploadBatchId(batchId);
    if (typeof validatedBatchId !== 'string') {
      return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
    }

    const parsed = parseTransmitMockBody(await readJson(request));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await runMockTransmitService(
      {
        env: readMockTransmitGuardEnvFromProcess(),
        readRepository: createShipmentTransmissionReadRepository(
          prisma as unknown as ShipmentTransmissionReadPrismaClient,
        ),
        resolveAdapter: ({ provider }) => createMockShipmentTransmissionAdapter({ provider }),
        persistClient: prisma as unknown as ShipmentTransmissionPersistClient,
        runPersisted: runPersistedShipmentTransmission,
      },
      { userId, batchId: validatedBatchId, parsedBody: parsed.body },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.safeMessage, reasonCode: result.reasonCode },
        { status: result.status },
      );
    }

    return NextResponse.json(result.body);
  } catch (error) {
    console.error('[ShipmentTransmissionMock] failed:', toSafeShipmentMatchLogMessage(error));
    return NextResponse.json(
      { error: 'Mock shipment transmission failed safely.' },
      { status: 500 },
    );
  }
}
