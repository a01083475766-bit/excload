import { ORDER_INTEGRATION_MALLS } from '@/app/lib/order-integration/malls';
import type {
  NormalizedShipmentRow,
  OrderSyncOrderSnapshot,
  ShipmentMatchResult,
  ShipmentMatchStatus,
} from '@/app/lib/order-integration/shipments/types';

export type ShipmentMatchTabId =
  | 'all'
  | 'confident'
  | 'warning'
  | 'failed'
  | 'duplicate_error'
  | 'already_shipped'
  | 'cancelled';

export type ShipmentMatchStatusMeta = {
  label: string;
  badgeClass: string;
  tabId: ShipmentMatchTabId;
};

export type ShipmentMatchSummaryCounts = {
  totalRows: number;
  matchedConfidentCount: number;
  matchedWarningCount: number;
  multipleCandidatesCount: number;
  notMatchedCount: number;
  duplicateTrackingNumberCount: number;
  alreadyShippedCount: number;
  cancelledOrInvalidOrderCount: number;
};

export type ShipmentMatchSummaryCard = {
  key: string;
  label: string;
  count: number;
  tabId: ShipmentMatchTabId | null;
};

export type ShipmentMatchDisplayRow = {
  shipmentRowIndex: number;
  matchStatus: ShipmentMatchStatus;
  matchReason: string;
  providerLabel: string | null;
  mallOrderNo: string | null;
  excloadOrderNo: string | null;
  receiverName: string | null;
  receiverPhoneMasked: string | null;
  receiverAddressMasked: string | null;
  productSummary: string | null;
  carrierName: string | null;
  trackingNumberMasked: string | null;
};

const STATUS_META: Record<ShipmentMatchStatus, ShipmentMatchStatusMeta> = {
  MATCHED_CONFIDENT: {
    label: '자동 매칭',
    badgeClass:
      'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
    tabId: 'confident',
  },
  MATCHED_WARNING: {
    label: '확인 필요',
    badgeClass:
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
    tabId: 'warning',
  },
  MULTIPLE_CANDIDATES: {
    label: '다중 후보',
    badgeClass:
      'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100',
    tabId: 'duplicate_error',
  },
  NOT_MATCHED: {
    label: '매칭 실패',
    badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
    tabId: 'failed',
  },
  DUPLICATE_TRACKING_NUMBER: {
    label: '중복 송장',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    tabId: 'duplicate_error',
  },
  ALREADY_SHIPPED: {
    label: '이미 발송',
    badgeClass: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
    tabId: 'already_shipped',
  },
  CANCELLED_OR_INVALID_ORDER: {
    label: '취소/불가',
    badgeClass:
      'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-100',
    tabId: 'cancelled',
  },
};

export const SHIPMENT_MATCH_TABS: ReadonlyArray<{
  id: ShipmentMatchTabId;
  label: string;
}> = [
  { id: 'all', label: '전체' },
  { id: 'confident', label: '자동 매칭' },
  { id: 'warning', label: '확인 필요' },
  { id: 'failed', label: '매칭 실패' },
  { id: 'duplicate_error', label: '중복/오류' },
  { id: 'already_shipped', label: '이미 발송' },
  { id: 'cancelled', label: '취소/불가' },
];

export function maskShipmentPhone(value?: string | null): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 7) return '***-****';

  const headLength = digits.startsWith('02') ? 2 : 3;
  const head = digits.slice(0, headLength);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

export function maskShipmentTrackingNumber(value?: string | null): string | null {
  const compact = String(value ?? '').trim();
  if (!compact) return null;
  // 짧은 값: 원문 전체·연속 원문이 결과에 포함되지 않게
  if (compact.length <= 2) {
    return '****';
  }
  if (compact.length <= 8) {
    return `****${compact.slice(-2)}`;
  }

  const head = compact.slice(0, 4);
  const tail = compact.slice(-4);
  return `${head}****${tail}`;
}

export function maskShipmentAddress(value?: string | null): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const tokens = trimmed
    .replace(/[(),]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;
  if (tokens.length <= 2) {
    return `${tokens.join(' ')} ...`;
  }

  const head = tokens.slice(0, 2).join(' ');
  const tail = tokens[tokens.length - 1];
  return `${head} ... ${tail}`;
}

export function resolveProviderLabel(provider?: string | null): string | null {
  if (!provider?.trim()) return null;

  const normalized = provider.trim().toLowerCase();
  const mall = ORDER_INTEGRATION_MALLS.find((item) => item.id === normalized);
  if (mall?.name) return mall.name;

  // 몰 목록에 없는 enum은 영문 브랜드명만 보기 좋게 표기
  const englishBrandFallback: Record<string, string> = {
    shopify: 'Shopify',
  };
  return englishBrandFallback[normalized] ?? provider.trim();
}

export function getShipmentMatchStatusMeta(status: ShipmentMatchStatus): ShipmentMatchStatusMeta {
  return STATUS_META[status];
}

