/**
 * Bundle WorkItem + 송장 매칭 결과 → 수동 등록 안내 행.
 */

import type { CourierDownloadWorkItemSource } from '@prisma/client';

import {
  buildCourierDownloadMallOrderMatchKey,
  resolveUniqueWorkItemByMallOrderKey,
} from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';

export type ManualRegistrationDisplayStatus =
  | 'READY'
  | 'NEEDS_TRACKING_LINK'
  | 'NEEDS_MALL_ORDER_INFO';

export type ManualRegistrationWorkItem = {
  id: string;
  downloadBundleId: string;
  inputSource: CourierDownloadWorkItemSource | 'API' | 'EXCEL' | 'TEXT';
  sourceMallKey: string | null;
  sourceMallLabel: string | null;
  mallOrderNo: string | null;
  excloadOrderNo: string;
};

export type ManualRegistrationShipmentLink = {
  mallOrderNo: string | null;
  excloadOrderNo: string | null;
  sourceMallKey?: string | null;
  trackingNumber: string | null;
  carrierName: string | null;
};

export type ManualRegistrationRow = {
  workItemId: string;
  excloadOrderNo: string;
  inputSource: string;
  sourceMallLabel: string;
  mallOrderNo: string | null;
  trackingNumber: string | null;
  carrierName: string | null;
  status: ManualRegistrationDisplayStatus;
  statusLabel: string;
};

export function manualRegistrationStatusLabel(
  status: ManualRegistrationDisplayStatus,
): string {
  if (status === 'READY') return '수동 등록 준비됨';
  if (status === 'NEEDS_TRACKING_LINK') return '수동 등록 · 송장 연결 필요';
  return '확인 필요(쇼핑몰/주문정보 확인 필요)';
}

/**
 * EXCEL/TEXT WorkItem만 수동 영역에 올린다.
 * 송장 미연결이어도 숨기지 않는다.
 */
export function buildManualRegistrationRows(input: {
  workItems: ReadonlyArray<ManualRegistrationWorkItem>;
  shipmentLinks: ReadonlyArray<ManualRegistrationShipmentLink>;
}): ManualRegistrationRow[] {
  const manualItems = input.workItems.filter(
    (item) => item.inputSource === 'EXCEL' || item.inputSource === 'TEXT',
  );

  const linksByKey = new Map<string, ManualRegistrationShipmentLink[]>();
  const linksByMallOrder = new Map<string, ManualRegistrationShipmentLink[]>();
  const linksByExcload = new Map<string, ManualRegistrationShipmentLink>();

  for (const link of input.shipmentLinks) {
    if (link.excloadOrderNo?.trim()) {
      linksByExcload.set(link.excloadOrderNo.trim(), link);
    }
    if (link.mallOrderNo?.trim()) {
      const mallNo = link.mallOrderNo.trim();
      const list = linksByMallOrder.get(mallNo) ?? [];
      list.push(link);
      linksByMallOrder.set(mallNo, list);
    }
    const key = buildCourierDownloadMallOrderMatchKey({
      downloadBundleId: manualItems[0]?.downloadBundleId ?? '',
      sourceMallKey: link.sourceMallKey,
      mallOrderNo: link.mallOrderNo,
    });
    if (key) {
      const list = linksByKey.get(key) ?? [];
      list.push(link);
      linksByKey.set(key, list);
    }
  }

  return manualItems.map((item) => {
    const hasMallInfo = Boolean(item.sourceMallKey?.trim() && item.mallOrderNo?.trim());

    let linked: ManualRegistrationShipmentLink | null =
      linksByExcload.get(item.excloadOrderNo) ?? null;

    if (!linked && hasMallInfo) {
      const unique = resolveUniqueWorkItemByMallOrderKey(
        manualItems.map((row) => ({
          id: row.id,
          downloadBundleId: row.downloadBundleId,
          sourceMallKey: row.sourceMallKey,
          mallOrderNo: row.mallOrderNo,
        })),
        {
          downloadBundleId: item.downloadBundleId,
          sourceMallKey: item.sourceMallKey,
          mallOrderNo: item.mallOrderNo,
        },
      );
      if (unique.ok) {
        const key = buildCourierDownloadMallOrderMatchKey({
          downloadBundleId: item.downloadBundleId,
          sourceMallKey: item.sourceMallKey,
          mallOrderNo: item.mallOrderNo,
        });
        const candidates = key ? linksByKey.get(key) ?? [] : [];
        if (candidates.length === 1 && candidates[0]?.trackingNumber?.trim()) {
          linked = candidates[0]!;
        }
      }
    }

    if (!linked && item.mallOrderNo?.trim()) {
      const byOrder = linksByMallOrder.get(item.mallOrderNo.trim()) ?? [];
      if (byOrder.length === 1 && byOrder[0]?.trackingNumber?.trim()) {
        // sourceMallKey 없으면 자동 확정 금지 — 송장만 참고 표시용으로 쓰지 않음
        if (item.sourceMallKey?.trim()) {
          linked = byOrder[0]!;
        }
      }
    }

    let status: ManualRegistrationDisplayStatus;
    if (!hasMallInfo) {
      status = 'NEEDS_MALL_ORDER_INFO';
    } else if (linked?.trackingNumber?.trim()) {
      status = 'READY';
    } else {
      status = 'NEEDS_TRACKING_LINK';
    }

    return {
      workItemId: item.id,
      excloadOrderNo: item.excloadOrderNo,
      inputSource: item.inputSource,
      sourceMallLabel: item.sourceMallLabel?.trim() || item.sourceMallKey?.trim() || '-',
      mallOrderNo: item.mallOrderNo,
      trackingNumber: linked?.trackingNumber?.trim() || null,
      carrierName: linked?.carrierName?.trim() || null,
      status,
      statusLabel: manualRegistrationStatusLabel(status),
    };
  });
}
