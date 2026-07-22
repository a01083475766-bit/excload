/**
 * 전송 성공·UNCERTAIN Attempt에 대한 쇼핑몰 반영 상태 확인 (읽기 전용).
 * credential은 서버에서 accountId로만 로드. 클라이언트 재전송·confirm/dispatch 금지.
 */

import type {
  OrderIntegrationAccount,
  OrderIntegrationProvider,
  ShipmentTransmissionAttemptStatus,
} from '@prisma/client';

import { fetchCoupangOrderSheetByShipmentBoxId } from '@/app/lib/coupang/client';
import { toUserFacingCoupangErrorMessage } from '@/app/lib/coupang/errors';
import {
  toCoupangCredentials,
  type CoupangCredentials,
} from '@/app/lib/order-integration/coupang-account';
import { toSmartstoreCredentials } from '@/app/lib/order-integration/smartstore-account';
import {
  fetchSmartstoreProductOrdersByIds,
  type SmartstoreCredentials,
  toUserFacingSmartstoreErrorMessage,
} from '@/app/lib/smartstore/client';
import { resolveSmartstoreDeliveryCompanyCode } from '@/app/lib/smartstore/smartstore-invoice';
import { parseSmartstoreItemResultsFromSummary } from '@/app/lib/smartstore/smartstore-batch-dispatch';
import {
  mapCoupangOrderSheetStatuses,
} from '@/app/lib/order-integration/transmission/map-transmission-verify-status';
import type { RecentTransmitVerificationStatus } from '@/app/lib/order-integration/transmission/recent-transmit-result-view';
import type { ShipmentTransmissionItemResultSummary } from '@/app/lib/order-integration/transmission/types';
import {
  buildFallbackVerifyItemsFromProductOrderIds,
  isSmartstoreVerifiableAttemptStatus,
  mergeSmartstoreVerifyItemResults,
  summarizeSmartstoreVerifyDecisions,
} from '@/app/lib/order-integration/transmission/smartstore-verify-reconcile';

export type VerifyTransmissionAttemptRecord = {
  id: string;
  userId: string;
  uploadBatchId: string;
  shipmentMatchId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  status: ShipmentTransmissionAttemptStatus;
  mallOrderNo: string;
  mallLineItemIdsJson: unknown;
  trackingNumberNormalized?: string | null;
  courierCode?: string | null;
  courierName?: string | null;
  dispatchedAt?: Date | string | null;
  responseSummaryJson?: unknown;
  orderSyncOrder: {
    mallLineItemIds: unknown;
    normalizedPayloadJson: unknown;
  } | null;
};

export type VerifyTransmissionResultItem = {
  attemptId: string;
  status: RecentTransmitVerificationStatus;
  mallStatusCode: string | null;
  mallStatusLabel: string | null;
  confirmedItems: number | null;
  totalItems: number | null;
  message: string;
};

export type VerifyTransmissionResponseBody = {
  checkedAt: string;
  summary: {
    requested: number;
    confirmed: number;
    pending: number;
    attention: number;
    failed: number;
    unsupported: number;
    partial: number;
  };
  results: VerifyTransmissionResultItem[];
};

export type VerifyTransmissionServiceFailure = {
  ok: false;
  status: 400 | 403 | 404;
  reasonCode: string;
  safeMessage: string;
};

export type VerifyTransmissionServiceSuccess = {
  ok: true;
  body: VerifyTransmissionResponseBody;
};

export type PersistSmartstoreVerificationInput = {
  userId: string;
  attemptId: string;
  shipmentMatchId: string;
  itemResults: ShipmentTransmissionItemResultSummary[];
  allConfirmed: boolean;
  hasUncertain: boolean;
  now: Date;
};

export type VerifyTransmissionServiceDeps = {
  findAttempts: (input: {
    userId: string;
    batchId: string;
    attemptIds: string[];
  }) => Promise<VerifyTransmissionAttemptRecord[]>;
  loadAccount: (input: {
    userId: string;
    accountId: string;
    provider: OrderIntegrationProvider;
  }) => Promise<OrderIntegrationAccount | null>;
  resolveSmartstoreCredentials?: (account: OrderIntegrationAccount) => SmartstoreCredentials;
  resolveCoupangCredentials?: (account: OrderIntegrationAccount) => CoupangCredentials;
  fetchSmartstoreByIds?: typeof fetchSmartstoreProductOrdersByIds;
  fetchCoupangByBoxId?: typeof fetchCoupangOrderSheetByShipmentBoxId;
  /** SMARTSTORE 부분 결과 보존·Match SENT 정리 (선택) */
  persistSmartstoreVerification?: (
    input: PersistSmartstoreVerificationInput,
  ) => Promise<void>;
  now?: () => Date;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
    .filter(Boolean);
}

