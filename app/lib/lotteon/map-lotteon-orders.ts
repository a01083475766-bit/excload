import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { LotteonOrderRecord } from '@/app/lib/lotteon/client';
import { buildLotteonLineKey, isLotteonClaimLine } from '@/app/lib/lotteon/lotteon-ids';
import {
  EXCLOAD_ORDER_STATUS_LABEL,
  type ExcloadOrderStatus,
  type ExcloadPlaceOrderStatus,
} from '@/app/lib/order-integration/order-status';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';

const LOTTEON_STATUS_LABEL: Record<string, string> = {
  '11': '출고지시',
  '12': '상품준비',
  '13': '발송완료',
  '14': '배송완료',
  '15': '수취완료',
  '21': '취소완료',
  '22': '철회',
  '23': '회수지시',
  '24': '회수진행',
  '25': '회수완료',
  '26': '회수확정',
  '27': '반품완료',
};

export const LOTTEON_PREVIEW_HEADERS = [
  '주문번호',
  '상품주문번호',
  '주문상태',
  '받는사람',
  '받는사람전화1',
  '받는사람주소1',
  '상품명',
  '수량',
  '결제일시',
  '배송메시지',
] as const;

export type LotteonPreviewRow = Record<(typeof LOTTEON_PREVIEW_HEADERS)[number], string>;

export function mapLotteonStatus(order: Pick<LotteonOrderRecord, 'odPrgsStepCd' | 'odTypCd' | 'dvRtrvDvsCd'>): {
  status: ExcloadOrderStatus;
  placeOrderStatus: ExcloadPlaceOrderStatus;
  statusLabel: string;
  hubEligible: boolean;
  claimLabel: string;
} {
  const step = (order.odPrgsStepCd ?? '').trim();
  const statusLabel = LOTTEON_STATUS_LABEL[step] || step;
  if (isLotteonClaimLine(order)) {
    let status: ExcloadOrderStatus = 'CANCELED';
    if (order.odTypCd === '30' || order.odTypCd === '31' || step === '23' || step === '24') {
      status = 'EXCHANGED';
    }
    if (order.odTypCd === '40' || order.odTypCd === '41' || step === '25' || step === '26' || step === '27') {
      status = 'RETURNED';
    }
    if (order.dvRtrvDvsCd === 'RTRV' && status === 'CANCELED') status = 'RETURNED';
    return {
      status,
      placeOrderStatus: 'UNKNOWN',
      statusLabel,
      hubEligible: false,
      claimLabel: EXCLOAD_ORDER_STATUS_LABEL[status],
    };
  }

  if (step === '13') {
    return { status: 'DELIVERING', placeOrderStatus: 'OK', statusLabel, hubEligible: false, claimLabel: '' };
  }
  if (step === '14' || step === '15') {
    return { status: 'DELIVERED', placeOrderStatus: 'OK', statusLabel, hubEligible: false, claimLabel: '' };
  }
  if (step === '12') {
    return { status: 'PAYED', placeOrderStatus: 'OK', statusLabel, hubEligible: true, claimLabel: '' };
  }
  // 11 출고지시 — 연동완료 통보 전 = 발주 미확인
  return { status: 'PAYED', placeOrderStatus: 'NOT_YET', statusLabel, hubEligible: false, claimLabel: '' };
}

function mapStatusLabel(order: LotteonOrderRecord): string {
  if (order.odPrgsStepNm) return order.odPrgsStepNm;
  return mapLotteonStatus(order).statusLabel;
}

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function formatLotteonDateTime(value?: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length >= 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`;
  }
  if (digits.length >= 12) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}`;
  }
  return value;
}

