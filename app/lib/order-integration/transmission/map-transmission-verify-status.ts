/**
 * 전송 성공 Attempt → 쇼핑몰 반영 상태 판정 (순수 매핑).
 */

import type { RecentTransmitVerificationStatus } from '@/app/lib/order-integration/transmission/recent-transmit-result-view';

export type TransmissionVerifyMappedStatus = {
  status: RecentTransmitVerificationStatus;
  mallStatusCode: string | null;
  mallStatusLabel: string | null;
  confirmedItems: number | null;
  totalItems: number | null;
  message: string;
};

const SMARTSTORE_CONFIRMED = new Set([
  'DELIVERING',
  'DELIVERED',
  'PURCHASE_DECIDED',
]);
const SMARTSTORE_PENDING = new Set(['PAYED', 'PAY_WAITING', 'PAYMENT_WAITING']);
const SMARTSTORE_ATTENTION = new Set([
  'CANCELED',
  'CANCELLED',
  'RETURNED',
  'EXCHANGED',
  'CANCELED_BY_NOPAYMENT',
]);

const COUPANG_CONFIRMED = new Set(['DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY']);
const COUPANG_PENDING = new Set(['INSTRUCT', 'ACCEPT']);
const COUPANG_ATTENTION = new Set(['NONE_TRACKING']);

function normalizeStatusCode(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

export function mapSmartstoreProductOrderStatuses(input: {
  statuses: ReadonlyArray<string | null | undefined>;
}): TransmissionVerifyMappedStatus {
  const codes = input.statuses.map(normalizeStatusCode).filter(Boolean);
  const totalItems = codes.length;
  if (totalItems === 0) {
    return {
      status: 'CHECK_FAILED',
      mallStatusCode: null,
      mallStatusLabel: null,
      confirmedItems: null,
      totalItems: 0,
      message: '상품주문 상태를 조회하지 못했습니다.',
    };
  }

  let confirmed = 0;
  let pending = 0;
  let attention = 0;
  for (const code of codes) {
    if (SMARTSTORE_CONFIRMED.has(code)) confirmed += 1;
    else if (SMARTSTORE_PENDING.has(code)) pending += 1;
    else if (SMARTSTORE_ATTENTION.has(code)) attention += 1;
    else pending += 1;
  }

  const joined = codes.join(',');
  if (attention > 0) {
    return {
      status: 'ATTENTION',
      mallStatusCode: joined,
      mallStatusLabel: joined,
      confirmedItems: confirmed,
      totalItems,
      message: '취소·반품·교환 등 확인이 필요한 상태가 있습니다.',
    };
  }
  if (confirmed === totalItems) {
    return {
      status: 'CONFIRMED',
      mallStatusCode: joined,
      mallStatusLabel: joined,
      confirmedItems: confirmed,
      totalItems,
      message: '쇼핑몰 주문 상태에 송장 반영이 확인되었습니다.',
    };
  }
  if (confirmed > 0) {
    return {
      status: 'PARTIAL',
      mallStatusCode: joined,
      mallStatusLabel: joined,
      confirmedItems: confirmed,
      totalItems,
      message: `${confirmed}/${totalItems}건만 반영이 확인되었습니다.`,
    };
  }
  return {
    status: 'PENDING',
    mallStatusCode: joined,
    mallStatusLabel: joined,
    confirmedItems: confirmed,
    totalItems,
    message: '아직 이전 상태입니다. 반영에는 시간이 걸릴 수 있습니다.',
  };
}

export function mapCoupangOrderSheetStatuses(input: {
  statuses: ReadonlyArray<string | null | undefined>;
}): TransmissionVerifyMappedStatus {
  const codes = input.statuses.map(normalizeStatusCode).filter(Boolean);
  const totalItems = codes.length;
  if (totalItems === 0) {
    return {
      status: 'CHECK_FAILED',
      mallStatusCode: null,
      mallStatusLabel: null,
      confirmedItems: null,
      totalItems: 0,
      message: '쿠팡 배송번호를 조회하지 못했습니다.',
    };
  }

  let confirmed = 0;
  let pending = 0;
  let attention = 0;
  for (const code of codes) {
    if (COUPANG_CONFIRMED.has(code)) confirmed += 1;
    else if (COUPANG_PENDING.has(code)) pending += 1;
    else if (COUPANG_ATTENTION.has(code)) attention += 1;
    else pending += 1;
  }

  const joined = codes.join(',');
  if (attention > 0) {
    return {
      status: 'ATTENTION',
      mallStatusCode: joined,
      mallStatusLabel: joined,
      confirmedItems: confirmed,
      totalItems,
      message: '추적 불가 등 확인이 필요한 상태입니다.',
    };
  }
  if (confirmed === totalItems) {
    return {
      status: 'CONFIRMED',
      mallStatusCode: joined,
      mallStatusLabel: joined,
      confirmedItems: confirmed,
      totalItems,
      message: '쇼핑몰 주문 상태에 송장 반영이 확인되었습니다.',
    };
  }
  if (confirmed > 0) {
    return {
      status: 'PARTIAL',
      mallStatusCode: joined,
      mallStatusLabel: joined,
      confirmedItems: confirmed,
      totalItems,
      message: `${confirmed}/${totalItems}건만 반영이 확인되었습니다.`,
    };
  }
  return {
    status: 'PENDING',
    mallStatusCode: joined,
    mallStatusLabel: joined,
    confirmedItems: confirmed,
    totalItems,
    message: '아직 이전 상태입니다. 쿠팡 반영에는 시간이 걸릴 수 있습니다.',
  };
}
