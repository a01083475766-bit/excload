/**
 * 전송 성공 Attempt에 대한 쇼핑몰 반영 상태 확인 (B).
 * credential은 서버에서 accountId로만 로드. 클라이언트 재전송 금지.
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
import {
  mapCoupangOrderSheetStatuses,
  mapSmartstoreProductOrderStatuses,
} from '@/app/lib/order-integration/transmission/map-transmission-verify-status';
import type { RecentTransmitVerificationStatus } from '@/app/lib/order-integration/transmission/recent-transmit-result-view';

export type VerifyTransmissionAttemptRecord = {
  id: string;
  userId: string;
  uploadBatchId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  status: ShipmentTransmissionAttemptStatus;
  mallOrderNo: string;
  mallLineItemIdsJson: unknown;
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
  mapped: ReturnType<typeof mapSmartstoreProductOrderStatuses>,
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

  let credentials;
  try {
    credentials = (deps.resolveSmartstoreCredentials ?? toSmartstoreCredentials)(account);
  } catch {
    return failedItem(record.id, '쇼핑몰 연결을 확인하세요.');
  }
  if (!credentials.clientId || !credentials.clientSecret) {
    return failedItem(record.id, '쇼핑몰 연결을 확인하세요.');
  }

  const fetchByIds = deps.fetchSmartstoreByIds ?? fetchSmartstoreProductOrdersByIds;
  try {
    const details = await fetchByIds({ credentials, productOrderIds });
    const byId = new Map<string, (typeof details)[number]>();
    for (const detail of details) {
      const id = detail.productOrder?.productOrderId?.trim();
      if (id) byId.set(id, detail);
    }
    const statuses = productOrderIds.map(
      (id) => byId.get(id)?.productOrder?.productOrderStatus ?? null,
    );
    if (statuses.every((status) => !status)) {
      return failedItem(record.id, '상품주문 상태를 조회하지 못했습니다.');
    }
    return itemFromMapped(record.id, mapSmartstoreProductOrderStatuses({ statuses }));
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

  const fetchByBox = deps.fetchCoupangByBoxId ?? fetchCoupangOrderSheetByShipmentBoxId;
  try {
    const statuses: Array<string | null> = [];
    for (const boxId of boxIds) {
      const sheet = await fetchByBox({
        vendorId: credentials.vendorId,
        accessKey: credentials.accessKey,
        secretKey: credentials.secretKey,
        shipmentBoxId: boxId,
      });
      statuses.push(sheet.status ?? null);
    }
    return itemFromMapped(record.id, mapCoupangOrderSheetStatuses({ statuses }));
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
    if (record.status !== 'SUCCESS') {
      results.push(unsupportedItem(attemptId, '전송 성공 건만 확인할 수 있습니다.'));
      continue;
    }

    if (record.provider !== 'SMARTSTORE' && record.provider !== 'COUPANG') {
      results.push(unsupportedItem(attemptId, '이 쇼핑몰은 상태 확인을 아직 지원하지 않습니다. 상태 확인 지원 예정.'));
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
