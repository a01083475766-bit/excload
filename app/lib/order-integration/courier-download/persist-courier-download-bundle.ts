/**
 * CourierDownloadBundle / WorkItem — 택배양식 다운로드 최소 명세.
 * PII 평문·원본 JSON 저장 금지. 비교용 HMAC만 저장.
 */

import type { CourierDownloadWorkItemSource, PrismaClient } from '@prisma/client';

import {
  buildMatchFingerprintHmac,
  type MatchFingerprintMaterial,
} from '@/app/lib/order-integration/courier-download/match-fingerprint';
import { orderIntegrationProviderForMallId } from '@/app/lib/order-integration/mall-provider';
import { computeOrderSyncSnapshotExpiresAt } from '@/app/lib/order-integration/snapshots/order-sync-snapshot-retention';
import { reserveExcloadOrderNos } from '@/app/lib/order-integration/snapshots/reserve-excload-order-nos';
import type { OrderSyncPersistTransactionClient } from '@/app/lib/order-integration/snapshots/types';

export type CourierDownloadWorkItemInputSource = 'API' | 'EXCEL' | 'TEXT';

export type CourierDownloadWorkItemDraft = {
  inputSource: CourierDownloadWorkItemInputSource;
  sourceMallKey?: string | null;
  sourceMallLabel?: string | null;
  mallOrderNo?: string | null;
  /** API 행: persist 후 조회된 OrderSyncOrder.id */
  orderSyncOrderId?: string | null;
  /**
   * 서버에서 HMAC만 저장하고 평문은 폐기.
   * 클라이언트→서버 전송 시에만 사용.
   */
  matchMaterial?: MatchFingerprintMaterial | null;
};

export type PersistCourierDownloadBundleInput = {
  userId: string;
  courierTemplateLabel?: string | null;
  items: ReadonlyArray<CourierDownloadWorkItemDraft>;
  now?: Date;
};

export type PersistCourierDownloadBundleResult = {
  bundleId: string;
  expiresAt: string;
  rowCount: number;
  apiCount: number;
  manualCount: number;
};

export type CourierDownloadBundleListItem = {
  id: string;
  createdAt: string;
  expiresAt: string;
  rowCount: number;
  apiCount: number;
  manualCount: number;
  courierTemplateLabel: string | null;
  label: string;
};

/** PrismaClient·테스트 mock 공용 (method 문법으로 Prisma delegate 호환) */
export type BundlePersistClient = Pick<PrismaClient, '$transaction'> & {
  courierDownloadBundle: {
    create(args: {
      data: Record<string, unknown>;
    }): Promise<{ id: string; expiresAt: Date; rowCount: number; apiCount: number; manualCount: number }>;
  };
  orderSyncOrder: {
    findMany(args: {
      where?: Record<string, unknown>;
      select?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }): Promise<
      Array<{ id: string; mallOrderNo: string; provider: string; integrationAccountId: string | null }>
    >;
  };
};

export type CourierDownloadBundleListClient = {
  courierDownloadBundle: {
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      take?: number;
      select?: Record<string, unknown>;
    }): Promise<
      Array<{
        id: string;
        createdAt: Date;
        expiresAt: Date;
        rowCount: number;
        apiCount: number;
        manualCount: number;
        courierTemplateLabel: string | null;
      }>
    >;
  };
};

export type CourierDownloadBundlePurgeClient = {
  courierDownloadBundle: {
    deleteMany(args: { where?: Record<string, unknown> }): Promise<{ count: number }>;
  };
};

function asTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function countBundleSourceStats(
  items: ReadonlyArray<{ inputSource: CourierDownloadWorkItemInputSource }>,
): { rowCount: number; apiCount: number; manualCount: number } {
  let apiCount = 0;
  let manualCount = 0;
  for (const item of items) {
    if (item.inputSource === 'API') apiCount += 1;
    else manualCount += 1;
  }
  return { rowCount: items.length, apiCount, manualCount };
}

export function formatCourierDownloadBundleLabel(input: {
  createdAt: Date | string;
  rowCount: number;
  apiCount: number;
  manualCount: number;
}): string {
  const createdAt = typeof input.createdAt === 'string' ? new Date(input.createdAt) : input.createdAt;
  const when = Number.isNaN(createdAt.getTime())
    ? '-'
    : createdAt.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
  return `${when} 택배양식 다운로드 · 총 ${input.rowCount}건 (API ${input.apiCount} · 수동 ${input.manualCount})`;
}

/**
 * 주문번호 자동 매칭 키: downloadBundleId + sourceMallKey + mallOrderNo
 * sourceMallKey 없거나 후보 복수면 자동 확정 금지.
 */