export function extractSmartstoreProductOrderIds(record: VerifyTransmissionAttemptRecord): string[] {
  const fromAttempt = asStringArray(record.mallLineItemIdsJson).filter(
    (id) => !id.startsWith('bundle:'),
  );
  if (fromAttempt.length > 0) return [...new Set(fromAttempt)];

  const fromOrder = asStringArray(record.orderSyncOrder?.mallLineItemIds).filter(
    (id) => !id.startsWith('bundle:'),
  );
  return [...new Set(fromOrder)];
}

export function extractCoupangShipmentBoxIds(record: VerifyTransmissionAttemptRecord): string[] {
  const payload = record.orderSyncOrder?.normalizedPayloadJson;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const fromPayload = asStringArray((payload as { shipmentBoxIds?: unknown }).shipmentBoxIds);
    if (fromPayload.length > 0) return [...new Set(fromPayload)];
  }

  const fromAttempt = asStringArray(record.mallLineItemIdsJson)
    .filter((id) => id.startsWith('bundle:'))
    .map((id) => id.slice('bundle:'.length).trim())
    .filter(Boolean);
  if (fromAttempt.length > 0) return [...new Set(fromAttempt)];

  const fromOrder = asStringArray(record.orderSyncOrder?.mallLineItemIds)
    .filter((id) => id.startsWith('bundle:'))
    .map((id) => id.slice('bundle:'.length).trim())
    .filter(Boolean);
  return [...new Set(fromOrder)];
}

function itemFromMapped(
  attemptId: string,
  mapped: ReturnType<typeof mapCoupangOrderSheetStatuses>,
): VerifyTransmissionResultItem {
  return {
    attemptId,
    status: mapped.status,
    mallStatusCode: mapped.mallStatusCode,
    mallStatusLabel: mapped.mallStatusLabel,
    confirmedItems: mapped.confirmedItems,
    totalItems: mapped.totalItems,
    message: mapped.message,
  };
}

function unsupportedItem(attemptId: string, message: string): VerifyTransmissionResultItem {
  return {
    attemptId,
    status: 'UNSUPPORTED',
    mallStatusCode: null,
    mallStatusLabel: null,
    confirmedItems: null,
    totalItems: null,
    message,
  };
}

function failedItem(attemptId: string, message: string): VerifyTransmissionResultItem {
  return {
    attemptId,
    status: 'CHECK_FAILED',
    mallStatusCode: null,
    mallStatusLabel: null,
    confirmedItems: null,
    totalItems: null,
    message,
  };
}

function summarize(results: VerifyTransmissionResultItem[]): VerifyTransmissionResponseBody['summary'] {
  const summary = {
    requested: results.length,
    confirmed: 0,
    pending: 0,
    attention: 0,
    failed: 0,
    unsupported: 0,
    partial: 0,
  };
  for (const row of results) {
    if (row.status === 'CONFIRMED') summary.confirmed += 1;
    else if (row.status === 'PENDING') summary.pending += 1;
    else if (row.status === 'ATTENTION') summary.attention += 1;
    else if (row.status === 'CHECK_FAILED') summary.failed += 1;
    else if (row.status === 'UNSUPPORTED') summary.unsupported += 1;
    else if (row.status === 'PARTIAL') summary.partial += 1;
  }
  return summary;
}

