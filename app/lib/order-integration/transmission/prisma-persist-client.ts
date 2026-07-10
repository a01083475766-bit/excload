import type { PrismaClient } from '@prisma/client';

import { classifyPrismaPersistFailure } from '@/app/lib/order-integration/transmission/prisma-persist-error';
import {
  mapShipmentAttemptPersistRow,
  mapShipmentMatchPersistRow,
  SHIPMENT_ATTEMPT_PERSIST_SELECT,
  SHIPMENT_MATCH_PERSIST_SELECT,
  toAttemptCreateData,
  toAttemptUpdateData,
  toAttemptWhereInput,
  toMatchUpdateData,
  toMatchWhereInput,
  toOrderUpdateData,
  toOrderWhereInput,
  type ShipmentAttemptPersistSelected,
  type ShipmentMatchPersistSelected,
} from '@/app/lib/order-integration/transmission/prisma-persist-mappers';
import type {
  ShipmentTransmissionPersistClient,
  ShipmentTransmissionPersistTx,
} from '@/app/lib/order-integration/transmission/repository';

/**
 * PrismaClient 또는 interactive transaction client.
 * module import만으로 DB에 연결하지 않습니다 — 호출자가 주입합니다.
 */
export type PrismaTransmissionDelegate = {
  shipmentMatch: {
    updateMany: PrismaClient['shipmentMatch']['updateMany'];
    findFirst: PrismaClient['shipmentMatch']['findFirst'];
    findMany: PrismaClient['shipmentMatch']['findMany'];
  };
  shipmentTransmissionAttempt: {
    create: PrismaClient['shipmentTransmissionAttempt']['create'];
    findFirst: PrismaClient['shipmentTransmissionAttempt']['findFirst'];
    updateMany: PrismaClient['shipmentTransmissionAttempt']['updateMany'];
  };
  orderSyncOrder: {
    updateMany: PrismaClient['orderSyncOrder']['updateMany'];
  };
};

export type PrismaTransmissionClientLike = PrismaTransmissionDelegate & {
  $transaction: <T>(
    fn: (tx: PrismaTransmissionDelegate) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
};

/**
 * Prisma delegate → ShipmentTransmissionPersistTx (select/mapper 적용).
 * repository 정책은 여기 두지 않고 DB primitive만 제공합니다.
 * 모든 호출은 인자로 받은 `db`(보통 TX client)만 사용합니다.
 */
export function createShipmentTransmissionPersistTx(
  db: PrismaTransmissionDelegate,
): ShipmentTransmissionPersistTx {
  return {
    shipmentMatch: {
      async updateMany({ where, data }) {
        return db.shipmentMatch.updateMany({
          where: toMatchWhereInput(where),
          data: toMatchUpdateData(data),
        });
      },
      async findFirst({ where }) {
        const row = (await db.shipmentMatch.findFirst({
          where: toMatchWhereInput(where),
          select: SHIPMENT_MATCH_PERSIST_SELECT,
        })) as ShipmentMatchPersistSelected | null;
        return row ? mapShipmentMatchPersistRow(row) : null;
      },
      async findMany({ where }) {
        const rows = await db.shipmentMatch.findMany({
          where: toMatchWhereInput(where),
          select: { transmissionStatus: true },
        });
        return rows.map((row) => ({ transmissionStatus: row.transmissionStatus }));
      },
    },
    shipmentTransmissionAttempt: {
      async create({ data }) {
        try {
          const row = (await db.shipmentTransmissionAttempt.create({
            data: toAttemptCreateData(data),
            select: SHIPMENT_ATTEMPT_PERSIST_SELECT,
          })) as ShipmentAttemptPersistSelected;
          return mapShipmentAttemptPersistRow(row);
        } catch (error) {
          const classified = classifyPrismaPersistFailure(error);
          const err = new Error(
            classified.prismaCode === 'P2002'
              ? 'P2002 Unique constraint failed'
              : 'persistence error',
          );
          (err as Error & { prismaCode?: string | null }).prismaCode =
            classified.prismaCode;
          throw err;
        }
      },
      async findFirst({ where, orderBy }) {
        const row = (await db.shipmentTransmissionAttempt.findFirst({
          where: toAttemptWhereInput(where),
          ...(orderBy?.attemptNo
            ? { orderBy: { attemptNo: orderBy.attemptNo } }
            : {}),
          select: SHIPMENT_ATTEMPT_PERSIST_SELECT,
        })) as ShipmentAttemptPersistSelected | null;
        return row ? mapShipmentAttemptPersistRow(row) : null;
      },
      async updateMany({ where, data }) {
        return db.shipmentTransmissionAttempt.updateMany({
          where: toAttemptWhereInput(where),
          data: toAttemptUpdateData(data),
        });
      },
    },
    orderSyncOrder: {
      async updateMany({ where, data }) {
        return db.orderSyncOrder.updateMany({
          where: toOrderWhereInput(where),
          data: toOrderUpdateData(data),
        });
      },
    },
  };
}

/**
 * 실제 Prisma `$transaction`을 ShipmentTransmissionPersistClient에 연결합니다.
 *
 * - 인자로 PrismaClient(또는 호환 client)를 **명시 주입**
 * - default singleton / module 로드 시 DB 연결 없음
 * - TX callback에는 래핑된 tx만 전달 (전역 prisma write 금지)
 */
export function createPrismaShipmentTransmissionPersistClient(
  prisma: PrismaTransmissionClientLike,
): ShipmentTransmissionPersistClient {
  return {
    $transaction: async (fn) =>
      prisma.$transaction(async (tx) => {
        const persistTx = createShipmentTransmissionPersistTx(tx);
        return fn(persistTx);
      }),
  };
}
