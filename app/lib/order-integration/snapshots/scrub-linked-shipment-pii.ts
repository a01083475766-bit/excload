/**
 * OrderSyncOrder에 연결된 ShipmentMatch·ShipmentUploadRow 수취인/후보 PII 제거.
 * 만료 hard delete 직전·전송 완료 clear 공통.
 */

import { Prisma } from '@prisma/client';

export const SHIPMENT_MATCH_PII_CLEAR_DATA = {
  candidateOrdersJson: Prisma.DbNull,
  mismatchFieldsJson: Prisma.DbNull,
} as const;

export const SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA = {
  receiverName: null,
  receiverPhone: null,
  receiverPhoneNormalized: null,
  receiverAddress: null,
  rawRowJson: Prisma.DbNull,
  productText: null,
} as const;

export type ScrubLinkedShipmentPiiClient = {
  shipmentMatch: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }) => Promise<Array<{ id: string; uploadRowId: string }>>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  shipmentUploadRow: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

export type ScrubLinkedShipmentPiiResult = {
  clearedMatches: number;
  clearedUploadRows: number;
};

/**
 * 지정 OrderSyncOrder id들에 연결된 Match·UploadRow PII를 지웁니다.
 * (전송 완료 여부와 무관 — 만료 삭제 시 이력 행에 PII가 남지 않게 함)
 */
export async function scrubLinkedShipmentPiiForOrders(
  client: ScrubLinkedShipmentPiiClient,
  input: { orderSyncOrderIds: ReadonlyArray<string> },
): Promise<ScrubLinkedShipmentPiiResult> {
  if (input.orderSyncOrderIds.length === 0) {
    return { clearedMatches: 0, clearedUploadRows: 0 };
  }

  const matches = await client.shipmentMatch.findMany({
    where: { orderSyncOrderId: { in: [...input.orderSyncOrderIds] } },
    select: { id: true, uploadRowId: true },
  });

  if (matches.length === 0) {
    return { clearedMatches: 0, clearedUploadRows: 0 };
  }

  const matchIds = matches.map((m) => m.id);
  const rowIds = [...new Set(matches.map((m) => m.uploadRowId))];

  const matchResult = await client.shipmentMatch.updateMany({
    where: { id: { in: matchIds } },
    data: { ...SHIPMENT_MATCH_PII_CLEAR_DATA },
  });

  const rowResult = await client.shipmentUploadRow.updateMany({
    where: { id: { in: rowIds } },
    data: { ...SHIPMENT_UPLOAD_ROW_PII_CLEAR_DATA },
  });

  return {
    clearedMatches: matchResult.count,
    clearedUploadRows: rowResult.count,
  };
}
