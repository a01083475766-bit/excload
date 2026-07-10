import { randomUUID } from 'node:crypto';

import type { OrderSyncTransmissionStatus } from '@prisma/client';

import type {
  ShipmentTransmissionAttemptRow,
  ShipmentTransmissionMatchRow,
  ShipmentTransmissionPersistClient,
  ShipmentTransmissionPersistTx,
} from '@/app/lib/order-integration/transmission/repository';

type OrderRow = {
  id: string;
  userId: string;
  transmissionStatus: OrderSyncTransmissionStatus;
};

/**
 * 테스트 전용 in-memory Prisma-like client.
 * $transaction은 snapshot/rollback을 지원합니다 (실 DB 연결 없음).
 */
export function createMemoryTransmissionPersistClient() {
  const matches = new Map<string, ShipmentTransmissionMatchRow>();
  const attempts = new Map<string, ShipmentTransmissionAttemptRow>();
  const orders = new Map<string, OrderRow>();

  function cloneMatches() {
    return new Map(
      [...matches.entries()].map(([k, v]) => [k, { ...v }]),
    );
  }
  function cloneAttempts() {
    return new Map(
      [...attempts.entries()].map(([k, v]) => [k, { ...v }]),
    );
  }
  function cloneOrders() {
    return new Map(
      [...orders.entries()].map(([k, v]) => [k, { ...v }]),
    );
  }

  function matchWhere(row: ShipmentTransmissionMatchRow, where: Record<string, unknown>): boolean {
    if (where.id != null && row.id !== where.id) return false;
    if (where.userId != null && row.userId !== where.userId) return false;
    if (where.uploadBatchId != null && row.uploadBatchId !== where.uploadBatchId) return false;
    if (where.provider != null && row.provider !== where.provider) return false;
    if (
      where.integrationAccountId != null &&
      row.integrationAccountId !== where.integrationAccountId
    ) {
      return false;
    }
    if (
      where.transmissionStatus != null &&
      row.transmissionStatus !== where.transmissionStatus
    ) {
      return false;
    }
    if (
      where.transmissionLeaseToken != null &&
      row.transmissionLeaseToken !== where.transmissionLeaseToken
    ) {
      return false;
    }
    if (where.orderSyncOrderId != null && row.orderSyncOrderId !== where.orderSyncOrderId) {
      return false;
    }
    if (where.OR && Array.isArray(where.OR)) {
      const ok = where.OR.some((clause: Record<string, unknown>) => {
        if (Object.prototype.hasOwnProperty.call(clause, 'transmissionLeaseExpiresAt')) {
          const v = clause.transmissionLeaseExpiresAt;
          if (v === null) return row.transmissionLeaseExpiresAt == null;
          if (v && typeof v === 'object' && 'lt' in v) {
            const lt = (v as { lt: Date }).lt;
            return (
              row.transmissionLeaseExpiresAt != null &&
              row.transmissionLeaseExpiresAt.getTime() < lt.getTime()
            );
          }
        }
        return false;
      });
      if (!ok) return false;
    }
    return true;
  }

  function attemptWhere(
    row: ShipmentTransmissionAttemptRow,
    where: Record<string, unknown>,
  ): boolean {
    if (where.id != null && row.id !== where.id) return false;
    if (where.userId != null && row.userId !== where.userId) return false;
    if (where.shipmentMatchId != null && row.shipmentMatchId !== where.shipmentMatchId) {
      return false;
    }
    if (where.status != null && row.status !== where.status) return false;
    if (where.executionToken != null && row.executionToken !== where.executionToken) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(where, 'dispatchedAt')) {
      if (where.dispatchedAt === null && row.dispatchedAt != null) return false;
    }
    return true;
  }

  function buildTx(): ShipmentTransmissionPersistTx {
    return {
      shipmentMatch: {
        async updateMany({ where, data }) {
          let count = 0;
          for (const [id, row] of matches) {
            if (!matchWhere(row, where)) continue;
            matches.set(id, { ...row, ...(data as Partial<ShipmentTransmissionMatchRow>) });
            count += 1;
          }
          return { count };
        },
        async findFirst({ where }) {
          for (const row of matches.values()) {
            if (matchWhere(row, where)) return row;
          }
          return null;
        },
        async findMany({ where }) {
          return [...matches.values()]
            .filter((row) => matchWhere(row, where))
            .map((row) => ({ transmissionStatus: row.transmissionStatus }));
        },
      },
      shipmentTransmissionAttempt: {
        async create({ data }) {
          const id = String(data.id ?? randomUUID());
          const row = { id, ...data } as ShipmentTransmissionAttemptRow;
          for (const existing of attempts.values()) {
            if (
              existing.shipmentMatchId === row.shipmentMatchId &&
              existing.attemptNo === row.attemptNo
            ) {
              throw new Error('Unique constraint failed on attemptNo');
            }
          }
          attempts.set(id, row);
          return row;
        },
        async findFirst({ where, orderBy }) {
          let rows = [...attempts.values()].filter((row) => attemptWhere(row, where));
          if (orderBy?.attemptNo === 'desc') {
            rows = rows.sort((a, b) => b.attemptNo - a.attemptNo);
          }
          return rows[0] ?? null;
        },
        async updateMany({ where, data }) {
          let count = 0;
          for (const [id, row] of attempts) {
            if (!attemptWhere(row, where)) continue;
            attempts.set(id, { ...row, ...(data as Partial<ShipmentTransmissionAttemptRow>) });
            count += 1;
          }
          return { count };
        },
      },
      orderSyncOrder: {
        async updateMany({ where, data }) {
          let count = 0;
          for (const [id, row] of orders) {
            if (where.id != null && row.id !== where.id) continue;
            if (where.userId != null && row.userId !== where.userId) continue;
            orders.set(id, { ...row, ...(data as Partial<OrderRow>) });
            count += 1;
          }
          return { count };
        },
      },
    };
  }

  const client: ShipmentTransmissionPersistClient = {
    async $transaction(fn) {
      const snapMatches = cloneMatches();
      const snapAttempts = cloneAttempts();
      const snapOrders = cloneOrders();
      try {
        return await fn(buildTx());
      } catch (error) {
        matches.clear();
        attempts.clear();
        orders.clear();
        for (const [k, v] of snapMatches) matches.set(k, v);
        for (const [k, v] of snapAttempts) attempts.set(k, v);
        for (const [k, v] of snapOrders) orders.set(k, v);
        throw error;
      }
    },
  };

  return {
    client,
    seedMatch(row: ShipmentTransmissionMatchRow) {
      matches.set(row.id, { ...row });
    },
    seedOrder(row: OrderRow) {
      orders.set(row.id, { ...row });
    },
    getMatch(id: string) {
      return matches.get(id) ?? null;
    },
    getAttempt(id: string) {
      return attempts.get(id) ?? null;
    },
    getOrder(id: string) {
      return orders.get(id) ?? null;
    },
  };
}
