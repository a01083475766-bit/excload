/**
 * 전송 API 응답 → 「방금 전송 결과」 UI 정규화 (클라이언트·단위 테스트용, DB 없음).
 */

import type { MockTransmitMatchResult } from '@/app/lib/order-integration/transmission/mock-transmit-service';
import { resolveProviderLabel } from '@/app/lib/order-integration/shipments/shipment-match-ui';

export type RecentTransmitOutcome = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type RecentTransmitVerificationStatus =
  | 'CONFIRMED'
  | 'PENDING'
  | 'ATTENTION'
  | 'PARTIAL'
  | 'CHECK_FAILED'
  | 'UNSUPPORTED'
  | 'NOT_APPLICABLE';

export type RecentTransmitResultRow = {
  attemptId: string | null;
  matchId: string;
  provider: string | null;
  providerLabel: string;
  mallOrderNo: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  outcome: RecentTransmitOutcome;
  resultCode: string | null;
  message: string;
  retryable: boolean;
  verificationStatus: RecentTransmitVerificationStatus | null;
  verificationMessage: string | null;
  confirmedItems: number | null;
  totalItems: number | null;
};

export type RecentTransmitResultView = {
  batchId: string;
  completedAt: string;
  summary: {
    requested: number;
    success: number;
    failed: number;
    skipped: number;
  };
  results: RecentTransmitResultRow[];
};

export type RecentTransmitDisplayLookup = {
  matchId: string | null;
  providerLabel?: string | null;
  mallOrderNo?: string | null;
  carrierName?: string | null;
  trackingNumberValue?: string | null;
  /** raw provider enum if known (표시용 라벨 보강) */
  provider?: string | null;
};

