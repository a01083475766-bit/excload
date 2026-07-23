/**
 * SMARTSTORE 실제 송장 전송 확인창 — 순수 UI 게이트.
 * 서버 preflight·lease·accountId 소유권 검증을 대체하지 않는다.
 */

import type { OrderSyncTransmissionStatus } from '@prisma/client';

import type { ShipmentMatchStatus } from '@/app/lib/order-integration/shipments/types';

export const MOCK_TRANSMIT_BUTTON_LABEL = 'Mock 테스트 전송';
export const LIVE_TRANSMIT_BUTTON_LABEL = '실제 전송';
export const LIVE_TRANSMIT_FINAL_CONFIRM_LABEL = '최종 실제 전송';
export const LIVE_TRANSMIT_IN_PROGRESS_LABEL = '전송 중…';

export const LIVE_TRANSMIT_SAFETY_WARNINGS = [
  '이 작업은 네이버 주문을 실제 발송 처리하며 되돌리기 어려울 수 있습니다.',
  '발주확인과 송장 전송은 서로 다른 처리입니다.',
  '전송 결과가 불명확하면 다시 전송하지 말고 상태 다시 확인을 사용하세요.',
] as const;

export const LIVE_TRANSMIT_AREA_WARNING =
  '실제 전송은 네이버 스마트스토어 주문을 발송 처리합니다. Mock 테스트 전송과 다릅니다.';

export const LIVE_TRANSMIT_SERVER_RECHECK_NOTICE =
  '화면 기준 사전 확인이며, 서버가 전송 직전 다시 검사합니다.';

export const LIVE_TRANSMIT_SNAPSHOT_REMAIN_HINT =
  '남은 발송 수량은 주문조회·택배양식 다운로드 저장 시점 기준입니다. 기존 스냅샷에는 값이 없을 수 있으니, 배포 후 주문을 다시 조회하고 택배양식을 새로 다운로드하세요.';

export const MIXED_PROVIDER_TRANSMIT_BLOCK_MESSAGE =
  '쇼핑몰별로 나누어 전송해 주세요.';

const CONFLICT_OR_DUPLICATE_MATCH_STATUSES: ReadonlySet<ShipmentMatchStatus> = new Set([
  'DUPLICATE_TRACKING_NUMBER',
  'ALREADY_SHIPPED',
  'CANCELLED_OR_INVALID_ORDER',
]);

export type SmartstoreLiveTransmitConfirmOrderInput = {
  matchId: string;
  provider: string | null;
  mallOrderNo: string | null;
  carrierName: string | null;
  carrierCode: string | null;
  /** 원문 송장은 전달하지 않음. 마스킹 표시용만 */
  trackingNumberMasked: string | null;
  /** 서버가 계산한 원문 존재 여부 */
  hasTrackingNumber: boolean;
  transmissionStatus: OrderSyncTransmissionStatus | null;
  matchStatus: ShipmentMatchStatus;
  /** DB 스냅샷 remainQuantity. 없으면 null — 1로 추정하지 않음 */
  remainQuantity: number | null | undefined;
};

export type SmartstoreLiveTransmitConfirmInput = {
  batchProvider: string | null;
  integrationAccountId: string | null;
  /** 계정명/스토어명이 있으면 우선 표시 */
  accountDisplayName: string | null;
  orders: SmartstoreLiveTransmitConfirmOrderInput[];
  /** Mock 모드에서는 확인창·live 전송 모두 불가 */
  isMockMode: boolean;
};

export type RemainQuantityUiStatus =
  | { kind: 'ok'; value: number; label: string }
  | { kind: 'zero'; value: 0; label: string }
  | { kind: 'unclear'; value: null; label: string };

export type DuplicatePrecheckUiStatus =
  | { kind: 'ok'; label: string }
  | { kind: 'already_sent'; label: string }
  | { kind: 'duplicate'; label: string }
  | { kind: 'conflict'; label: string };

export type SmartstoreLiveTransmitConfirmOrderView = {
  matchId: string;
  maskedMallOrderNo: string;
  carrierLabel: string;
  maskedTrackingNumber: string;
  remainQuantity: RemainQuantityUiStatus;
  duplicatePrecheck: DuplicatePrecheckUiStatus;
  blockReasons: string[];
};

