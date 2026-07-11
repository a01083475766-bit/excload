/**
 * Read-only shipment transmission dry-run.
 * No Attempt / Match / Order writes. No credential / adapter / external API.
 */

import type {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';
import {
  evaluateShipmentTransmissionEligibility,
  type TransmissionEligibilityBatchInput,
  type TransmissionEligibilityMatchInput,
  type TransmissionEligibilityOrderInput,
} from '@/app/lib/order-integration/transmission/eligibility';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

export type DryRunReasonCode =
  | NonNullable<
      ReturnType<typeof evaluateShipmentTransmissionEligibility>['reasonCode']
    >
  | 'MATCH_NOT_FOUND';

export type ShipmentTransmissionDryRunMatchResult = {
  matchId: string;
  eligible: boolean;
  /**
   * true when FAILED + retryFailed passed eligibility.
   * Actual transmit still requires FAILED→READY preparation (dry-run does not mutate).
   */
  requiresRetryPreparation: boolean;
  reasonCode: DryRunReasonCode | null;
  reasonMessage: string | null;
  candidate: ShipmentTransmissionCandidate | null;
};

export type ShipmentTransmissionDryRunResponse = {
  dryRun: true;
  batch: {
    batchId: string;
    provider: OrderIntegrationProvider | null;
    integrationAccountId: string | null;
    status: ShipmentUploadBatchStatus;
  };
  summary: {
    requestedCount: number;
    evaluatedCount: number;
    eligibleCount: number;
    ineligibleCount: number;
    duplicateMatchIdCount: number;
    missingMatchIdCount: number;
  };
  results: ShipmentTransmissionDryRunMatchResult[];
};

export type RunShipmentTransmissionDryRunInput = {
  userId: string;
  batchId: string;
  /** undefined = all matches; [] = none */
  matchIds: string[] | undefined;
  retryFailed: boolean;
};

type DryRunBatchRow = {
  id: string;
  userId: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  status: ShipmentUploadBatchStatus;
};

type DryRunMatchRow = {
  id: string;
  userId: string;
  uploadBatchId: string;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  transmissionStatus: OrderSyncTransmissionStatus;
  orderSyncOrderId: string | null;
  finalTrackingNumber: string | null;
  finalCarrierCode: string | null;
  finalCarrierName: string | null;
  createdAt: Date;
  uploadRow: {
    trackingNumber: string;
    carrierCode: string | null;
    carrierName: string | null;
    originalRowIndex: number;
  };
  orderSyncOrder: {
    id: string;
    userId: string;
    provider: OrderIntegrationProvider;
    integrationAccountId: string | null;
    mallOrderNo: string;
    excloadOrderNo: string;
    mallLineItemIds: unknown;
    transmissionStatus: OrderSyncTransmissionStatus;
  } | null;
};

const BATCH_SELECT = {
  id: true,
  userId: true,
  provider: true,
  integrationAccountId: true,
  status: true,
} as const;

const MATCH_SELECT = {
  id: true,
  userId: true,
  uploadBatchId: true,
  provider: true,
  integrationAccountId: true,
  userConfirmationStatus: true,
  transmissionStatus: true,
  orderSyncOrderId: true,
  finalTrackingNumber: true,
  finalCarrierCode: true,
  finalCarrierName: true,
  createdAt: true,
  uploadRow: {
    select: {
      trackingNumber: true,
      carrierCode: true,
      carrierName: true,
      originalRowIndex: true,
    },
  },
  orderSyncOrder: {
    select: {
      id: true,
      userId: true,
      provider: true,
      integrationAccountId: true,
      mallOrderNo: true,
      excloadOrderNo: true,
      mallLineItemIds: true,
      transmissionStatus: true,
    },
  },
} as const;

export type RunShipmentTransmissionDryRunClient = {
  shipmentUploadBatch: {
    findFirst: (args: {
      where: { id: string; userId: string };
      select: typeof BATCH_SELECT;
    }) => Promise<DryRunBatchRow | null>;
  };
  shipmentMatch: {
    findMany: (args: {
      where: {
        uploadBatchId: string;
        userId: string;
        id?: { in: string[] };
      };
      select: typeof MATCH_SELECT;
      orderBy: [
        { uploadRow: { originalRowIndex: 'asc' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ];
    }) => Promise<DryRunMatchRow[]>;
  };
};

function toEligibilityMatch(row: DryRunMatchRow): TransmissionEligibilityMatchInput {
  return {
    id: row.id,
    userId: row.userId,
    uploadBatchId: row.uploadBatchId,
    orderSyncOrderId: row.orderSyncOrderId,
    provider: row.provider,
    integrationAccountId: row.integrationAccountId,
    userConfirmationStatus: row.userConfirmationStatus,
    transmissionStatus: row.transmissionStatus,
    finalTrackingNumber: row.finalTrackingNumber,
    finalCarrierCode: row.finalCarrierCode,
    finalCarrierName: row.finalCarrierName,
    uploadRow: {
      trackingNumber: row.uploadRow.trackingNumber,
      carrierCode: row.uploadRow.carrierCode,
      carrierName: row.uploadRow.carrierName,
    },
  };
}

function toEligibilityOrder(
  row: DryRunMatchRow['orderSyncOrder'],
): TransmissionEligibilityOrderInput | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    integrationAccountId: row.integrationAccountId,
    mallOrderNo: row.mallOrderNo,
    excloadOrderNo: row.excloadOrderNo,
    mallLineItemIds: row.mallLineItemIds,
  };
}

function missingResult(matchId: string): ShipmentTransmissionDryRunMatchResult {
  return {
    matchId,
    eligible: false,
    requiresRetryPreparation: false,
    reasonCode: 'MATCH_NOT_FOUND',
    reasonMessage: '매칭을 찾을 수 없습니다.',
    candidate: null,
  };
}

function buildMatchResult(
  matchId: string,
  transmissionStatus: OrderSyncTransmissionStatus,
  evaluated: ReturnType<typeof evaluateShipmentTransmissionEligibility>,
  retryFailed: boolean,
): ShipmentTransmissionDryRunMatchResult {
  const requiresRetryPreparation =
    evaluated.eligible && retryFailed && transmissionStatus === 'FAILED';
  return {
    matchId,
    eligible: evaluated.eligible,
    requiresRetryPreparation,
    reasonCode: evaluated.reasonCode,
    reasonMessage: evaluated.reasonMessage,
    candidate: evaluated.candidate,
  };
}

function dedupeMatchIds(matchIds: string[]): {
  uniqueOrdered: string[];
  duplicateMatchIdCount: number;
} {
  const seen = new Set<string>();
  const uniqueOrdered: string[] = [];
  let duplicateMatchIdCount = 0;
  for (const id of matchIds) {
    if (seen.has(id)) {
      duplicateMatchIdCount += 1;
      continue;
    }
    seen.add(id);
    uniqueOrdered.push(id);
  }
  return { uniqueOrdered, duplicateMatchIdCount };
}

export async function runShipmentTransmissionDryRun(
  client: RunShipmentTransmissionDryRunClient,
  input: RunShipmentTransmissionDryRunInput,
): Promise<
  | { success: false; status: 404 | 409; error: string }
  | { success: true; body: ShipmentTransmissionDryRunResponse }
> {
  const batch = await client.shipmentUploadBatch.findFirst({
    where: { id: input.batchId, userId: input.userId },
    select: BATCH_SELECT,
  });

  if (!batch) {
    return { success: false, status: 404, error: '업로드 배치를 찾을 수 없습니다.' };
  }

  if (batch.status !== SHIPMENT_UPLOAD_BATCH_READY_STATUS) {
    return {
      success: false,
      status: 409,
      error: 'READY 상태의 배치만 송장전송 dry-run을 실행할 수 있습니다.',
    };
  }

  const batchInput: TransmissionEligibilityBatchInput = {
    id: batch.id,
    userId: batch.userId,
    status: batch.status,
    provider: batch.provider,
    integrationAccountId: batch.integrationAccountId,
  };

  const emptyBody = (
    summary: ShipmentTransmissionDryRunResponse['summary'],
    results: ShipmentTransmissionDryRunMatchResult[],
  ): { success: true; body: ShipmentTransmissionDryRunResponse } => ({
    success: true,
    body: {
      dryRun: true,
      batch: {
        batchId: batch.id,
        provider: batch.provider,
        integrationAccountId: batch.integrationAccountId,
        status: batch.status,
      },
      summary,
      results,
    },
  });

  // Explicit empty selection — no match query
  if (Array.isArray(input.matchIds) && input.matchIds.length === 0) {
    return emptyBody(
      {
        requestedCount: 0,
        evaluatedCount: 0,
        eligibleCount: 0,
        ineligibleCount: 0,
        duplicateMatchIdCount: 0,
        missingMatchIdCount: 0,
      },
      [],
    );
  }

  const selecting = Array.isArray(input.matchIds);
  const { uniqueOrdered, duplicateMatchIdCount } = selecting
    ? dedupeMatchIds(input.matchIds!)
    : { uniqueOrdered: [] as string[], duplicateMatchIdCount: 0 };

  if (selecting && uniqueOrdered.length === 0) {
    return emptyBody(
      {
        requestedCount: input.matchIds!.length,
        evaluatedCount: 0,
        eligibleCount: 0,
        ineligibleCount: 0,
        duplicateMatchIdCount,
        missingMatchIdCount: 0,
      },
      [],
    );
  }

  const matches = await client.shipmentMatch.findMany({
    where: {
      uploadBatchId: input.batchId,
      userId: input.userId,
      ...(selecting ? { id: { in: uniqueOrdered } } : {}),
    },
    select: MATCH_SELECT,
    orderBy: [
      { uploadRow: { originalRowIndex: 'asc' } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

  const byId = new Map(matches.map((m) => [m.id, m]));

  const orderedRows: DryRunMatchRow[] = selecting
    ? uniqueOrdered.map((id) => byId.get(id)).filter((m): m is DryRunMatchRow => Boolean(m))
    : matches;

  const results: ShipmentTransmissionDryRunMatchResult[] = [];

  if (selecting) {
    for (const id of uniqueOrdered) {
      const row = byId.get(id);
      if (!row) {
        results.push(missingResult(id));
        continue;
      }
      const evaluated = evaluateShipmentTransmissionEligibility({
        batch: batchInput,
        match: toEligibilityMatch(row),
        order: toEligibilityOrder(row.orderSyncOrder),
        options: { retryFailed: input.retryFailed },
      });
      results.push(
        buildMatchResult(id, row.transmissionStatus, evaluated, input.retryFailed),
      );
    }
  } else {
    for (const row of orderedRows) {
      const evaluated = evaluateShipmentTransmissionEligibility({
        batch: batchInput,
        match: toEligibilityMatch(row),
        order: toEligibilityOrder(row.orderSyncOrder),
        options: { retryFailed: input.retryFailed },
      });
      results.push(
        buildMatchResult(row.id, row.transmissionStatus, evaluated, input.retryFailed),
      );
    }
  }

  const missingMatchIdCount = selecting
    ? uniqueOrdered.filter((id) => !byId.has(id)).length
    : 0;
  const eligibleCount = results.filter((r) => r.eligible).length;
  const ineligibleCount = results.length - eligibleCount;
  const requestedCount = selecting ? input.matchIds!.length : results.length;

  return emptyBody(
    {
      requestedCount,
      evaluatedCount: results.length,
      eligibleCount,
      ineligibleCount,
      duplicateMatchIdCount,
      missingMatchIdCount,
    },
    results,
  );
}
