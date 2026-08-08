import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { ElevenOrderRecord } from '@/app/lib/eleven/client';
import {
  buildElevenProductOrderNo,
  normalizeElevenAddPrdNoForPath,
  normalizeElevenAddPrdYn,
} from '@/app/lib/eleven/eleven-ids';

const ELEVEN_STATUS_LABEL: Record<string, string> = {
  '101': '결제완료',
  '201': '배송준비중',
  '301': '포장완료',
  '401': '배송중',
  '501': '배송완료',
};

export const ELEVEN_PREVIEW_HEADERS = [
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

export type ElevenPreviewRow = Record<(typeof ELEVEN_PREVIEW_HEADERS)[number], string>;

function mapStatusLabel(order: ElevenOrderRecord): string {
  if (order.ordStatNm) return order.ordStatNm;
  if (order.ordStat) return ELEVEN_STATUS_LABEL[order.ordStat] ?? order.ordStat;
  return '';
}

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function formatElevenDateTime(value?: string): string {
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

export function mapElevenOrderToStandardRow(order: ElevenOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const receiverPhone = order.rcvrPrtblNo || order.rcvrTlphn;
  const ordererPhone = order.ordPrtblTel || order.ordTlphnNo;
  const productOption = order.slctPrdOptNm || order.ordOptWonStl;
  const deliveryMessage = order.ordDlvReqCont || order.dlvMsg;
  const addPrdYn = normalizeElevenAddPrdYn(order.addPrdYn);
  const addPrdNoPath = normalizeElevenAddPrdNoForPath(addPrdYn, order.addPrdNo);

  row['주문번호'] = order.ordNo ?? '';
  row['상품주문번호'] = buildElevenProductOrderNo(order.ordNo ?? '', order.ordPrdSeq ?? '');
  row['주문상태'] = mapStatusLabel(order);
  row['주문일시'] = formatElevenDateTime(order.ordDt);
  row['결제일시'] = formatElevenDateTime(order.ordStlEndDt);
  row['주문자'] = order.ordNm ?? '';
  row['주문자연락처'] = normalizePhone(ordererPhone);
  row['받는사람'] = order.rcvrNm ?? '';
  row['받는사람전화1'] = normalizePhone(receiverPhone);
  row['받는사람우편번호'] = order.rcvrMailNo ?? '';
  row['받는사람주소1'] = order.rcvrBaseAddr ?? '';
  row['받는사람주소2'] = order.rcvrDtlsAddr ?? '';
  row['배송메시지'] = deliveryMessage ?? '';
  row['상품명'] = order.ordPrdNm ?? '';
  row['상품옵션'] = productOption ?? '';
  row['수량'] = order.ordQty ? String(order.ordQty) : '1';
  row['결제금액'] = order.ordPayAmt ?? '';
  row['판매처'] = '11번가';
  // dlvNo는 가이드상 배송번호 — 쿠팡 boxId와 같이 묶음배송번호 슬롯에 원문 보존(임의 생성 금지)
  row['묶음배송번호'] = (order.dlvNo ?? '').trim();
  // 추가구성: "Y|번호" 또는 "N|null"
  row['추가상품'] = `${addPrdYn}|${addPrdNoPath}`;
  if (order.invcNo) row['운송장번호'] = order.invcNo;
  if (order.dlvEtprsCd) row['택배사'] = order.dlvEtprsCd;

  return row;
}

export function mapElevenOrdersToStandardRows(orders: ElevenOrderRecord[]): BaseHeaderRow[] {
  return orders.map((order) => mapElevenOrderToStandardRow(order));
}

export function mapElevenOrdersToOrderStandardFile(orders: ElevenOrderRecord[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapElevenOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapElevenOrdersToPreviewRows(orders: ElevenOrderRecord[]): ElevenPreviewRow[] {
  return mapElevenOrdersToStandardRows(orders).map((row) => ({
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