export const SMARTSTORE_LIVE_TRANSMIT_CONFIRM_FORBIDDEN_DISPLAY_KEYS = [
  'clientSecret',
  'accessToken',
  'credentials',
  'receiverName',
  'receiverPhone',
  'receiverAddress',
  'rawPayload',
  'normalizedPayloadJson',
] as const;

export type SmartstoreLiveTransmitConfirmView = {
  mallLabel: string;
  accountLabel: string;
  orderCount: number;
  orders: SmartstoreLiveTransmitConfirmOrderView[];
  warnings: readonly string[];
  serverRecheckNotice: string;
  snapshotRemainHint: string;
  canConfirmFinal: boolean;
  blockReasons: string[];
};

export type RealTransmitClickDecision =
  | { action: 'open-confirm'; view: SmartstoreLiveTransmitConfirmView }
  | { action: 'transmit-direct' }
  | { action: 'noop'; reason: string };

/**
 * Dry-run eligibility와 같은 우선순위 축:
 * 선택 행(match → order로 정규화된 ID) → 배치.
 * 행 간·행/배치 불일치 시 null로 차단(추정하지 않음).
 * 표시용 계정명은 사용하지 않는다.
 */
export function resolveIntegrationAccountIdForLiveTransmitConfirm(input: {
  batchIntegrationAccountId: string | null | undefined;
  selectedRowIntegrationAccountIds: ReadonlyArray<string | null | undefined>;
}): string | null {
  const batchId = input.batchIntegrationAccountId?.trim() || '';
  const fromRows = [
    ...new Set(
      input.selectedRowIntegrationAccountIds
        .map((id) => id?.trim() || '')
        .filter((id) => id.length > 0),
    ),
  ];

  if (fromRows.length > 1) {
    return null;
  }

  if (fromRows.length === 1) {
    const id = fromRows[0]!;
    if (batchId && batchId !== id) {
      return null;
    }
    return id;
  }

  return batchId || null;
}

export function isSmartstoreProviderValue(value: string | null | undefined): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  if (upper === 'SMARTSTORE') return true;
  if (raw === '스마트스토어') return true;
  return raw.toLowerCase() === 'smartstore';
}

export function maskMallOrderNoForConfirm(value: string | null | undefined): string {
  const compact = String(value ?? '').trim();
  if (!compact) return '확인 불가';
  // 짧은 값: 원문 전체가 연속 포함되지 않게 대부분 마스킹 + 끝 1자리만
  if (compact.length <= 2) {
    return '****';
  }
  if (compact.length <= 8) {
    return `****${compact.slice(-1)}`;
  }
  // 긴 값: 앞 2~3 + 끝 2~4
  if (compact.length <= 12) {
    return `${compact.slice(0, 2)}****${compact.slice(-2)}`;
  }
  return `${compact.slice(0, 3)}****${compact.slice(-4)}`;
}

export function maskIntegrationAccountIdForConfirm(value: string | null | undefined): string {
  const compact = String(value ?? '').trim();
  if (!compact) return '확인 불가';
  if (compact.length <= 2) {
    return '****';
  }
  if (compact.length <= 8) {
    // 짧은 계정: 대부분 마스킹, 끝 1~2자리만
    const tailLen = compact.length <= 4 ? 1 : 2;
    return `****${compact.slice(-tailLen)}`;
  }
  return `${compact.slice(0, 4)}····${compact.slice(-4)}`;
}

export function resolveRemainQuantityUiStatus(
  remainQuantity: number | null | undefined,
): RemainQuantityUiStatus {
  if (remainQuantity === null || remainQuantity === undefined) {
    return {
      kind: 'unclear',
      value: null,
      label: '남은 발송 수량을 확인할 수 없어 전송하지 않습니다.',
    };
  }
  if (typeof remainQuantity !== 'number' || Number.isNaN(remainQuantity)) {
    return {
      kind: 'unclear',
      value: null,
      label: '남은 발송 수량을 확인할 수 없어 전송하지 않습니다.',
    };
  }
  if (remainQuantity === 0) {
    return {
      kind: 'zero',
      value: 0,
      label: '남은 발송 수량이 없어 전송할 수 없습니다.',
    };
  }
  if (remainQuantity < 1) {
    return {
      kind: 'unclear',
      value: null,
      label: '남은 발송 수량을 확인할 수 없어 전송하지 않습니다.',
    };
  }
  return {
    kind: 'ok',
    value: remainQuantity,
    label: `주문조회·저장 기준 남은 발송 수량: ${remainQuantity}`,
  };
}