async function verifySmartstoreAttempt(
  deps: VerifyTransmissionServiceDeps,
  record: VerifyTransmissionAttemptRecord,
  account: OrderIntegrationAccount,
): Promise<VerifyTransmissionResultItem> {
  const productOrderIds = extractSmartstoreProductOrderIds(record);
  if (!productOrderIds.length) {
    return failedItem(record.id, '확인에 필요한 상품주문번호가 없습니다.');
  }

  const accountId = record.integrationAccountId?.trim() ?? '';
  if (!accountId) {
    return failedItem(record.id, '연결 계정이 없어 확인할 수 없습니다.');
  }

  let credentials;
  try {
    credentials = (deps.resolveSmartstoreCredentials ?? toSmartstoreCredentials)(account);
  } catch {
    return failedItem(record.id, '쇼핑몰 연결을 확인하세요.');
  }
  if (!credentials.clientId || !credentials.clientSecret) {
    return failedItem(record.id, '쇼핑몰 연결을 확인하세요.');
  }

  const priorFromSummary = parseSmartstoreItemResultsFromSummary(record.responseSummaryJson);
  let priorItems = priorFromSummary.filter((row) =>
    productOrderIds.includes(row.productOrderId),
  );
  if (priorItems.length === 0) {
    const courier = resolveSmartstoreDeliveryCompanyCode({
      courierCode: record.courierCode ?? null,
      courierName: record.courierName ?? null,
    });
    if (!courier.ok) {
      return failedItem(record.id, '네이버 응답에서 송장정보를 확인할 수 없습니다.');
    }
    const tracking = String(record.trackingNumberNormalized ?? '').trim();
    if (!tracking) {
      return failedItem(record.id, '네이버 응답에서 송장정보를 확인할 수 없습니다.');
    }
    priorItems = buildFallbackVerifyItemsFromProductOrderIds({
      userId: record.userId,
      integrationAccountId: accountId,
      productOrderIds,
      deliveryCompanyCode: courier.deliveryCompanyCode,
      trackingNumber: tracking,
    });
  }

  const fetchByIds = deps.fetchSmartstoreByIds ?? fetchSmartstoreProductOrdersByIds;
  try {
    const details = await fetchByIds({ credentials, productOrderIds });
    const byId = new Map<string, (typeof details)[number]>();
    for (const detail of details) {
      const id = detail.productOrder?.productOrderId?.trim();
      if (id) byId.set(id, detail);
    }

    const { itemResults, decisions } = mergeSmartstoreVerifyItemResults({
      userId: record.userId,
      integrationAccountId: accountId,
      priorItems,
      detailsByProductOrderId: byId,
    });
    const summarized = summarizeSmartstoreVerifyDecisions({ itemResults, decisions });

    if (deps.persistSmartstoreVerification) {
      await deps.persistSmartstoreVerification({
        userId: record.userId,
        attemptId: record.id,
        shipmentMatchId: record.shipmentMatchId,
        itemResults,
        allConfirmed: summarized.allConfirmed,
        hasUncertain: summarized.hasUncertain || summarized.hasConflict,
        now: deps.now?.() ?? new Date(),
      });
    }

    return {
      attemptId: record.id,
      status: summarized.status,
      mallStatusCode: summarized.mallStatusCode,
      mallStatusLabel: summarized.mallStatusCode,
      confirmedItems: summarized.confirmedItems,
      totalItems: summarized.totalItems,
      message: summarized.message,
    };
  } catch (error) {
    return failedItem(record.id, toUserFacingSmartstoreErrorMessage(error));
  }
}