type TransmitApiBodyLike = {
  batchId?: unknown;
  summary?: {
    requestedCount?: unknown;
    successCount?: unknown;
    failureCount?: unknown;
    skippedCount?: unknown;
  };
  results?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isMockTransmitMatchResult(value: unknown): value is MockTransmitMatchResult {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.matchId === 'string' && typeof row.attempted === 'boolean' && typeof row.success === 'boolean';
}

export function isShipmentTransmitApiBody(value: unknown): value is TransmitApiBodyLike & {
  results: MockTransmitMatchResult[];
} {
  if (!value || typeof value !== 'object') return false;
  const body = value as TransmitApiBodyLike;
  if (!Array.isArray(body.results)) return false;
  if (body.results.length === 0) return true;
  return body.results.every(isMockTransmitMatchResult);
}

function resolveOutcome(row: MockTransmitMatchResult): RecentTransmitOutcome {
  if (!row.attempted) return 'SKIPPED';
  return row.success ? 'SUCCESS' : 'FAILED';
}

function resolveMessage(row: MockTransmitMatchResult, outcome: RecentTransmitOutcome): string {
  if (outcome === 'SUCCESS') {
    if (row.errorCode === 'ALREADY_DISPATCHED') {
      return asString(row.errorMessage) ?? '이미 동일 송장정보로 발송 처리된 주문입니다.';
    }
    return '전송 완료';
  }

  const code = asString(row.errorCode);
  const raw = asString(row.errorMessage);
  switch (code) {
    case 'ORDER_CONFIRMATION_REQUIRED':
      return (
        raw ??
        '발주확인이 필요합니다. 주문조회 화면에서 발주확인을 먼저 진행한 뒤 송장을 전송해 주세요.'
      );
    case 'STATE_NOT_ELIGIBLE':
    case 'ORDER_STATE_NOT_ELIGIBLE':
      return raw ?? '주문 상태상 송장 전송이 불가합니다.';
    case 'QUANTITY_UNCLEAR':
      return raw ?? '수량을 확인할 수 없어 전송하지 않았습니다.';
    case 'ACCOUNT_SELECTION_REQUIRED':
      return raw ?? '계정을 정확히 선택할 수 없어 처리하지 않았습니다.';
    case 'CARRIER_MAPPING_REQUIRED':
    case 'COURIER_UNSUPPORTED':
      return raw ?? '택배사 확인이 필요합니다. 스마트스토어에서 지원하는 택배사로 연결해 주세요.';
    case 'CONFLICT':
    case 'SHIPMENT_CONFLICT':
    case 'PRIOR_SHIPMENT_CONFLICT':
      return raw ?? '송장 연결 충돌이 있어 전송하지 않았습니다.';
    case 'ALREADY_DISPATCHED':
      return raw ?? '이미 동일 송장정보로 발송 처리된 주문입니다.';
    case 'NOT_ATTEMPTED':
      return raw ?? '아직 전송하지 않았습니다. 이전 묶음 오류로 요청하지 않았습니다.';
    case 'UNCERTAIN':
      return (
        raw ??
        '전송 여부를 확인하지 못했습니다. 자동으로 다시 전송하지 않습니다.'
      );
    case 'ACCOUNT_NOT_ACTIVE':
      return (
        raw ??
        '연동 계정이 비활성(또는 오류) 상태입니다. 계정을 활성화한 뒤 다시 전송해 주세요.'
      );
    default:
      break;
  }

  if (raw) return raw;
  return outcome === 'SKIPPED' ? '전송 제외' : '처리 실패';
}

export function outcomeLabel(outcome: RecentTransmitOutcome): string {
  if (outcome === 'SUCCESS') return '전송 완료';
  if (outcome === 'FAILED') return '처리 실패';
  return '전송 제외';
}

function formatCarrierTracking(carrierName: string | null, trackingNumber: string | null): string {
  if (carrierName && trackingNumber) return `${carrierName} / ${trackingNumber}`;
  if (carrierName) return carrierName;
  if (trackingNumber) return trackingNumber;
  return '-';
}

export function formatRecentTransmitCarrierCell(row: RecentTransmitResultRow): string {
  return formatCarrierTracking(row.carrierName, row.trackingNumber);
}

export function buildRecentTransmitGuidance(summary: RecentTransmitResultView['summary']): string {
  if (summary.requested <= 0) {
    return '전송 대상이 없습니다.';
  }
  if (summary.failed === 0 && summary.skipped === 0 && summary.success > 0) {
    return `${summary.success}건의 송장정보를 쇼핑몰 API로 전송했습니다.`;
  }
  if (summary.success > 0 && summary.failed > 0) {
    return `${summary.success}건은 전송됐고 ${summary.failed}건은 실패했습니다. 실패 사유를 확인한 뒤 실패 건만 다시 전송해 주세요.`;
  }
  if (summary.success === 0 && summary.failed > 0) {
    return `${summary.failed}건 전송에 실패했습니다. 사유를 확인한 뒤 다시 시도해 주세요.`;
  }
  if (summary.success === 0 && summary.failed === 0 && summary.skipped > 0) {
    return `${summary.skipped}건이 전송 제외되었습니다.`;
  }
  return '전송 처리를 완료했습니다.';
}

export const RECENT_TRANSMIT_COMMON_HINT =
  '전송 성공은 쇼핑몰 API가 요청을 정상 접수했다는 뜻입니다. 쇼핑몰 화면의 상태 반영에는 시간이 걸릴 수 있습니다.';

/** B(상태 다시 확인) 1차 지원 몰 */
export function isTransmissionVerifySupportedProvider(provider?: string | null): boolean {
  const normalized = String(provider ?? '')
    .trim()
    .toUpperCase();
  return normalized === 'COUPANG' || normalized === 'SMARTSTORE';
}

export function resolveInitialVerificationStatus(input: {
  outcome: RecentTransmitOutcome;
  provider?: string | null;
  resultCode?: string | null;
}): RecentTransmitVerificationStatus | null {
  if (!isTransmissionVerifySupportedProvider(input.provider)) {
    if (input.outcome === 'SUCCESS') return 'UNSUPPORTED';
    return 'NOT_APPLICABLE';
  }
  if (input.outcome === 'SUCCESS') return null;
  const code = String(input.resultCode ?? '')
    .trim()
    .toUpperCase();
  // 외부 POST 이후 불확실 — 읽기 전용 재확인 대상
  if (
    input.outcome === 'FAILED' &&
    (code === 'UNCERTAIN' || code === 'PARTIAL_ERROR' || code === 'PROVIDER_STATUS_UNKNOWN')
  ) {
    return null;
  }
  return 'NOT_APPLICABLE';
}

export function isRecentTransmitRowVerifiable(row: {
  outcome: RecentTransmitOutcome;
  attemptId: string | null;
  provider: string | null;
  resultCode: string | null;
}): boolean {
  if (!row.attemptId) return false;
  if (!isTransmissionVerifySupportedProvider(row.provider)) return false;
  if (row.outcome === 'SUCCESS') return true;
  const code = String(row.resultCode ?? '')
    .trim()
    .toUpperCase();
  return (
    row.outcome === 'FAILED' &&
    (code === 'UNCERTAIN' || code === 'PARTIAL_ERROR' || code === 'PROVIDER_STATUS_UNKNOWN')
  );
}

export function verificationStatusLabel(
  status: RecentTransmitVerificationStatus | null,
  partial?: { confirmedItems: number | null; totalItems: number | null },
): string {
  if (status === 'NOT_APPLICABLE') return '확인 대상 아님';
  if (!status) return '-';
  if (status === 'CONFIRMED') return '반영 확인';
  if (status === 'PENDING') return '반영 대기';
  if (status === 'ATTENTION') return '확인 필요';
  if (status === 'CHECK_FAILED') return '조회 실패';
  if (status === 'UNSUPPORTED') return '상태 확인 지원 예정';
  if (status === 'PARTIAL') {
    const confirmed = partial?.confirmedItems;
    const total = partial?.totalItems;
    if (typeof confirmed === 'number' && typeof total === 'number' && total > 0) {
      return `일부 확인 ${confirmed}/${total}`;
    }
    return '일부 확인';
  }
  return '-';
}

/**
 * mock/real 전송 응답 + 매칭 표 lookup → 방금 전송 결과 뷰.
 * dry-run 응답은 isShipmentTransmitApiBody가 false라 호출하지 않는다.
 */
export function buildRecentTransmitResultView(input: {
  body: unknown;
  completedAt?: string;
  displayRows?: ReadonlyArray<RecentTransmitDisplayLookup>;
}): RecentTransmitResultView | null {
  if (!isShipmentTransmitApiBody(input.body)) return null;

  const body = input.body;
  const byMatchId = new Map<string, RecentTransmitDisplayLookup>();
  for (const row of input.displayRows ?? []) {
    const id = asString(row.matchId);
    if (id) byMatchId.set(id, row);
  }

  const results: RecentTransmitResultRow[] = body.results.map((row) => {
    const lookup = byMatchId.get(row.matchId);
    const outcome = resolveOutcome(row);
    const providerRaw = asString(lookup?.provider) ?? asString(lookup?.providerLabel);
    const providerLabel =
      resolveProviderLabel(providerRaw) ??
      asString(lookup?.providerLabel) ??
      (providerRaw || '-');

    return {
      attemptId: asString(row.attemptId),
      matchId: row.matchId,
      provider: providerRaw,
      providerLabel,
      mallOrderNo: asString(lookup?.mallOrderNo),
      carrierName: asString(lookup?.carrierName),
      trackingNumber: asString(lookup?.trackingNumberValue),
      outcome,
      resultCode: asString(row.errorCode),
      message: resolveMessage(row, outcome),
      retryable: row.retryable === true,
      verificationStatus: resolveInitialVerificationStatus({
        outcome,
        provider: providerRaw,
        resultCode: asString(row.errorCode),
      }),
      verificationMessage: null,
      confirmedItems: null,
      totalItems: null,
    };
  });

  const summaryFromBody = body.summary;
  const success = results.filter((r) => r.outcome === 'SUCCESS').length;
  const failed = results.filter((r) => r.outcome === 'FAILED').length;
  const skipped = results.filter((r) => r.outcome === 'SKIPPED').length;

  return {
    batchId: asString(body.batchId) ?? '',
    completedAt: input.completedAt ?? new Date().toISOString(),
    summary: {
      requested: asNumber(summaryFromBody?.requestedCount, results.length),
      success: asNumber(summaryFromBody?.successCount, success),
      failed: asNumber(summaryFromBody?.failureCount, failed),
      skipped: asNumber(summaryFromBody?.skippedCount, skipped),
    },
    results,
  };
}

export function filterRecentTransmitResults(
  rows: ReadonlyArray<RecentTransmitResultRow>,
  filter: 'all' | 'failed',
): RecentTransmitResultRow[] {
  if (filter === 'failed') {
    return rows.filter((row) => row.outcome === 'FAILED');
  }
  return [...rows];
}

export function collectVerifiableAttemptIds(rows: ReadonlyArray<RecentTransmitResultRow>): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (!isRecentTransmitRowVerifiable(row)) continue;
    ids.push(row.attemptId!);
  }
  return ids;
}

export function mergeVerificationIntoRecentTransmitView(
  view: RecentTransmitResultView,
  verification: {
    results: Array<{
      attemptId: string;
      status: RecentTransmitVerificationStatus;
      message: string;
      confirmedItems?: number | null;
      totalItems?: number | null;
    }>;
  },
): RecentTransmitResultView {
  const byAttempt = new Map(verification.results.map((row) => [row.attemptId, row]));
  return {
    ...view,
    results: view.results.map((row) => {
      if (!row.attemptId || !isRecentTransmitRowVerifiable(row)) {
        return {
          ...row,
          verificationStatus: row.verificationStatus ?? 'NOT_APPLICABLE',
        };
      }
      const verified = byAttempt.get(row.attemptId);
      if (!verified) return row;
      return {
        ...row,
        verificationStatus: verified.status,
        verificationMessage: verified.message,
        confirmedItems: verified.confirmedItems ?? null,
        totalItems: verified.totalItems ?? null,
      };
    }),
  };
}
