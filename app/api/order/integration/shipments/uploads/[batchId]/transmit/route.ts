import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { parseTransmitDryRunBody } from '@/app/lib/order-integration/transmission/parse-transmit-dry-run-body';
import {
  createShipmentTransmissionReadRepository,
  prepareFailedShipmentMatchRetry,
  type ShipmentTransmissionReadPrismaClient,
} from '@/app/lib/order-integration/transmission/read-repository';
import {
  createPrismaShipmentTransmissionAccountLoader,
  createRealShipmentTransmissionAdapterRegistry,
  type ShipmentTransmissionAccountPrismaClient,
} from '@/app/lib/order-integration/transmission/real-adapters';
import type { ShipmentTransmissionPersistClient } from '@/app/lib/order-integration/transmission/repository';
import { runShipmentTransmitService } from '@/app/lib/order-integration/transmission/transmit-service';
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

    const parsed = parseTransmitDryRunBody(await readOptionalJsonBody(request));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!parsed.body.matchIds?.length) {
      return NextResponse.json({ error: 'matchIds is required.' }, { status: 400 });
    }

    const readClient = prisma as unknown as ShipmentTransmissionReadPrismaClient;
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId,
      loadAccount: createPrismaShipmentTransmissionAccountLoader(
        prisma as unknown as ShipmentTransmissionAccountPrismaClient,
      ),
    });
    const result = await runShipmentTransmitService(
      {
        enabled: process.env.ORDER_TRANSMISSION_ENABLED === 'true',
        readRepository: createShipmentTransmissionReadRepository(readClient),
        persistClient: prisma as unknown as ShipmentTransmissionPersistClient,
        resolveAdapter: ({ provider }) => {
          const adapter = registry.get(provider);
          if (!adapter) throw new Error('ADAPTER_NOT_REGISTERED');
          return adapter;
        },
        prepareFailedRetry: ({ matchId }) =>
          prepareFailedShipmentMatchRetry(readClient, {
            userId,
            batchId: validatedBatchId,
            matchId,
          }),
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
    console.error('[ShipmentTransmission] failed:', toSafeShipmentMatchLogMessage(error));
    return NextResponse.json(
      { error: 'Shipment transmission failed safely.' },
      { status: 500 },
    );
  }
}