export function resolveDuplicatePrecheckUiStatus(input: {
  transmissionStatus: OrderSyncTransmissionStatus | null;
  matchStatus: ShipmentMatchStatus;
}): DuplicatePrecheckUiStatus {
  if (input.transmissionStatus === 'SENT') {
    return { kind: 'already_sent', label: '화면 기준 사전 확인: 이미 SENT — 재전송 불가' };
  }
  if (input.matchStatus === 'DUPLICATE_TRACKING_NUMBER') {
    return { kind: 'duplicate', label: '화면 기준 사전 확인: 중복 송장으로 판정됨' };
  }
  if (CONFLICT_OR_DUPLICATE_MATCH_STATUSES.has(input.matchStatus)) {
    return { kind: 'conflict', label: '화면 기준 사전 확인: 충돌/불가 상태로 판정됨' };
  }
  return { kind: 'ok', label: '화면 기준 사전 확인: 중복·충돌 이상 없음' };
}

function resolveCarrierLabel(order: SmartstoreLiveTransmitConfirmOrderInput): string {
  const name = order.carrierName?.trim();
  const code = order.carrierCode?.trim();
  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return code;
  return '(택배사 없음)';
}

function resolveMaskedTracking(order: SmartstoreLiveTransmitConfirmOrderInput): string {
  const fromMasked = order.trackingNumberMasked?.trim();
  if (fromMasked) return fromMasked;
  return '(송장번호 없음)';
}

function orderHasTracking(order: SmartstoreLiveTransmitConfirmOrderInput): boolean {
  return order.hasTrackingNumber === true;
}

function orderHasCarrier(order: SmartstoreLiveTransmitConfirmOrderInput): boolean {
  return Boolean(order.carrierName?.trim() || order.carrierCode?.trim());
}

function evaluateOrderBlockReasons(
  order: SmartstoreLiveTransmitConfirmOrderInput,
  remain: RemainQuantityUiStatus,
  precheck: DuplicatePrecheckUiStatus,
): string[] {
  const reasons: string[] = [];
  if (!isSmartstoreProviderValue(order.provider)) {
    reasons.push('provider가 SMARTSTORE가 아닙니다.');
  }
  if (!orderHasCarrier(order)) {
    reasons.push('택배사가 없습니다.');
  }
  if (!orderHasTracking(order)) {
    reasons.push('송장번호가 없습니다.');
  }
  if (remain.kind === 'zero') {
    reasons.push(remain.label);
  } else if (remain.kind === 'unclear') {
    reasons.push(remain.label);
  }
  if (precheck.kind === 'already_sent') {
    reasons.push(precheck.label);
  } else if (precheck.kind === 'duplicate' || precheck.kind === 'conflict') {
    reasons.push(precheck.label);
  }
  return reasons;
}

/**
 * 확인창 표시 모델. 원문 PII·시크릿·토큰·응답 원문을 포함하지 않는다.
 */
