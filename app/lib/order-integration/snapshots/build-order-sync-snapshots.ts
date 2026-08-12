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
    // Cafe24 shop_no 보존 (비민감). 센터코드에 숫자 shop_no를 넣어 둔 경우.
    const center = String(row['센터코드'] ?? '').trim();
    if (/^\d+$/.test(center)) {
      const shopKey = `shop_no:${center}`;
      if (!seen.has(shopKey)) {
        seen.add(shopKey);
        ids.push(shopKey);
      }
    }

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

    // 11번가 추가구성 — "Y|번호" / "N|null" (map-eleven-orders)
    const addPrd = String(row['추가상품'] ?? '').trim();
    let addPrdYn = 'N';
    let addPrdNo = 'null';
    if (addPrd.includes('|')) {
      const [ynRaw, noRaw = 'null'] = addPrd.split('|');
      addPrdYn = ynRaw.trim().toUpperCase() === 'Y' ? 'Y' : 'N';
      addPrdNo = (noRaw || 'null').trim() || 'null';
      const ynKey = `addPrdYn:${addPrdYn}`;
      const noKey = `addPrdNo:${addPrdNo}`;
      if (!seen.has(ynKey)) {
        seen.add(ynKey);
        ids.push(ynKey);
      }
      if (!seen.has(noKey)) {
        seen.add(noKey);
        ids.push(noKey);
      }
    }

    // 라인 단위 복합키 (복수 품목·추가구성 혼재 시 전송용)
    const ordNo = String(row['주문번호'] ?? '').trim();
    const productOrderNo = String(row['상품주문번호'] ?? '').trim();
    const dash = productOrderNo.lastIndexOf('-');
    const ordPrdSeq =
      dash > 0 ? productOrderNo.slice(dash + 1).trim() : '';
    if (ordNo && ordPrdSeq && bundleId) {
      const lineKey = `elevenLine:${ordNo}|${ordPrdSeq}|${bundleId}|${addPrdYn}|${addPrdNo}`;
      if (!seen.has(lineKey)) {
        seen.add(lineKey);
        ids.push(lineKey);
      }
    }

    // 도매꾹 — 출고번호=API숫자주문번호, 센터코드=statusMode(WAIT*), 출고타입=market
    const apiOrderNo = String(row['출고번호'] ?? '').trim();
    const statusMode = String(row['센터코드'] ?? '').trim().toUpperCase();
    const market = String(row['출고타입'] ?? '').trim().toLowerCase();
    const isDomeggookMeta =
      (/^\d+$/.test(apiOrderNo) && /^WAIT[A-Z]+$|^DONE$|^DENY|^BACK$/.test(statusMode)) ||
      market === 'dome' ||
      market === 'supply';
    if (isDomeggookMeta) {
      if (/^\d+$/.test(apiOrderNo)) {
        const apiKey = `apiOrderNo:${apiOrderNo}`;
        if (!seen.has(apiKey)) {
          seen.add(apiKey);
          ids.push(apiKey);
        }
      }
      if (statusMode) {
        const modeKey = `statusMode:${statusMode}`;
        if (!seen.has(modeKey)) {
          seen.add(modeKey);
          ids.push(modeKey);
        }
      }
      if (market === 'dome' || market === 'supply') {
        const marketKey = `market:${market}`;
        if (!seen.has(marketKey)) {
          seen.add(marketKey);
          ids.push(marketKey);
        }
      }
      const uid = String(row['상품주문번호'] ?? '').trim();
      if (uid && uid !== String(row['주문번호'] ?? '').trim()) {
        const uidKey = `orderUid:${uid}`;
        if (!seen.has(uidKey)) {
          seen.add(uidKey);
          ids.push(uidKey);
        }
      }
    }

    const dvs = String(row['출고타입'] ?? '').trim().toUpperCase();
    if (dvs === 'DV' || dvs === 'RTRV') {
      const odNo = String(row['주문번호'] ?? '').trim();
      const productOrderNo = String(row['상품주문번호'] ?? '').trim();
      const dash = productOrderNo.lastIndexOf('-');
      const odSeq = dash > 0 ? productOrderNo.slice(dash + 1).trim() : '';
      if (odNo && odSeq) {
        const lineKey = `lotteonLine:${odNo}|${odSeq}|${String(row['출고번호'] ?? '1').trim() || '1'}|${String(row['판매상품번호'] || row['상품코드'] || '').trim()}|${String(row['옵션ID'] ?? '').trim()}|${dvs}|${String(row['관리상품번호'] ?? '10').trim() || '10'}|${String(row['수량'] ?? '1').trim() || '1'}|${String(row['제휴주문번호'] ?? '').trim()}|${String(row['주문상태'] ?? '').includes('상품준비') ? '12' : String(row['주문상태'] ?? '').includes('출고지시') ? '11' : ''}`;
        if (!seen.has(lineKey)) {
          seen.add(lineKey);
          ids.push(lineKey);
        }
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
    payload.elevenDlvNos = [...new Set(bundleIds)];
  }

  const optionIds = rows
    .map((row) => String(row['옵션ID'] ?? '').trim())
    .filter(Boolean);
  if (optionIds.length > 0) {
    payload.optionIds = [...new Set(optionIds)];
  }

  const shopNos = rows
    .map((row) => String(row['센터코드'] ?? '').trim())
    .filter((value) => /^\d+$/.test(value));
  if (shopNos.length > 0) {
    payload.shopNo = Number(shopNos[0]);
  }

  const shippingCodes = rows
    .map((row) => String(row['출고번호'] ?? '').trim())
    .filter(Boolean);
  if (shippingCodes.length > 0) {
    payload.shippingCodes = [...new Set(shippingCodes)];
  }

  // 11번가 전용 메타 — 다른 몰(스마트스토어 PO-1 등)의 하이픈 상품주문번호를 오인하지 않도록
  // map-eleven의 추가상품(Y|…/N|null) 또는 묶음배송번호+ordNo-seq 형태일 때만 저장.
  const elevenLines = rows
    .map((row) => {
      const productOrderNo = String(row['상품주문번호'] ?? '').trim();
      const ordNo = String(row['주문번호'] ?? '').trim();
      const bundleId = String(row['묶음배송번호'] ?? '').trim();
      const addPrd = String(row['추가상품'] ?? '').trim();
      const dash = productOrderNo.lastIndexOf('-');
      const hasElevenAddPrd = addPrd.includes('|');
      const hasElevenLineShape = Boolean(bundleId) && dash > 0;
      if (!hasElevenAddPrd && !hasElevenLineShape) return null;
      if (!productOrderNo && !ordNo) return null;
      const parsedOrdNo = dash > 0 ? productOrderNo.slice(0, dash) : ordNo || productOrderNo;
      const parsedSeq = dash > 0 ? productOrderNo.slice(dash + 1) : '';
      let addPrdYn = 'N';
      let addPrdNo = 'null';
      if (hasElevenAddPrd) {
        const [ynRaw, noRaw = 'null'] = addPrd.split('|');
        addPrdYn = ynRaw.trim().toUpperCase() === 'Y' ? 'Y' : 'N';
        addPrdNo = (noRaw || 'null').trim() || 'null';
      }
      return {
        ordNo: parsedOrdNo,
        ordPrdSeq: parsedSeq,
        dlvNo: bundleId,
        addPrdYn,
        addPrdNo,
        ordStatNm: String(row['주문상태'] ?? '').trim(),
      };
    })
    .filter(Boolean);
  if (elevenLines.length > 0) {
    payload.elevenLines = elevenLines;
  }

  const domeggookLines = rows
    .map((row) => {
      const displayOrderNo = String(row['주문번호'] ?? '').trim();
      const apiOrderNo = String(row['출고번호'] ?? '').trim();
      const statusMode = String(row['센터코드'] ?? '').trim().toUpperCase();
      const market = String(row['출고타입'] ?? '').trim().toLowerCase();
      const orderUid = String(row['상품주문번호'] ?? '').trim();
      const looksDomeggook =
        (/^\d+$/.test(apiOrderNo) && /^WAIT|^DONE$|^DENY|^BACK$/.test(statusMode)) ||
        market === 'dome' ||
        market === 'supply';
      if (!looksDomeggook || (!displayOrderNo && !apiOrderNo)) return null;
      return {
        displayOrderNo,
        apiOrderNo: /^\d+$/.test(apiOrderNo) ? apiOrderNo : '',
        orderUid: orderUid && orderUid !== displayOrderNo ? orderUid : '',
        statusMode,
        market,
        deliveryCompany: String(row['택배사'] ?? '').trim(),
        deliveryCode: String(row['운송장번호'] ?? '').trim(),
        deliveryMethod: String(row['배송방법'] ?? '').trim(),
        ordStatNm: String(row['주문상태'] ?? '').trim(),
      };
    })
    .filter(Boolean);
  if (domeggookLines.length > 0) {
    payload.domeggookLines = domeggookLines;
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
