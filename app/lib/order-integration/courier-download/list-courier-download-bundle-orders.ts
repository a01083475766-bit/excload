/**
 * 선택한 CourierDownloadBundle의 WorkItem 주문 요약 (확인용 최소 필드).
 * 수취인·주소·raw JSON 등은 조회·반환하지 않음.
 */

import type { PrismaClient } from '@prisma/client';

export type CourierDownloadBundleOrderSourceType = 'API' | 'MANUAL';

export type CourierDownloadBundleOrderRow = {
  id: string;
  mallLabel: string;
  mallOrderNo: string | null;
  sourceType: CourierDownloadBundleOrderSourceType;
  sourceTypeLabel: 'API 주문' | '엑셀·수동 주문';
  excloadOrderNo: string;
};

export type ListCourierDownloadBundleOrdersResult =
  | {
      ok: true;
      bundleId: string;
      orderCount: number;
      orders: CourierDownloadBundleOrderRow[];
    }
  | { ok: false; reason: 'NOT_FOUND' };

/** PrismaClient.courierDownloadBundle delegate를 그대로 파생 (테스트 mock은 동일 Pick 사용) */
export type CourierDownloadBundleOrdersClient = Pick<PrismaClient, 'courierDownloadBundle'>;

function asTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function mapCourierDownloadWorkItemSourceType(
  inputSource: string,
): CourierDownloadBundleOrderSourceType {
  return inputSource === 'API' ? 'API' : 'MANUAL';
}

export function formatCourierDownloadOrderSourceTypeLabel(
  sourceType: CourierDownloadBundleOrderSourceType,
): 'API 주문' | '엑셀·수동 주문' {
  return sourceType === 'API' ? 'API 주문' : '엑셀·수동 주문';
}

export function resolveCourierDownloadOrderMallLabel(input: {
  sourceMallLabel: string | null | undefined;
  sourceMallKey: string | null | undefined;
}): string {
  return asTrimmed(input.sourceMallLabel) || asTrimmed(input.sourceMallKey) || '-';
}

/** 몰 주문번호와 다르고 비어 있지 않을 보조 표시에 사용 */
export function shouldShowExcloadOrderNoHelper(
  mallOrderNo: string | null | undefined,
  excloadOrderNo: string | null | undefined,
): boolean {
  const excload = asTrimmed(excloadOrderNo);
  if (!excload) return false;
  const mall = asTrimmed(mallOrderNo);
  return !mall || mall !== excload;
}

export function toCourierDownloadBundleOrderRow(item: {
  id: string;
  inputSource: string;
  sourceMallKey: string | null;
  sourceMallLabel: string | null;
  mallOrderNo: string | null;
  excloadOrderNo: string;
}): CourierDownloadBundleOrderRow {
  const sourceType = mapCourierDownloadWorkItemSourceType(item.inputSource);
  return {
    id: item.id,
    mallLabel: resolveCourierDownloadOrderMallLabel(item),
    mallOrderNo: asTrimmed(item.mallOrderNo),
    sourceType,
    sourceTypeLabel: formatCourierDownloadOrderSourceTypeLabel(sourceType),
    excloadOrderNo: item.excloadOrderNo.trim(),
  };
}

/**
 * 소유자·미만료 Bundle만. 타 사용자·만료·미존재는 NOT_FOUND (404).
 */
export async function listCourierDownloadBundleOrders(
  client: CourierDownloadBundleOrdersClient,
  input: { userId: string; bundleId: string; now?: Date },
): Promise<ListCourierDownloadBundleOrdersResult> {
  const userId = input.userId.trim();
  const bundleId = input.bundleId.trim();
  if (!userId || !bundleId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const now = input.now ?? new Date();
  const bundle = await client.courierDownloadBundle.findFirst({
    where: {
      id: bundleId,
      userId,
      expiresAt: { gte: now },
    },
    select: {
      id: true,
      workItems: {
        select: {
          id: true,
          inputSource: true,
          sourceMallKey: true,
          sourceMallLabel: true,
          mallOrderNo: true,
          excloadOrderNo: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!bundle) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const orders = bundle.workItems.map(toCourierDownloadBundleOrderRow);
  return {
    ok: true,
    bundleId: bundle.id,
    orderCount: orders.length,
    orders,
  };
}
