import { normalizeJoinKey } from '@/app/pipeline/invoice/merge-order-invoice-standard';
import {
  normalizeAddressForMatch,
  normalizePhoneDigits,
  normalizeReceiverName,
} from '@/app/lib/order-integration/shipments/normalize-shipment-row';
import { generateExcloadOrderNo, formatExcloadOrderNoDateKey } from '@/app/lib/order-integration/snapshots/excload-order-no';
import {
  resolveGroupedRemainQuantityForPersist,
  stripExcloadRemainQuantityFromRows,
} from '@/app/lib/order-integration/snapshots/remain-quantity';
import type {
  BuildOrderSyncSnapshotsInput,
  OrderRowShipmentGroup,
  OrderSyncOrderSnapshotForPersist,
} from '@/app/lib/order-integration/snapshots/types';

function pickReceiverPhone(row: Record<string, string>): string {
  const phone1 = String(row['받는사람전화1'] ?? '').trim();
  if (phone1) return phone1;
  return String(row['받는사람전화2'] ?? '').trim();
}

function formatReceiverAddress(row: Record<string, string>): string {
  return [row['받는사람주소1'], row['받는사람주소2']]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function parseQuantity(value: string | undefined): number {
  const parsed = parseInt(String(value ?? '1').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function pickOrderedAt(row: Record<string, string>): string {
  const paidAt = String(row['결제일시'] ?? '').trim();
  if (paidAt) return paidAt;
  return String(row['주문일시'] ?? '').trim();
}

function pickTrackingNumber(rows: ReadonlyArray<Record<string, string>>): string {
  for (const row of rows) {
    const tracking = String(row['운송장번호'] ?? '').trim();
    if (tracking) return tracking;
  }
  return '';
}

function pickDeliveryMemo(rows: ReadonlyArray<Record<string, string>>): string {
  for (const row of rows) {
    const memo = String(row['배송메시지'] ?? '').trim();
    if (memo) return memo;
  }
  return '';
}

function pickOrderStatus(rows: ReadonlyArray<Record<string, string>>): string {
  for (const row of rows) {
    const status = String(row['주문상태'] ?? '').trim();
    if (status) return status;
  }
  return '';
}

function isMeaningfulRow(row: Record<string, string>): boolean {
  const keys = ['주문번호', '상품주문번호', '받는사람', '상품명', '받는사람전화1', '받는사람주소1'];
  return keys.some((key) => String(row[key] ?? '').trim() !== '');
}

/** 여러 상품 라인 → `상품명(옵션) x수량` / … */
export function buildProductSummary(rows: ReadonlyArray<Record<string, string>>): string {
  const parts: string[] = [];

  for (const row of rows) {
    const name = String(row['상품명'] ?? '').trim();
    if (!name) continue;

    const option = String(row['상품옵션'] ?? '').trim();
    const quantity = parseQuantity(row['수량']);
    const label = option ? `${name}(${option})` : name;
    parts.push(`${label} x${quantity}`);
  }

  return parts.join(' / ');
}

export function buildShipmentGroupKey(input: {
  provider: string;
  accountId?: string | null;
  row: Record<string, string>;
}): string {
  const mallOrderNo = normalizeJoinKey(input.row['주문번호']);
  const receiverName = normalizeReceiverName(input.row['받는사람'] ?? '');
  const receiverPhone = normalizePhoneDigits(pickReceiverPhone(input.row));
  const receiverAddress = normalizeAddressForMatch(formatReceiverAddress(input.row));
  const accountId = String(input.accountId ?? '').trim();

  return [input.provider, accountId, mallOrderNo, receiverName, receiverPhone, receiverAddress].join(
    '|',
  );
}

/**
 * orderStandardFile.rows를 송장 매칭 단위(배송/수취인 기준)로 묶습니다.
 * 행 순서(index)는 그룹 키에 사용하지 않습니다.
 */
export function groupOrderRowsForShipment(input: {
  provider: string;
  accountId?: string | null;
  rows: ReadonlyArray<Record<string, string>>;
}): OrderRowShipmentGroup[] {
  const groups = new Map<string, OrderRowShipmentGroup>();

  input.rows.forEach((row, sourceRowIndex) => {
    if (!isMeaningfulRow(row)) return;

    const groupKey = buildShipmentGroupKey({
      provider: input.provider,
      accountId: input.accountId,
      row,
    });

    const existing = groups.get(groupKey);
    if (existing) {
      existing.rows.push(row);
      existing.sourceRowIndexes.push(sourceRowIndex);
      return;
    }

    groups.set(groupKey, {
      groupKey,
      rows: [row],
      sourceRowIndexes: [sourceRowIndex],
    });
  });

  return [...groups.values()];
}

export function collectMallLineItemIds(rows: ReadonlyArray<Record<string, string>>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const lineId = String(row['상품주문번호'] ?? '').trim();
    if (lineId && !seen.has(lineId)) {
      seen.add(lineId);
      ids.push(lineId);
    }

    const bundleId = String(row['묶음배송번호'] ?? '').trim();
    if (bundleId) {
      const bundleKey = `bundle:${bundleId}`;
      if (!seen.has(bundleKey)) {
        seen.add(bundleKey);
        ids.push(bundleKey);
      }
    }
  }

  return ids;
}

function buildNormalizedPayloadJson(
  rows: ReadonlyArray<Record<string, string>>,
  mallLineItemIds: string[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    mallLineItemIds,
  };

  const bundleIds = rows
    .map((row) => String(row['묶음배송번호'] ?? '').trim())
    .filter(Boolean);
  if (bundleIds.length > 0) {
    payload.shipmentBoxIds = [...new Set(bundleIds)];
  }

  const optionIds = rows
    .map((row) => String(row['옵션ID'] ?? '').trim())
    .filter(Boolean);
  if (optionIds.length > 0) {
    payload.optionIds = [...new Set(optionIds)];
  }

  return payload;
}

function sumQuantity(rows: ReadonlyArray<Record<string, string>>): number {
  return rows.reduce((sum, row) => sum + parseQuantity(row['수량']), 0);
}

function resolveRawPayloadJson(
  group: OrderRowShipmentGroup,
  rawOrders?: ReadonlyArray<unknown>,
): unknown | undefined {
  if (!rawOrders?.length) return undefined;

  const payloads = group.sourceRowIndexes
    .map((index) => rawOrders[index])
    .filter((value) => value != null);

  if (payloads.length === 0) return undefined;
  if (payloads.length === 1) return payloads[0];
  return payloads;
}

function toFetchedAtIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return String(value);
}

/**
 * orderStandardFile.rows → 송장 매칭용 OrderSyncOrder snapshot DTO 배열.
 */
export function buildOrderSyncSnapshots(
  input: BuildOrderSyncSnapshotsInput,
): OrderSyncOrderSnapshotForPersist[] {
  if (!input.rows.length) return [];

  const fetchedAt = toFetchedAtIso(input.fetchedAt);
  const fetchedDate = new Date(fetchedAt);
  const dateKey = formatExcloadOrderNoDateKey(
    Number.isNaN(fetchedDate.getTime()) ? new Date() : fetchedDate,
  );

  const cleanedRows = stripExcloadRemainQuantityFromRows(input.rows);

  const groups = groupOrderRowsForShipment({
    provider: String(input.provider),
    accountId: input.accountId,
    rows: cleanedRows,
  });

  let sequence = input.excloadOrderNoStartSeq ?? 1;

  return groups.map((group) => {
    const firstRow = group.rows[0]!;
    const mallLineItemIds = collectMallLineItemIds(group.rows);
    const excloadOrderNo = generateExcloadOrderNo({ dateKey, sequence });
    sequence += 1;

    return {
      userId: input.userId,
      provider: input.provider,
      accountId: input.accountId ?? null,
      batchId: input.batchId ?? null,
      tempBatchKey: input.tempBatchKey ?? null,
      fetchedAt,
      excloadOrderNo,
      mallOrderNo: String(firstRow['주문번호'] ?? '').trim(),
      mallOrderId: String(firstRow['주문번호'] ?? '').trim() || null,
      mallLineItemIds: mallLineItemIds.length > 0 ? mallLineItemIds : undefined,
      receiverName: String(firstRow['받는사람'] ?? '').trim(),
      receiverPhone: pickReceiverPhone(firstRow),
      receiverAddress: formatReceiverAddress(firstRow),
      productSummary: buildProductSummary(group.rows),
      quantity: sumQuantity(group.rows),
      remainQuantity: resolveGroupedRemainQuantityForPersist({
        provider: String(input.provider),
        sourceRowIndexes: group.sourceRowIndexes,
        remainQuantities: input.remainQuantities,
      }),
      deliveryMemo: pickDeliveryMemo(group.rows) || null,
      orderedAt: pickOrderedAt(firstRow) || null,
      orderStatus: pickOrderStatus(group.rows) || null,
      rawPayloadJson: resolveRawPayloadJson(group, input.rawOrders),
      normalizedPayloadJson: buildNormalizedPayloadJson(group.rows, mallLineItemIds),
      trackingNumber: pickTrackingNumber(group.rows) || null,
    };
  });
}