export function mapLotteonOrderToStandardRow(order: LotteonOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const paidAt = order.odCmptDttm || order.odAcptDttm;
  const mapped = mapLotteonStatus(order);

  row['주문번호'] = order.odNo;
  row['상품주문번호'] = `${order.odNo}-${order.odSeq}`;
  row['주문상태'] = mapped.statusLabel || mapStatusLabel(order);
  row['주문일시'] = formatLotteonDateTime(order.odAcptDttm);
  row['결제일시'] = formatLotteonDateTime(paidAt);
  row['받는사람'] = order.rcvrNm;
  row['받는사람전화1'] = normalizePhone(order.rcvrPhone);
  row['받는사람우편번호'] = order.rcvrZipNo;
  row['받는사람주소1'] = order.rcvrBaseAddr;
  row['받는사람주소2'] = order.rcvrDtlAddr;
  row['배송메시지'] = order.dlvMsg;
  row['상품명'] = order.pdNm;
  row['수량'] = order.slQty || order.odQty || '1';
  row['결제금액'] = order.odAmt;
  row['판매처'] = '롯데ON';
  row['판매상품번호'] = order.spdNo;
  row['상품코드'] = order.spdNo;
  row['옵션ID'] = order.sitmNo;
  row['출고번호'] = order.procSeq || '1';
  row['출고타입'] = order.dvRtrvDvsCd || 'DV';
  row['관리상품번호'] = order.odTypCd || '10';
  row['제휴주문번호'] = order.clmNo;
  row['운송장번호'] = order.invcNo;
  row['택배사코드'] = order.dvCoCd;
  return row;
}

export function mapLotteonOrdersToStandardRows(orders: LotteonOrderRecord[]): BaseHeaderRow[] {
  return orders.map((order) => mapLotteonOrderToStandardRow(order));
}

export function mapLotteonOrdersToOrderStandardFile(orders: LotteonOrderRecord[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapLotteonOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapLotteonOrdersToPreviewRows(orders: LotteonOrderRecord[]): LotteonPreviewRow[] {
  return mapLotteonOrdersToStandardRows(orders).map((row) => ({
    주문번호: row['주문번호'],
    상품주문번호: row['상품주문번호'] ?? row['주문번호'],
    주문상태: row['주문상태'],
    받는사람: row['받는사람'],
    받는사람전화1: row['받는사람전화1'],
    받는사람주소1: [row['받는사람주소1'], row['받는사람주소2']].filter(Boolean).join(' ').trim(),
    상품명: row['상품명'],
    수량: row['수량'],
    결제일시: row['결제일시'],
    배송메시지: row['배송메시지'],
  }));
}

export function mapLotteonOrdersToFetchViews(orders: LotteonOrderRecord[]): OrderFetchView[] {
  return orders.map((order, rowIndex) => {
    const mapped = mapLotteonStatus(order);
    const remain = Number(order.slQty || order.odQty || '1');
    const remainOk = Number.isFinite(remain) ? remain > 0 : true;
    return {
      rowIndex,
      status: mapped.status,
      statusLabel: mapped.statusLabel,
      placeOrderStatus: mapped.placeOrderStatus,
      orderNo: order.odNo,
      productOrderNo: `${order.odNo}-${order.odSeq}`,
      paidAt: formatLotteonDateTime(order.odCmptDttm || order.odAcptDttm),
      orderedAt: formatLotteonDateTime(order.odAcptDttm),
      productName: order.pdNm,
      productOption: '',
      quantity: order.slQty || order.odQty || '1',
      remainQuantity: Number.isFinite(remain) ? remain : undefined,
      receiverName: order.rcvrNm,
      paymentAmount: order.odAmt,
      paymentMeans: '',
      hasTracking: Boolean(order.invcNo),
      claimLabel: mapped.claimLabel,
      mallOrderStatusCode: order.odPrgsStepCd,
      hubEligible: mapped.hubEligible && remainOk,
      detail: {
        ordererName: '',
        receiverPhone: normalizePhone(order.rcvrPhone),
        receiverAddress: [order.rcvrBaseAddr, order.rcvrDtlAddr].filter(Boolean).join(' ').trim(),
        deliveryMemo: order.dlvMsg,
        sellerProductCode: order.spdNo,
      },
    };
  });
}

export function lotteonLineKeyFromOrder(order: LotteonOrderRecord): string {
  return buildLotteonLineKey({
    odNo: order.odNo,
    odSeq: order.odSeq,
    procSeq: order.procSeq || '1',
    spdNo: order.spdNo,
    sitmNo: order.sitmNo,
    dvRtrvDvsCd: order.dvRtrvDvsCd || 'DV',
    odTypCd: order.odTypCd || '10',
    slQty: order.slQty || order.odQty || '1',
    clmNo: order.clmNo,
    odPrgsStepCd: order.odPrgsStepCd,
  });
}