export function buildSmartstoreLiveTransmitConfirmView(
  input: SmartstoreLiveTransmitConfirmInput,
): SmartstoreLiveTransmitConfirmView {
  const blockReasons: string[] = [];
  const accountId = input.integrationAccountId?.trim() || null;
  const accountLabel =
    input.accountDisplayName?.trim() || maskIntegrationAccountIdForConfirm(accountId);

  if (input.isMockMode) {
    blockReasons.push('Mock 테스트 모드에서는 실제 전송을 실행할 수 없습니다.');
  }
  if (!isSmartstoreProviderValue(input.batchProvider)) {
    blockReasons.push('배치 provider가 SMARTSTORE가 아닙니다.');
  }
  if (!accountId) {
    blockReasons.push('integrationAccountId가 없어 전송할 수 없습니다.');
  }
  if (input.orders.length < 1) {
    blockReasons.push('전송 대상 주문이 없습니다.');
  }

  const orders: SmartstoreLiveTransmitConfirmOrderView[] = input.orders.map((order) => {
    const remainQuantity = resolveRemainQuantityUiStatus(order.remainQuantity);
    const duplicatePrecheck = resolveDuplicatePrecheckUiStatus({
      transmissionStatus: order.transmissionStatus,
      matchStatus: order.matchStatus,
    });
    const orderBlocks = evaluateOrderBlockReasons(order, remainQuantity, duplicatePrecheck);
    return {
      matchId: order.matchId,
      maskedMallOrderNo: maskMallOrderNoForConfirm(order.mallOrderNo),
      carrierLabel: resolveCarrierLabel(order),
      maskedTrackingNumber: resolveMaskedTracking(order),
      remainQuantity,
      duplicatePrecheck,
      blockReasons: orderBlocks,
    };
  });

  for (const order of orders) {
    for (const reason of order.blockReasons) {
      if (!blockReasons.includes(reason)) {
        blockReasons.push(reason);
      }
    }
  }

  const canConfirmFinal = blockReasons.length === 0 && !input.isMockMode;

  return {
    mallLabel: '스마트스토어',
    accountLabel,
    orderCount: input.orders.length,
    orders,
    warnings: LIVE_TRANSMIT_SAFETY_WARNINGS,
    serverRecheckNotice: LIVE_TRANSMIT_SERVER_RECHECK_NOTICE,
    snapshotRemainHint: LIVE_TRANSMIT_SNAPSHOT_REMAIN_HINT,
    canConfirmFinal,
    blockReasons,
  };
}

/**
 * 실제 전송 버튼 첫 클릭 분기.
 * SMARTSTORE 포함 시 확인창만 열고 API는 호출하지 않는다.
 * COUPANG 등만 선택된 경우 기존처럼 바로 전송한다.
 * SMARTSTORE와 다른 provider 혼합은 차단한다.
 */
export function decideRealTransmitClick(input: {
  selectedOrders: SmartstoreLiveTransmitConfirmOrderInput[];
  batchProvider: string | null;
  integrationAccountId: string | null;
  accountDisplayName?: string | null;
  isMockMode?: boolean;
}): RealTransmitClickDecision {
  if (input.selectedOrders.length === 0) {
    return { action: 'noop', reason: '전송할 행을 선택해주세요.' };
  }

  if (input.isMockMode) {
    return {
      action: 'noop',
      reason: 'Mock 테스트 모드에서는 실제 전송 확인창을 열지 않습니다.',
    };
  }

  const smartstoreOrders = input.selectedOrders.filter((order) =>
    isSmartstoreProviderValue(order.provider),
  );
  const nonSmartstoreOrders = input.selectedOrders.filter(
    (order) => !isSmartstoreProviderValue(order.provider),
  );
  const batchIsSmartstore = isSmartstoreProviderValue(input.batchProvider);
  const batchIsNonSmartstore =
    Boolean(input.batchProvider?.trim()) && !batchIsSmartstore;

  const hasSmartstore = batchIsSmartstore || smartstoreOrders.length > 0;
  const hasNonSmartstore = batchIsNonSmartstore || nonSmartstoreOrders.length > 0;

  if (hasSmartstore && hasNonSmartstore) {
    return { action: 'noop', reason: MIXED_PROVIDER_TRANSMIT_BLOCK_MESSAGE };
  }

  if (!hasSmartstore) {
    return { action: 'transmit-direct' };
  }

  // 혼합 시 다른 provider가 확인창에서 누락된 채 전송되지 않도록 SMARTSTORE 행만 확인창에 포함
  const confirmOrders =
    smartstoreOrders.length > 0
      ? smartstoreOrders
      : input.selectedOrders;

  const view = buildSmartstoreLiveTransmitConfirmView({
    batchProvider: batchIsSmartstore ? input.batchProvider : 'SMARTSTORE',
    integrationAccountId: input.integrationAccountId,
    accountDisplayName: input.accountDisplayName ?? null,
    orders: confirmOrders,
    isMockMode: false,
  });

  return { action: 'open-confirm', view };
}

/**
 * 최종 승인 클릭 시 실제 live transmit을 실행해도 되는지.
 * Mock·진행 중·확인 조건 미충족이면 false.
 */
export function shouldExecuteLiveTransmitAfterConfirm(input: {
  canConfirmFinal: boolean;
  isMockMode: boolean;
  isTransmitting: boolean;
}): boolean {
  if (input.isMockMode) return false;
  if (input.isTransmitting) return false;
  return input.canConfirmFinal;
}