async function verifyCoupangAttempt(
  deps: VerifyTransmissionServiceDeps,
  record: VerifyTransmissionAttemptRecord,
  account: OrderIntegrationAccount,
): Promise<VerifyTransmissionResultItem> {
  const boxIds = extractCoupangShipmentBoxIds(record);
  if (!boxIds.length) {
    return failedItem(record.id, '확인에 필요한 배송번호(shipmentBoxId)가 없습니다.');
  }

  let credentials;
  try {
    credentials = (deps.resolveCoupangCredentials ?? toCoupangCredentials)(account);
  } catch {
    return failedItem(record.id, '쇼핑몰 연결을 확인하세요.');
  }

  const requestedInvoice = String(record.trackingNumberNormalized ?? '').trim();
  const fetchByBox = deps.fetchCoupangByBoxId ?? fetchCoupangOrderSheetByShipmentBoxId;
  try {
    const statuses: Array<string | null> = [];
    const invoices: string[] = [];
    for (const boxId of boxIds) {
      const sheet = await fetchByBox({
        vendorId: credentials.vendorId,
        accessKey: credentials.accessKey,
        secretKey: credentials.secretKey,
        shipmentBoxId: boxId,
      });
      statuses.push(sheet.status ?? null);
      invoices.push(String(sheet.invoiceNumber ?? '').trim());
    }

    const mapped = mapCoupangOrderSheetStatuses({ statuses });
    if (mapped.status === 'CONFIRMED' && requestedInvoice) {
      const allMatch = invoices.every((invoice) => invoice === requestedInvoice);
      const anyMissing = invoices.some((invoice) => !invoice);
      if (anyMissing) {
        return {
          attemptId: record.id,
          status: 'PENDING',
          mallStatusCode: mapped.mallStatusCode,
          mallStatusLabel: mapped.mallStatusLabel,
          confirmedItems: mapped.confirmedItems,
          totalItems: mapped.totalItems,
          message: '주문 상태는 확인됐으나 송장번호를 아직 확인하지 못했습니다.',
        };
      }
      if (!allMatch) {
        return {
          attemptId: record.id,
          status: 'ATTENTION',
          mallStatusCode: mapped.mallStatusCode,
          mallStatusLabel: mapped.mallStatusLabel,
          confirmedItems: mapped.confirmedItems,
          totalItems: mapped.totalItems,
          message: '주문 상태는 확인됐으나 송장번호가 전송값과 일치하지 않습니다.',
        };
      }
    }

    return itemFromMapped(record.id, mapped);
  } catch (error) {
    return failedItem(record.id, toUserFacingCoupangErrorMessage(error));
  }
}

export async function runVerifyTransmissionService(
  deps: VerifyTransmissionServiceDeps,
  input: { userId: string; batchId: string; attemptIds: string[] },
): Promise<VerifyTransmissionServiceFailure | VerifyTransmissionServiceSuccess> {
  const found = await deps.findAttempts({
    userId: input.userId,
    batchId: input.batchId,
    attemptIds: input.attemptIds,
  });
  const byId = new Map(found.map((row) => [row.id, row]));

  const results: VerifyTransmissionResultItem[] = [];
  const accountCache = new Map<string, OrderIntegrationAccount | null>();

  for (const attemptId of input.attemptIds) {
    const record = byId.get(attemptId);
    if (!record) {
      results.push(failedItem(attemptId, '전송 기록을 찾을 수 없습니다.'));
      continue;
    }

    if (record.provider === 'COUPANG') {
      if (record.status !== 'SUCCESS') {
        results.push(unsupportedItem(attemptId, '전송 성공 건만 확인할 수 있습니다.'));
        continue;
      }
    } else if (record.provider === 'SMARTSTORE') {
      if (
        !isSmartstoreVerifiableAttemptStatus({
          status: record.status,
          dispatchedAt: record.dispatchedAt,
        })
      ) {
        results.push(
          unsupportedItem(
            attemptId,
            '외부 전송이 확인된 성공·불확실(UNCERTAIN) 건만 확인할 수 있습니다.',
          ),
        );
        continue;
      }
    } else {
      results.push(
        unsupportedItem(attemptId, '이 쇼핑몰은 상태 확인을 아직 지원하지 않습니다. 상태 확인 지원 예정.'),
      );
      continue;
    }

    if (!record.integrationAccountId?.trim()) {
      results.push(failedItem(attemptId, '연결 계정이 없어 확인할 수 없습니다.'));
      continue;
    }

    const cacheKey = `${record.provider}:${record.integrationAccountId}`;
    let account = accountCache.get(cacheKey);
    if (account === undefined) {
      account = await deps.loadAccount({
        userId: input.userId,
        accountId: record.integrationAccountId,
        provider: record.provider,
      });
      accountCache.set(cacheKey, account);
    }
    if (!account) {
      results.push(failedItem(attemptId, '쇼핑몰 연결을 확인하세요.'));
      continue;
    }

    if (record.provider === 'SMARTSTORE') {
      results.push(await verifySmartstoreAttempt(deps, record, account));
    } else {
      results.push(await verifyCoupangAttempt(deps, record, account));
    }
  }

  const now = deps.now?.() ?? new Date();
  return {
    ok: true,
    body: {
      checkedAt: now.toISOString(),
      summary: summarize(results),
      results,
    },
  };
}
