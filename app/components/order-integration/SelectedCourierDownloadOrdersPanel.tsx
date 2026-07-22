'use client';

import { Loader2 } from 'lucide-react';

import {
  formatCourierDownloadOrdersHiddenCountLabel,
  sliceCourierDownloadOrdersForDisplay,
} from '@/app/lib/order-integration/courier-download/courier-download-bundle-orders-view';
import {
  shouldShowExcloadOrderNoHelper,
  type CourierDownloadBundleOrderRow,
} from '@/app/lib/order-integration/courier-download/list-courier-download-bundle-orders';

export type SelectedCourierDownloadOrdersStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'expired'
  | 'error';

type SelectedCourierDownloadOrdersPanelProps = {
  status: SelectedCourierDownloadOrdersStatus;
  orders: CourierDownloadBundleOrderRow[];
  expanded: boolean;
  onToggleExpanded: () => void;
};

export function SelectedCourierDownloadOrdersPanel({
  status,
  orders,
  expanded,
  onToggleExpanded,
}: SelectedCourierDownloadOrdersPanelProps) {
  if (status === 'loading') {
    return (
      <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          선택한 다운로드 주문을 불러오는 중…
        </span>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
        이 다운로드의 주문 정보는 보관 기간이 지나 확인할 수 없습니다. 다른 다운로드를 선택해 주세요.
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
        주문 목록을 불러오지 못했습니다. 다시 시도해 주세요.
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
        <p className="font-medium text-zinc-700 dark:text-zinc-200">선택한 다운로드 주문 · 총 0건</p>
        <p className="mt-1">확인할 수 있는 주문 정보가 없습니다.</p>
      </div>
    );
  }

  const slice = sliceCourierDownloadOrdersForDisplay(orders, expanded);

  return (
    <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900/40">
      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
        선택한 다운로드 주문 · 총 {orders.length}건
      </p>
      <div className="mt-1.5 overflow-x-auto">
        <table className="min-w-full text-left text-xs text-zinc-700 dark:text-zinc-200">
          <thead>
            <tr className="border-b border-zinc-200 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="whitespace-nowrap py-1 pr-3 font-medium">쇼핑몰</th>
              <th className="py-1 pr-3 font-medium">주문번호</th>
              <th className="whitespace-nowrap py-1 font-medium">구분</th>
            </tr>
          </thead>
          <tbody>
            {slice.visible.map((order) => (
              <tr key={order.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td className="whitespace-nowrap py-1 pr-3 align-top">{order.mallLabel}</td>
                <td className="max-w-[14rem] break-all py-1 pr-3 align-top sm:max-w-none">
                  {order.mallOrderNo ?? '-'}
                  {shouldShowExcloadOrderNoHelper(order.mallOrderNo, order.excloadOrderNo) ? (
                    <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                      엑클로드 {order.excloadOrderNo}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap py-1 align-top">{order.sourceTypeLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {slice.canToggleExpand ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {!expanded && slice.hiddenCount > 0 ? (
            <span>{formatCourierDownloadOrdersHiddenCountLabel(slice.hiddenCount)}</span>
          ) : null}
          <button
            type="button"
            onClick={onToggleExpanded}
            className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {expanded ? '접기' : '전체 보기'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