export function buildCourierDownloadMallOrderMatchKey(input: {
  downloadBundleId: string;
  sourceMallKey: string | null | undefined;
  mallOrderNo: string | null | undefined;
}): string | null {
  const bundleId = asTrimmed(input.downloadBundleId);
  const mallKey = asTrimmed(input.sourceMallKey);
  const mallOrderNo = asTrimmed(input.mallOrderNo);
  if (!bundleId || !mallKey || !mallOrderNo) return null;
  return `${bundleId}::${mallKey}::${mallOrderNo}`;
}

export function resolveUniqueWorkItemByMallOrderKey(
  items: ReadonlyArray<{
    id: string;
    downloadBundleId: string;
    sourceMallKey: string | null;
    mallOrderNo: string | null;
  }>,
  lookup: { downloadBundleId: string; sourceMallKey: string | null; mallOrderNo: string | null },
): { ok: true; workItemId: string } | { ok: false; reason: 'KEY_INCOMPLETE' | 'NONE' | 'AMBIGUOUS' } {
  const key = buildCourierDownloadMallOrderMatchKey(lookup);
  if (!key) return { ok: false, reason: 'KEY_INCOMPLETE' };
  const matches = items.filter((item) => {
    const itemKey = buildCourierDownloadMallOrderMatchKey({
      downloadBundleId: item.downloadBundleId,
      sourceMallKey: item.sourceMallKey,
      mallOrderNo: item.mallOrderNo,
    });
    return itemKey === key;
  });
  if (matches.length === 0) return { ok: false, reason: 'NONE' };
  if (matches.length > 1) return { ok: false, reason: 'AMBIGUOUS' };
  return { ok: true, workItemId: matches[0]!.id };
}

