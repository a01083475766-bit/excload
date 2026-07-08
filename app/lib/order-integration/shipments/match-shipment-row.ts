import { normalizeJoinKey } from '@/app/pipeline/invoice/merge-order-invoice-standard';
import {
  MATCH_SCORE,
  MATCH_THRESHOLD,
} from '@/app/lib/order-integration/shipments/match-constants';
import {
  normalizeAddressForMatch,
  normalizePhoneDigits,
  normalizeReceiverName,
} from '@/app/lib/order-integration/shipments/normalize-shipment-row';
import type {
  NormalizedShipmentRow,
  OrderSyncOrderSnapshot,
  ShipmentMatchCandidate,
  ShipmentMatchResult,
  ShipmentMatchScope,
  ShipmentMatchStatus,
} from '@/app/lib/order-integration/shipments/types';

const CANCELLED_STATUS_PATTERN = /cancel|취소|refund|반품|returned|void/i;

export function isCancelledOrInvalidOrderStatus(orderStatus?: string | null): boolean {
  if (!orderStatus?.trim()) return false;
  return CANCELLED_STATUS_PATTERN.test(orderStatus);
}

export function isOrderAlreadyShipped(order: OrderSyncOrderSnapshot): boolean {
  return Boolean(order.existingTrackingNumber?.trim());
}

