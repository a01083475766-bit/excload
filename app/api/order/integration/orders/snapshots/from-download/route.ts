import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  persistOrderSyncFromCourierDownload,
  toSafeDownloadPersistClientMessage,
  type CourierDownloadSnapshotGroup,
} from '@/app/lib/order-integration/snapshots/persist-from-courier-download';

const MAX_GROUPS = 20;
const MAX_ROWS_TOTAL = 2000;

function parseGroups(body: unknown): CourierDownloadSnapshotGroup[] | null {
  if (!body || typeof body !== 'object') return null;
  const groups = (body as { groups?: unknown }).groups;
  if (!Array.isArray(groups) || groups.length === 0 || groups.length > MAX_GROUPS) return null;

  const parsed: CourierDownloadSnapshotGroup[] = [];
  let totalRows = 0;

  for (const item of groups) {
    if (!item || typeof item !== 'object') return null;
    const mallId = String((item as { mallId?: unknown }).mallId ?? '').trim();
    const accountId = String((item as { accountId?: unknown }).accountId ?? '').trim();
    const rowsRaw = (item as { rows?: unknown }).rows;
    if (!mallId || !accountId || !Array.isArray(rowsRaw) || rowsRaw.length === 0) return null;

    const rows: Array<Record<string, string>> = [];
    for (const row of rowsRaw) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        if (typeof key !== 'string') continue;
        normalized[key] = value == null ? '' : String(value);
      }
      rows.push(normalized);
    }

    totalRows += rows.length;
    if (totalRows > MAX_ROWS_TOTAL) return null;
    parsed.push({ mallId, accountId, rows });
  }

  return parsed;
}

/**
 * 택배양식 다운로드 직후 — 연동 주문 스냅샷 저장.
 * 주문조회 API와 분리된 저장 트리거.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

    const body = await request.json().catch(() => null);
    const groups = parseGroups(body);
    if (!groups) {
      return NextResponse.json(
        { error: '다운로드 주문 정보가 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const result = await persistOrderSyncFromCourierDownload({
      userId: auth.userId,
      groups,
    });

    const groupResults = result.groupResults.map((g) => ({
      mallId: g.mallId,
      accountId: g.accountId,
      persisted: g.result.persisted,
      ...(g.result.persisted
        ? { orderCount: g.result.orderCount, batchId: g.result.batchId }
        : { reason: g.result.reason }),
    }));

    const anyFailed =
      result.attempted &&
      (groupResults.length === 0 || groupResults.some((g) => !g.persisted));

    if (anyFailed) {
      return NextResponse.json(
        {
          success: false,
          attempted: true,
          savedOrderCount: result.savedOrderCount,
          skippedDuplicateOrEmpty: result.skippedDuplicateOrEmpty,
          groupResults,
          error:
            '송장 매칭·전송용 주문 저장에 실패했습니다. 택배양식 다운로드를 진행할 수 없습니다.',
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      attempted: result.attempted,
      savedOrderCount: result.savedOrderCount,
      skippedDuplicateOrEmpty: result.skippedDuplicateOrEmpty,
      groupResults,
    });
  } catch (error) {
    return NextResponse.json(
      { error: toSafeDownloadPersistClientMessage(error) },
      { status: 500 },
    );
  }
}
