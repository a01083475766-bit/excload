import type {
  OrderIntegrationProvider,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import { maskRecipientName } from '@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch';
import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';
import { maskShipmentPhone } from '@/app/lib/order-integration/shipments/shipment-match-ui';

export const EXPORTABLE_SHIPMENT_USER_CONFIRMATION_STATUSES: ReadonlySet<ShipmentUserConfirmationStatus> =
  new Set(['CONFIRMED', 'MANUALLY_LINKED', 'EDITED']);

type LoadedExportUploadRow = {
  id: string;
  trackingNumber: string;
  carrierName: string | null;
  mallOrderNo: string | null;
  excloadOrderNo: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
};

type LoadedExportOrderSyncOrder = {
  id: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  mallOrderNo: string;
  excloadOrderNo: string;
  receiverName: string | null;
  receiverPhone: string | null;
};

export type LoadedShipmentUploadExportMatch = {
  id: string;
  uploadRowId: string;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  orderSyncOrderId: string | null;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  finalTrackingNumber: string | null;
  finalCarrierName: string | null;
  uploadRow: LoadedExportUploadRow;
  orderSyncOrder: LoadedExportOrderSyncOrder | null;
};

export type ShipmentUploadExportRow = {
  orderSyncOrderId: string;
  shipmentMatchId: string;
  shipmentUploadRowId: string;
  mallOrderNo: string;
  excloadOrderNo: string;
  trackingNumber: string;
  carrierName: string | null;
  recipientNameMasked: string | null;
  recipientPhoneMasked: string | null;
};

export type ShipmentUploadExportGroup = {
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  rows: ShipmentUploadExportRow[];
};

export type ShipmentUploadExportRowsResponse = {
  batchId: string;
  status: typeof SHIPMENT_UPLOAD_BATCH_READY_STATUS;
  groups: ShipmentUploadExportGroup[];
  excludedCount: number;
};

export type BuildShipmentUploadExportRowsClient = {
  shipmentUploadBatch: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: {
        id: true;
        status: true;
        provider: true;
        integrationAccountId: true;
      };
    }) => Promise<{
      id: string;
      status: ShipmentUploadBatchStatus;
      provider: OrderIntegrationProvider | null;
      integrationAccountId: string | null;
    } | null>;
  };
  shipmentMatch: {
    findMany: (args: {
      where: { uploadBatchId: string; userId: string };
      select: Record<string, unknown>;
    }) => Promise<LoadedShipmentUploadExportMatch[]>;
  };
};

export function isExportableShipmentMatchStatus(
  status: ShipmentUserConfirmationStatus,
): boolean {
  return EXPORTABLE_SHIPMENT_USER_CONFIRMATION_STATUSES.has(status);
}

export function buildShipmentUploadExportGroupKey(input: {
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
}): string {
  return `${input.provider}::${input.integrationAccountId ?? ''}`;
}

export function evaluateShipmentUploadExportEligibility(input: {
  batchStatus: ShipmentUploadBatchStatus;
  matches: Array<{ userConfirmationStatus: ShipmentUserConfirmationStatus }>;
}): { ok: true } | { ok: false; status: 409; error: string } {
  if (input.batchStatus !== SHIPMENT_UPLOAD_BATCH_READY_STATUS) {
    return {
      ok: false,
      status: 409,
      error: 'READY 상태의 배치만 보낼 수 있습니다.',
    };
  }

  if (input.matches.length === 0) {
    return {
      ok: false,
      status: 409,
      error: '보낼 매칭 결과가 없습니다.',
    };
  }

  if (input.matches.some((match) => match.userConfirmationStatus === 'UNCONFIRMED')) {
    return {
      ok: false,
      status: 409,
      error: '아직 처리되지 않은 매칭이 있어 보낼 수 없습니다.',
    };
  }

  return { ok: true };
}

export function resolveShipmentUploadExportTrackingNumber(match: LoadedShipmentUploadExportMatch): string {
  return match.finalTrackingNumber?.trim() || match.uploadRow.trackingNumber.trim();
}

export function resolveShipmentUploadExportCarrierName(
  match: LoadedShipmentUploadExportMatch,
): string | null {
  const carrierName = match.finalCarrierName?.trim() || match.uploadRow.carrierName?.trim();
  return carrierName || null;
}

export function mapShipmentUploadExportRow(input: {
  match: LoadedShipmentUploadExportMatch;
  batchProvider: OrderIntegrationProvider | null;
  batchIntegrationAccountId: string | null;
}):
  | {
      row: ShipmentUploadExportRow;
      provider: OrderIntegrationProvider;
      integrationAccountId: string | null;
    }
  | { error: string } {
  const orderId = input.match.orderSyncOrderId?.trim();
  const order = input.match.orderSyncOrder;

  if (!orderId || !order || order.id !== orderId) {
    return { error: '연결된 주문이 없어 보낼 수 없습니다.' };
  }

  const trackingNumber = resolveShipmentUploadExportTrackingNumber(input.match);
  if (!trackingNumber) {
    return { error: '송장번호가 없어 보낼 수 없습니다.' };
  }

  const provider = input.match.provider ?? order.provider ?? input.batchProvider;
  if (!provider) {
    return { error: '쇼핑몰 정보가 없어 보낼 수 없습니다.' };
  }

  const recipientName = order.receiverName ?? input.match.uploadRow.receiverName;
  const recipientPhone = order.receiverPhone ?? input.match.uploadRow.receiverPhone;

  return {
    row: {
      orderSyncOrderId: orderId,
      shipmentMatchId: input.match.id,
      shipmentUploadRowId: input.match.uploadRowId,
      mallOrderNo: order.mallOrderNo,
      excloadOrderNo: order.excloadOrderNo,
      trackingNumber,
      carrierName: resolveShipmentUploadExportCarrierName(input.match),
      recipientNameMasked: maskRecipientName(recipientName),
      recipientPhoneMasked: maskShipmentPhone(recipientPhone),
    },
    provider,
    integrationAccountId:
      input.match.integrationAccountId ??
      order.integrationAccountId ??
      input.batchIntegrationAccountId,
  };
}