async function resolveApiOrderIds(
  client: BundlePersistClient,
  userId: string,
  items: ReadonlyArray<CourierDownloadWorkItemDraft>,
): Promise<Array<string | null>> {
  const apiLookups = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.inputSource === 'API' && asTrimmed(item.mallOrderNo) && asTrimmed(item.sourceMallKey));

  if (apiLookups.length === 0) {
    return items.map((item) => asTrimmed(item.orderSyncOrderId));
  }

  const mallOrderNos = [
    ...new Set(apiLookups.map(({ item }) => asTrimmed(item.mallOrderNo)!)),
  ];
  const rows = await client.orderSyncOrder.findMany({
    where: {
      userId,
      mallOrderNo: { in: mallOrderNos },
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    select: {
      id: true,
      mallOrderNo: true,
      provider: true,
      integrationAccountId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const byComposite = new Map<string, string>();
  for (const row of rows) {
    const account = row.integrationAccountId?.trim() || '';
    const key = `${row.provider}::${account}::${row.mallOrderNo.trim()}`;
    if (!byComposite.has(key)) byComposite.set(key, row.id);
    const providerOnly = `${row.provider}::${row.mallOrderNo.trim()}`;
    if (!byComposite.has(providerOnly)) byComposite.set(providerOnly, row.id);
  }

  return items.map((item) => {
    const explicit = asTrimmed(item.orderSyncOrderId);
    if (explicit) return explicit;
    if (item.inputSource !== 'API') return null;
    const mallOrderNo = asTrimmed(item.mallOrderNo);
    const mallKey = asTrimmed(item.sourceMallKey);
    if (!mallOrderNo || !mallKey) return null;

    const [mallIdPart, accountPart = ''] = mallKey.split('::');
    const provider =
      orderIntegrationProviderForMallId(mallIdPart?.trim() || '') ??
      (mallIdPart?.trim().toUpperCase() || null);
    if (!provider) return null;

    const withAccount = byComposite.get(`${provider}::${accountPart.trim()}::${mallOrderNo}`);
    if (withAccount) return withAccount;
    return byComposite.get(`${provider}::${mallOrderNo}`) ?? null;
  });
}

export async function persistCourierDownloadBundle(
  client: BundlePersistClient,
  input: PersistCourierDownloadBundleInput,
): Promise<PersistCourierDownloadBundleResult> {
  if (!input.items.length) {
    throw new Error('Bundle 생성에는 1건 이상의 WorkItem이 필요합니다.');
  }

  const now = input.now ?? new Date();
  const expiresAt = computeOrderSyncSnapshotExpiresAt(now);
  const stats = countBundleSourceStats(input.items);
  const orderIds = await resolveApiOrderIds(client, input.userId, input.items);

  const created = await client.$transaction(async (tx) => {
    const excloadNos = await reserveExcloadOrderNos(
      tx as unknown as OrderSyncPersistTransactionClient,
      { count: input.items.length, date: now },
    );

    const bundle = await (tx as unknown as {
      courierDownloadBundle: {
        create: (args: unknown) => Promise<{
          id: string;
          expiresAt: Date;
          rowCount: number;
          apiCount: number;
          manualCount: number;
        }>;
      };
    }).courierDownloadBundle.create({
      data: {
        userId: input.userId,
        courierTemplateLabel: asTrimmed(input.courierTemplateLabel),
        rowCount: stats.rowCount,
        apiCount: stats.apiCount,
        manualCount: stats.manualCount,
        expiresAt,
        workItems: {
          create: input.items.map((item, index) => ({
            userId: input.userId,
            excloadOrderNo: excloadNos[index]!,
            inputSource: item.inputSource as CourierDownloadWorkItemSource,
            sourceMallKey: asTrimmed(item.sourceMallKey),
            sourceMallLabel: asTrimmed(item.sourceMallLabel),
            mallOrderNo: asTrimmed(item.mallOrderNo),
            orderSyncOrderId: orderIds[index] ?? null,
            matchFingerprintHmac: buildMatchFingerprintHmac(item.matchMaterial ?? {}) ?? null,
            expiresAt,
          })),
        },
      },
    });

    return bundle;
  });

  return {
    bundleId: created.id,
    expiresAt: created.expiresAt.toISOString(),
    rowCount: created.rowCount,
    apiCount: created.apiCount,
    manualCount: created.manualCount,
  };
}

export async function listActiveCourierDownloadBundles(
  client: CourierDownloadBundleListClient,
  input: { userId: string; now?: Date; take?: number },
): Promise<CourierDownloadBundleListItem[]> {
  const now = input.now ?? new Date();
  const rows = await client.courierDownloadBundle.findMany({
    where: {
      userId: input.userId,
      expiresAt: { gte: now },
    },
    orderBy: { createdAt: 'desc' },
    take: input.take ?? 20,
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      rowCount: true,
      apiCount: true,
      manualCount: true,
      courierTemplateLabel: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    rowCount: row.rowCount,
    apiCount: row.apiCount,
    manualCount: row.manualCount,
    courierTemplateLabel: row.courierTemplateLabel,
    label: formatCourierDownloadBundleLabel(row),
  }));
}

export async function purgeExpiredCourierDownloadBundles(
  client: CourierDownloadBundlePurgeClient,
  input: { now?: Date } = {},
): Promise<{ deletedBundles: number }> {
  const now = input.now ?? new Date();
  const result = await client.courierDownloadBundle.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return { deletedBundles: result.count };
}

export type DeleteCourierDownloadBundlesClient = {
  courierDownloadBundle: {
    deleteMany(args: { where?: Record<string, unknown> }): Promise<{ count: number }>;
  };
};

/**
 * 소유자 Bundle만 선택 삭제. 만료·타인 건은 카운트에 포함되지 않음.
 */
export async function deleteCourierDownloadBundlesByIds(
  client: DeleteCourierDownloadBundlesClient,
  input: { userId: string; bundleIds: readonly string[]; now?: Date },
): Promise<{ deletedCount: number; requestedCount: number }> {
  const userId = input.userId.trim();
  const ids = [
    ...new Set(
      input.bundleIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    ),
  ];
  if (!userId || ids.length === 0) {
    return { deletedCount: 0, requestedCount: ids.length };
  }

  const result = await client.courierDownloadBundle.deleteMany({
    where: {
      userId,
      id: { in: ids },
    },
  });
  return { deletedCount: result.count, requestedCount: ids.length };
}

export function parseCourierDownloadBundleIdsBody(
  raw: unknown,
): { ok: true; bundleIds: string[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '요청 본문이 올바르지 않습니다.' };
  }
  const value = (raw as { bundleIds?: unknown }).bundleIds;
  if (!Array.isArray(value)) {
    return { ok: false, error: 'bundleIds 배열이 필요합니다.' };
  }
  if (value.length === 0) {
    return { ok: false, error: '삭제할 항목을 선택해 주세요.' };
  }
  if (value.length > 50) {
    return { ok: false, error: '한 번에 최대 50건까지 삭제할 수 있습니다.' };
  }
  const bundleIds: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) {
      return { ok: false, error: 'bundleIds 형식이 올바르지 않습니다.' };
    }
    bundleIds.push(entry.trim());
  }
  return { ok: true, bundleIds: [...new Set(bundleIds)] };
}
