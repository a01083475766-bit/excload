import type {
  OrderSyncTransmissionStatus,
  ShipmentAlgorithmMatchStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import { loadShipmentUploadBatchDetail } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import { normalizeTrackingNumber } from '@/app/lib/order-integration/shipments/normalize-shipment-row';
import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';

export type EditShipmentUploadMatchBody = {
  trackingNumber: string;
  carrierCode?: string | null;
  carrierName?: string | null;
};

export type EditShipmentUploadMatchClient = Parameters<typeof loadShipmentUploadBatchDetail>[0] & {
  shipmentMatch: {
    findFirst: (args: {
      where: { id: string; userId: string; uploadBatchId: string };
      select: Record<string, boolean | Record<string, unknown>>;
    }) => Promise<{
      id: string;
      userConfirmationStatus: ShipmentUserConfirmationStatus;
      transmissionStatus: OrderSyncTransmissionStatus;
      algorithmMatchStatus: ShipmentAlgorithmMatchStatus;
      orderSyncOrderId: string | null;
      uploadBatch: { status: ShipmentUploadBatchStatus };
    } | null>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

export function parseEditShipmentUploadMatchBody(raw: unknown):
  | { ok: true; body: EditShipmentUploadMatchBody }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.trackingNumber !== 'string') {
    return { ok: false, error: 'trackingNumber is required.' };
  }
  const trackingNumber = normalizeTrackingNumber(record.trackingNumber);
  if (!trackingNumber) return { ok: false, error: 'trackingNumber is required.' };
  if (trackingNumber.length > 64) return { ok: false, error: 'trackingNumber is too long.' };
  const carrierCode = typeof record.carrierCode === 'string' ? record.carrierCode.trim() : null;
  const carrierName = typeof record.carrierName === 'string' ? record.carrierName.trim() : null;
  if ((carrierCode?.length ?? 0) > 32) return { ok: false, error: 'carrierCode is too long.' };
  if ((carrierName?.length ?? 0) > 64) return { ok: false, error: 'carrierName is too long.' };
  return { ok: true, body: { trackingNumber, carrierCode, carrierName } };
}

export async function editShipmentUploadMatch(
  client: EditShipmentUploadMatchClient,
  input: { userId: string; batchId: string; matchId: string; body: EditShipmentUploadMatchBody },
) {
  const match = await client.shipmentMatch.findFirst({
    where: { id: input.matchId, userId: input.userId, uploadBatchId: input.batchId },
    select: {
      id: true,
      userConfirmationStatus: true,
      transmissionStatus: true,
      algorithmMatchStatus: true,
      orderSyncOrderId: true,
      uploadBatch: { select: { status: true } },
    },
  });
  if (!match) return { success: false as const, status: 404, error: 'Match not found.' };
  if (match.uploadBatch.status !== SHIPMENT_UPLOAD_BATCH_READY_STATUS) {
    return { success: false as const, status: 409, error: 'Batch must be READY before edit.' };
  }
  if (match.transmissionStatus === 'SENT' || match.transmissionStatus === 'PROCESSING') {
    return { success: false as const, status: 409, error: 'Sent or processing match cannot be edited.' };
  }

  const updated = await client.shipmentMatch.updateMany({
    where: { id: input.matchId, userId: input.userId, uploadBatchId: input.batchId },
    data: {
      finalTrackingNumber: input.body.trackingNumber,
      finalCarrierCode: input.body.carrierCode || null,
      finalCarrierName: input.body.carrierName || null,
      userConfirmationStatus: 'EDITED',
      transmissionStatus: match.orderSyncOrderId ? 'READY' : 'NONE',
      transmissionErrorMessage: null,
      transmissionLeaseToken: null,
      transmissionLeaseExpiresAt: null,
      confirmedAt: new Date(),
      confirmedByUserId: input.userId,
    },
  });
  if (updated.count !== 1) return { success: false as const, status: 409, error: 'Edit conflict.' };

  const detail = await loadShipmentUploadBatchDetail(client, {
    userId: input.userId,
    batchId: input.batchId,
  });
  if (!detail.success) return detail;
  return { success: true as const, body: detail.body };
}