export function groupShipmentUploadExportRows(
  items: Array<{
    provider: OrderIntegrationProvider;
    integrationAccountId: string | null;
    row: ShipmentUploadExportRow;
  }>,
): ShipmentUploadExportGroup[] {
  const groupMap = new Map<string, ShipmentUploadExportGroup>();

  for (const item of items) {
    const key = buildShipmentUploadExportGroupKey({
      provider: item.provider,
      integrationAccountId: item.integrationAccountId,
    });
    const existing = groupMap.get(key);

    if (existing) {
      existing.rows.push(item.row);
      continue;
    }

    groupMap.set(key, {
      provider: item.provider,
      integrationAccountId: item.integrationAccountId,
      rows: [item.row],
    });
  }

  return [...groupMap.values()].sort((left, right) => {
    const providerCompare = left.provider.localeCompare(right.provider);
    if (providerCompare !== 0) return providerCompare;
    return (left.integrationAccountId ?? '').localeCompare(right.integrationAccountId ?? '');
  });
}

export function buildShipmentUploadExportRowsFromMatches(input: {
  batchId: string;
  batchProvider: OrderIntegrationProvider | null;
  batchIntegrationAccountId: string | null;
  matches: LoadedShipmentUploadExportMatch[];
}):
  | { success: false; status: 400; error: string }
  | { success: true; body: ShipmentUploadExportRowsResponse } {
  const exportItems: Array<{
    provider: OrderIntegrationProvider;
    integrationAccountId: string | null;
    row: ShipmentUploadExportRow;
  }> = [];
  let excludedCount = 0;

  for (const match of input.matches) {
    if (match.userConfirmationStatus === 'EXCLUDED') {
      excludedCount += 1;
      continue;
    }

    if (!isExportableShipmentMatchStatus(match.userConfirmationStatus)) {
      continue;
    }

    const mapped = mapShipmentUploadExportRow({
      match,
      batchProvider: input.batchProvider,
      batchIntegrationAccountId: input.batchIntegrationAccountId,
    });

    if ('error' in mapped) {
      return { success: false, status: 400, error: mapped.error };
    }

    exportItems.push(mapped);
  }

  return {
    success: true,
    body: {
      batchId: input.batchId,
      status: SHIPMENT_UPLOAD_BATCH_READY_STATUS,
      groups: groupShipmentUploadExportRows(exportItems),
      excludedCount,
    },
  };
}

export async function buildShipmentUploadExportRows(
  client: BuildShipmentUploadExportRowsClient,
  input: { userId: string; batchId: string },
): Promise<
  | { success: false; status: 404 | 409 | 400; error: string }
  | { success: true; body: ShipmentUploadExportRowsResponse }
> {
  const batch = await client.shipmentUploadBatch.findFirst({
    where: {
      id: input.batchId,
      userId: input.userId,
    },
    select: {
      id: true,
      status: true,
      provider: true,
      integrationAccountId: true,
    },
  });

  if (!batch) {
    return { success: false, status: 404, error: '업로드 배치를 찾을 수 없습니다.' };
  }

  const matches = await client.shipmentMatch.findMany({
    where: {
      uploadBatchId: input.batchId,
      userId: input.userId,
    },
    select: {
      id: true,
      uploadRowId: true,
      userConfirmationStatus: true,
      orderSyncOrderId: true,
      provider: true,
      integrationAccountId: true,
      finalTrackingNumber: true,
      finalCarrierName: true,
      uploadRow: {
        select: {
          id: true,
          trackingNumber: true,
          carrierName: true,
          mallOrderNo: true,
          excloadOrderNo: true,
          receiverName: true,
          receiverPhone: true,
        },
      },
      orderSyncOrder: {
        select: {
          id: true,
          provider: true,
          integrationAccountId: true,
          mallOrderNo: true,
          excloadOrderNo: true,
          receiverName: true,
          receiverPhone: true,
        },
      },
    },
  });

  const eligibility = evaluateShipmentUploadExportEligibility({
    batchStatus: batch.status,
    matches,
  });
  if (!eligibility.ok) {
    return { success: false, status: eligibility.status, error: eligibility.error };
  }

  return buildShipmentUploadExportRowsFromMatches({
    batchId: batch.id,
    batchProvider: batch.provider,
    batchIntegrationAccountId: batch.integrationAccountId,
    matches,
  });
}
