import {
  ORDER_INTEGRATION_MALLS,
  type OrderIntegrationMallBadge,
  type OrderIntegrationMallId,
} from '@/app/lib/order-integration/malls';

/**
 * 서버(연동 계정 API)에서 조회한 "실제 저장된" 연결 요약.
 * - Client Secret 등 비밀 정보는 포함하지 않는다.
 * - 연결 여부 판단은 이 서버 데이터(=DB에 유효한 연결 정보 존재)만 근거로 한다.
 */
export type ConnectedMallSummary = {
  mallId: OrderIntegrationMallId;
  name: string;
  accountName: string;
  /** OrderIntegrationAccountStatus 원시값(ACTIVE/INACTIVE/ERROR) */
  status: string;
  /** 마지막 연결 확인 시각(ISO) — 없으면 null */
  lastCheckedAt: string | null;
};

export type MallOverviewAction = 'manage' | 'connect' | 'none';

export type MallOverviewRow = {
  mallId: OrderIntegrationMallId;
  name: string;
  /** DB에 저장된 유효한 연결 정보가 있는지 */
  connected: boolean;
  /** 목록/표에 표시할 상태 라벨 */
  statusLabel: string;
  accountName: string | null;
  lastCheckedAt: string | null;
  action: MallOverviewAction;
  actionLabel: string;
  badge?: OrderIntegrationMallBadge;
  /** 아직 구현되지 않은(준비중) 몰 */
  isPreparing: boolean;
};

function priorityOf(mallId: OrderIntegrationMallId): number {
  return ORDER_INTEGRATION_MALLS.find((m) => m.id === mallId)?.priority ?? 99;
}

/** 저장된 연결 요약 배열을 mallId → 요약 맵으로 변환 */
export function toConnectedMallMap(
  connected: ConnectedMallSummary[],
): Map<OrderIntegrationMallId, ConnectedMallSummary> {
  const map = new Map<OrderIntegrationMallId, ConnectedMallSummary>();
  for (const item of connected) {
    if (!map.has(item.mallId)) {
      map.set(item.mallId, item);
    }
  }
  return map;
}

/** 특정 몰이 (DB 기준) 연결되어 있는지 */
export function isMallConnected(
  mallId: OrderIntegrationMallId,
  connected: ConnectedMallSummary[],
): boolean {
  return connected.some((item) => item.mallId === mallId);
}

/**
 * "전체" 탭에서 보여줄 쇼핑몰별 설정 상태 목록을 만든다.
 * - available 몰: 설정됨/미연결 + 설정 관리/연결하기
 *   (설정됨 = DB에 연동 정보 저장됨. 실제 API 연결 확인은 주문조회 화면)
 * - preparing 몰: 기존 준비/베타 상태 유지, 작업 없음
 */
export function buildMallOverviewRows(
  connected: ConnectedMallSummary[],
): MallOverviewRow[] {
  const connectedMap = toConnectedMallMap(connected);

  const rows: MallOverviewRow[] = ORDER_INTEGRATION_MALLS.map((mall) => {
    if (mall.status === 'preparing') {
      return {
        mallId: mall.id,
        name: mall.name,
        connected: false,
        statusLabel: mall.preparingLabel ?? '준비중',
        accountName: null,
        lastCheckedAt: null,
        action: 'none',
        actionLabel: '',
        badge: mall.badge,
        isPreparing: true,
      };
    }

    const conn = connectedMap.get(mall.id);
    const isConnected = Boolean(conn);
    return {
      mallId: mall.id,
      name: mall.name,
      connected: isConnected,
      statusLabel: isConnected ? '설정됨' : '미연결',
      accountName: conn?.accountName ?? null,
      lastCheckedAt: conn?.lastCheckedAt ?? null,
      action: isConnected ? 'manage' : 'connect',
      actionLabel: isConnected ? '설정 관리' : '연결하기',
      badge: mall.badge,
      isPreparing: false,
    };
  });

  rows.sort((a, b) => priorityOf(a.mallId) - priorityOf(b.mallId));
  return rows;
}