export function buildShipmentMatchSummaryCards(
  summary: ShipmentMatchSummaryCounts,
): ShipmentMatchSummaryCard[] {
  return [
    { key: 'totalRows', label: '전체 행', count: summary.totalRows, tabId: 'all' },
    {
      key: 'matchedConfidentCount',
      label: '자동 매칭',
      count: summary.matchedConfidentCount,
      tabId: 'confident',
    },
    {
      key: 'matchedWarningCount',
      label: '확인 필요',
      count: summary.matchedWarningCount,
      tabId: 'warning',
    },
    {
      key: 'multipleCandidatesCount',
      label: '다중 후보',
      count: summary.multipleCandidatesCount,
      tabId: 'duplicate_error',
    },
    {
      key: 'notMatchedCount',
      label: '매칭 실패',
      count: summary.notMatchedCount,
      tabId: 'failed',
    },
    {
      key: 'duplicateTrackingNumberCount',
      label: '중복 송장',
      count: summary.duplicateTrackingNumberCount,
      tabId: 'duplicate_error',
    },
    {
      key: 'alreadyShippedCount',
      label: '이미 발송',
      count: summary.alreadyShippedCount,
      tabId: 'already_shipped',
    },
    {
      key: 'cancelledOrInvalidOrderCount',
      label: '취소/불가',
      count: summary.cancelledOrInvalidOrderCount,
      tabId: 'cancelled',
    },
  ];
}

export function filterShipmentMatchDisplayRows(
  rows: ShipmentMatchDisplayRow[],
  tabId: ShipmentMatchTabId,
): ShipmentMatchDisplayRow[] {
  if (tabId === 'all') return rows;

  return rows.filter((row) => {
    const meta = getShipmentMatchStatusMeta(row.matchStatus);
    if (tabId === 'duplicate_error') {
      return meta.tabId === 'duplicate_error';
    }
    return meta.tabId === tabId;
  });
}

export function buildShipmentMatchDisplayRows(input: {
  shipments: NormalizedShipmentRow[];
  orders: OrderSyncOrderSnapshot[];
  matchRows: ShipmentMatchResult[];
}): ShipmentMatchDisplayRow[] {
  const shipmentByIndex = new Map(
    input.shipments.map((shipment) => [shipment.originalRowIndex, shipment]),
  );
  const orderById = new Map(input.orders.map((order) => [order.id, order]));

  return input.matchRows.map((matchRow) => {
    const shipment = shipmentByIndex.get(matchRow.shipmentRowIndex);
    const matchedOrder = matchRow.matchedOrderId
      ? orderById.get(matchRow.matchedOrderId)
      : undefined;

    const provider = matchedOrder?.provider ?? null;
    const mallOrderNo = matchedOrder?.mallOrderNo ?? shipment?.mallOrderNo ?? null;
    const excloadOrderNo = matchedOrder?.excloadOrderNo ?? shipment?.excloadOrderNo ?? null;
    const receiverName = matchedOrder?.receiverName ?? shipment?.receiverName ?? null;
    const receiverPhone = matchedOrder?.receiverPhone ?? shipment?.receiverPhone ?? null;
    const receiverAddress = matchedOrder?.receiverAddress ?? shipment?.receiverAddress ?? null;
    const productSummary = matchedOrder?.productSummary ?? shipment?.productText ?? null;

    return {
      shipmentRowIndex: matchRow.shipmentRowIndex,
      matchStatus: matchRow.matchStatus,
      matchReason: matchRow.matchReason,
      providerLabel: resolveProviderLabel(provider),
      mallOrderNo: mallOrderNo?.trim() || null,
      excloadOrderNo: excloadOrderNo?.trim() || null,
      receiverName: receiverName?.trim() || null,
      receiverPhoneMasked: maskShipmentPhone(receiverPhone),
      receiverAddressMasked: maskShipmentAddress(receiverAddress),
      productSummary: productSummary?.trim() || null,
      carrierName: shipment?.carrierName?.trim() || null,
      trackingNumberMasked: maskShipmentTrackingNumber(shipment?.trackingNumber),
    };
  });
}

export function mapShipmentMatchFetchError(
  status: number,
  body?: { error?: string } | null,
): string {
  const serverMessage = body?.error?.trim();

  if (status === 401) {
    return '로그인이 필요합니다. 다시 로그인한 뒤 시도해주세요.';
  }
  if (status === 413) {
    return '파일이 너무 큽니다. 5MB 이하 파일을 업로드해주세요.';
  }
  if (status === 400) {
    if (serverMessage?.includes('파일')) return serverMessage;
    if (serverMessage?.includes('형식')) return serverMessage;
    return serverMessage ?? '요청을 처리할 수 없습니다. 입력값을 확인해주세요.';
  }
  if (status >= 500) {
    return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }

  return serverMessage ?? '송장파일 매칭 중 문제가 발생했습니다.';
}

export function getEmptyOrderSnapshotMessage(
  loadedCount: number,
  totalRows: number,
  options?: {
    emptyReason?: string | null;
    bundleExpired?: boolean;
  },
): string | null {
  if (loadedCount > 0) return null;

  const reason = options?.emptyReason ?? null;
  if (reason === 'bundle_expired' || options?.bundleExpired) {
    return '선택한 다운로드 내역의 보관기간이 만료되었습니다.';
  }
  if (reason === 'example_preview') {
    return '예시 미리보기 데이터는 송장 매칭에 사용할 수 없습니다.';
  }
  if (reason === 'bundle_no_candidates' || reason === 'bundle_not_found') {
    return '선택한 다운로드에 매칭 가능한 주문 데이터가 저장되지 않았습니다.';
  }
  if (reason === 'bundle_forbidden') {
    return '선택한 다운로드 내역에 접근할 수 없습니다.';
  }

  if (totalRows === 0) {
    return '매칭할 주문 스냅샷이 없습니다. 주문조회 후 택배 업로드 양식을 다운로드해야 송장파일과 매칭할 수 있습니다.';
  }
  return '송장파일은 읽었지만, 비교할 주문 데이터가 없습니다. 주문조회 후 택배양식을 다시 다운로드한 뒤, 해당 다운로드를 선택해 매칭해 주세요.';
}