function addressesStrongMatch(shipmentAddress: string, orderAddress?: string | null): boolean {
  const left = normalizeAddressForMatch(shipmentAddress);
  const right = normalizeAddressForMatch(orderAddress ?? '');
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function productSummaryPartialMatch(shipmentText: string, orderSummary?: string | null): boolean {
  const left = normalizeReceiverName(shipmentText);
  const right = normalizeReceiverName(orderSummary ?? '');
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function filterCandidateOrders(
  orders: OrderSyncOrderSnapshot[],
  scope: ShipmentMatchScope,
): OrderSyncOrderSnapshot[] {
  return orders.filter((order) => {
    if (order.userId !== scope.userId) return false;
    if (scope.provider && order.provider !== scope.provider) return false;
    if (scope.accountId && order.accountId !== scope.accountId) return false;
    return true;
  });
}

export function scoreShipmentOrderPair(
  shipment: NormalizedShipmentRow,
  order: OrderSyncOrderSnapshot,
): ShipmentMatchCandidate {
  const reasons: string[] = [];
  const mismatchFields: string[] = [];
  let score = 0;

  if (shipment.excloadOrderNo && order.excloadOrderNo) {
    if (shipment.excloadOrderNo.trim() === order.excloadOrderNo.trim()) {
      score += MATCH_SCORE.EXCLOAD_ORDER_NO;
      reasons.push('excloadOrderNo exact');
    } else {
      mismatchFields.push('excloadOrderNo');
    }
  }

  const shipmentMallKey = normalizeJoinKey(shipment.mallOrderNo);
  const orderMallKey = normalizeJoinKey(order.mallOrderNo);
  const mallOrderMatched = Boolean(shipmentMallKey && orderMallKey && shipmentMallKey === orderMallKey);

  if (shipmentMallKey && orderMallKey) {
    if (mallOrderMatched) {
      score += MATCH_SCORE.MALL_ORDER_NO;
      reasons.push('mallOrderNo');
    } else {
      mismatchFields.push('mallOrderNo');
    }
  }

  const shipmentPhone = shipment.receiverPhoneNormalized;
  const orderPhone = normalizePhoneDigits(order.receiverPhone ?? '');
  const phoneMatched = Boolean(shipmentPhone && orderPhone && shipmentPhone === orderPhone);

  if (shipmentPhone && orderPhone) {
    if (phoneMatched) {
      score += MATCH_SCORE.PHONE;
      reasons.push('phone');
    } else if (mallOrderMatched) {
      mismatchFields.push('receiverPhone');
    }
  }

  const shipmentName = normalizeReceiverName(shipment.receiverName);
  const orderName = normalizeReceiverName(order.receiverName ?? '');
  const nameMatched = Boolean(shipmentName && orderName && shipmentName === orderName);

  if (shipmentName && orderName) {
    if (nameMatched) {
      score += MATCH_SCORE.RECEIVER_NAME;
      reasons.push('receiverName');
    } else if (mallOrderMatched) {
      mismatchFields.push('receiverName');
    }
  }

  if (addressesStrongMatch(shipment.receiverAddress, order.receiverAddress)) {
    score += MATCH_SCORE.ADDRESS_STRONG;
    reasons.push('address');
  }

  if (productSummaryPartialMatch(shipment.productText, order.productSummary)) {
    score += MATCH_SCORE.PRODUCT_SUMMARY;
    reasons.push('productSummary');
  }

  if (
    order.exportedRowIndex != null &&
    order.exportedRowIndex === shipment.originalRowIndex
  ) {
    score += MATCH_SCORE.EXPORTED_ROW_INDEX_HINT;
    reasons.push('exportedRowIndex hint');
  }

  return {
    orderId: order.id,
    score,
    reasons,
    mismatchFields,
  };
}

function hasOnlyRowIndexHint(candidate: ShipmentMatchCandidate): boolean {
  return (
    candidate.reasons.length === 1 &&
    candidate.reasons[0] === 'exportedRowIndex hint'
  );
}

function resolveMatchStatus(input: {
  shipment: NormalizedShipmentRow;
  candidates: ShipmentMatchCandidate[];
  isDuplicateTracking: boolean;
  topOrder?: OrderSyncOrderSnapshot;
}): { status: ShipmentMatchStatus; matchScore: number; matchReason: string; mismatchFields: string[]; matchedOrderId: string | null } {
  if (input.isDuplicateTracking) {
    return {
      status: 'DUPLICATE_TRACKING_NUMBER',
      matchScore: 0,
      matchReason: '동일 업로드 파일 내 송장번호 중복',
      mismatchFields: ['trackingNumber'],
      matchedOrderId: null,
    };
  }

  const sortedAll = [...input.candidates].sort((a, b) => b.score - a.score);
  const topAny = sortedAll[0];
  if (topAny && hasOnlyRowIndexHint(topAny)) {
    return {
      status: 'NOT_MATCHED',
      matchScore: topAny.score,
      matchReason: '행 순서만 일치 — 자동 확정 금지',
      mismatchFields: [],
      matchedOrderId: null,
    };
  }

  const viable = input.candidates.filter((c) => c.score >= MATCH_THRESHOLD.WARNING);
  if (viable.length === 0) {
    return {
      status: 'NOT_MATCHED',
      matchScore: topAny?.score ?? 0,
      matchReason: '매칭 후보 없음',
      mismatchFields: [],
      matchedOrderId: null,
    };
  }

  const sorted = [...viable].sort((a, b) => b.score - a.score);
  const top = sorted[0]!;
  const second = sorted[1];

  if (second && second.score === top.score) {
    return {
      status: 'MULTIPLE_CANDIDATES',
      matchScore: top.score,
      matchReason: '동점 후보가 여러 개입니다',
      mismatchFields: top.mismatchFields,
      matchedOrderId: null,
    };
  }

  const topOrder = input.topOrder;
  if (topOrder && isCancelledOrInvalidOrderStatus(topOrder.orderStatus)) {
    return {
      status: 'CANCELLED_OR_INVALID_ORDER',
      matchScore: top.score,
      matchReason: '취소 또는 전송 불가 주문',
      mismatchFields: top.mismatchFields,
      matchedOrderId: topOrder.id,
    };
  }

  if (topOrder && isOrderAlreadyShipped(topOrder)) {
    return {
      status: 'ALREADY_SHIPPED',
      matchScore: top.score,
      matchReason: '이미 송장이 등록된 주문',
      mismatchFields: top.mismatchFields,
      matchedOrderId: topOrder.id,
    };
  }

  const hasStrongKey =
    top.reasons.includes('excloadOrderNo exact') ||
    (top.reasons.includes('mallOrderNo') && top.reasons.includes('phone')) ||
    (top.reasons.includes('mallOrderNo') &&
      top.reasons.includes('receiverName') &&
      top.reasons.includes('phone'));

  if (top.score >= MATCH_THRESHOLD.CONFIDENT && hasStrongKey && top.mismatchFields.length === 0) {
    return {
      status: 'MATCHED_CONFIDENT',
      matchScore: top.score,
      matchReason: top.reasons.join(', '),
      mismatchFields: top.mismatchFields,
      matchedOrderId: top.orderId,
    };
  }

  if (top.score >= MATCH_THRESHOLD.WARNING) {
    return {
      status: 'MATCHED_WARNING',
      matchScore: top.score,
      matchReason: top.mismatchFields.length
        ? `유사 매칭 (${top.mismatchFields.join(', ')} 불일치)`
        : top.reasons.join(', '),
      mismatchFields: top.mismatchFields,
      matchedOrderId: top.orderId,
    };
  }

  return {
    status: 'NOT_MATCHED',
    matchScore: top.score,
    matchReason: '점수 미달',
    mismatchFields: top.mismatchFields,
    matchedOrderId: null,
  };
}

export function matchShipmentRow(input: {
  shipment: NormalizedShipmentRow;
  orders: OrderSyncOrderSnapshot[];
  scope: ShipmentMatchScope;
  duplicateTrackingNumbers?: ReadonlySet<string>;
}): ShipmentMatchResult {
  const candidateOrders = filterCandidateOrders(input.orders, input.scope);
  const candidates = candidateOrders.map((order) => scoreShipmentOrderPair(input.shipment, order));

  const isDuplicateTracking = Boolean(
    input.shipment.trackingNumberNormalized &&
      input.duplicateTrackingNumbers?.has(input.shipment.trackingNumberNormalized),
  );

  const topCandidate = [...candidates].sort((a, b) => b.score - a.score)[0];
  const topOrder = topCandidate
    ? candidateOrders.find((order) => order.id === topCandidate.orderId)
    : undefined;

  const resolved = resolveMatchStatus({
    shipment: input.shipment,
    candidates,
    isDuplicateTracking,
    topOrder,
  });

  return {
    shipmentRowIndex: input.shipment.originalRowIndex,
    matchStatus: resolved.status,
    matchScore: resolved.matchScore,
    matchReason: resolved.matchReason,
    mismatchFields: resolved.mismatchFields,
    matchedOrderId: resolved.matchedOrderId,
    candidates: candidates
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
    transmissionStatus: 'NOT_READY',
  };
}

/** 여러 송장 행을 한 번에 매칭 — 업로드 batch 내 송장번호 중복 감지 포함 */
export function matchShipmentRows(input: {
  shipments: NormalizedShipmentRow[];
  orders: OrderSyncOrderSnapshot[];
  scope: ShipmentMatchScope;
}): ShipmentMatchResult[] {
  const trackingCounts = new Map<string, number>();
  for (const shipment of input.shipments) {
    const key = shipment.trackingNumberNormalized;
    if (!key) continue;
    trackingCounts.set(key, (trackingCounts.get(key) ?? 0) + 1);
  }

  const duplicateTrackingNumbers = new Set<string>();
  for (const [key, count] of trackingCounts) {
    if (count > 1) duplicateTrackingNumbers.add(key);
  }

  return input.shipments.map((shipment) =>
    matchShipmentRow({
      shipment,
      orders: input.orders,
      scope: input.scope,
      duplicateTrackingNumbers,
    }),
  );
}
