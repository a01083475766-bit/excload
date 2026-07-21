import type { PreviewRowWithId } from '@/app/order-convert/OrderConvertPreviewTableRow';
import type { CourierDownloadWorkItemDraft } from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';
import {
  extractMatchFingerprintMaterialFromRow,
  type MatchFingerprintMaterial,
} from '@/app/lib/order-integration/courier-download/match-fingerprint-material';
import { ORDER_INTEGRATION_MALLS } from '@/app/lib/order-integration/malls';

function cell(row: PreviewRowWithId, ...keys: string[]): string | null {
  const data = row.data as Record<string, unknown>;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function mallLabelById(mallId: string): string {
  const found = ORDER_INTEGRATION_MALLS.find((m) => m.id === mallId);
  return found?.name ?? mallId;
}

/** 예시 미리보기(빈 accountId) — 실제 API 주문으로 취급하지 않음 */
export function isExamplePreviewOrderRow(row: PreviewRowWithId): boolean {
  const src = row.orderSyncSource;
  if (src?.isExamplePreview) return true;
  if (src && !src.accountId?.trim()) return true;
  return false;
}

function materialForRow(row: PreviewRowWithId): MatchFingerprintMaterial {
  const fromStandard = extractMatchFingerprintMaterialFromRow(row.orderSyncSource?.standardRow);
  const fromData = extractMatchFingerprintMaterialFromRow(row.data as Record<string, unknown>);
  return {
    receiverPhone: fromStandard.receiverPhone || fromData.receiverPhone,
    receiverName: fromStandard.receiverName || fromData.receiverName,
    receiverAddress: fromStandard.receiverAddress || fromData.receiverAddress,
  };
}

/**
 * WorkItem.mallOrderNo용 주문번호.
 * 1) 변환 시 보존한 sourceMallOrderNo (표준 주문번호)
 * 2) API standardRow 주문번호
 * 3) 미리보기 data에 「주문번호」열이 직접 있는 경우
 * 임의 생성하지 않음.
 */
export function resolvePreviewMallOrderNo(row: PreviewRowWithId): string | null {
  const fromMeta = row.sourceMallOrderNo?.trim();
  if (fromMeta) return fromMeta;

  const fromApi =
    typeof row.orderSyncSource?.standardRow?.['주문번호'] === 'string'
      ? row.orderSyncSource.standardRow['주문번호'].trim()
      : '';
  if (fromApi) return fromApi;

  return cell(row, '주문번호', '주문 번호', '쇼핑몰주문번호');
}

/**
 * 다운로드 대상 미리보기 행 → Bundle WorkItem draft (PII 평문 없음).
 * 예시 미리보기 행은 제외한다.
 */
export function buildCourierDownloadWorkItemDraftsFromPreviewRows(
  rows: ReadonlyArray<PreviewRowWithId>,
): CourierDownloadWorkItemDraft[] {
  const drafts: CourierDownloadWorkItemDraft[] = [];

  for (const row of rows) {
    if (isExamplePreviewOrderRow(row)) {
      continue;
    }

    const src = row.orderSyncSource;
    if (src?.mallId && src.accountId?.trim()) {
      drafts.push({
        inputSource: 'API',
        sourceMallKey: `${src.mallId}::${src.accountId.trim()}`,
        sourceMallLabel: mallLabelById(src.mallId),
        mallOrderNo: resolvePreviewMallOrderNo(row),
        matchMaterial: materialForRow(row),
      });
      continue;
    }

    const inputSource =
      row.courierDownloadInputSource === 'TEXT'
        ? ('TEXT' as const)
        : row.courierDownloadInputSource === 'API'
          ? // accountId 없는 API 태그는 예시로 이미 제외됨 — 방어적으로 EXCEL 취급
            ('EXCEL' as const)
          : ('EXCEL' as const);

    drafts.push({
      inputSource,
      sourceMallKey: cell(row, '판매처', '쇼핑몰', '몰'),
      sourceMallLabel: cell(row, '판매처', '쇼핑몰', '몰'),
      mallOrderNo: resolvePreviewMallOrderNo(row),
      matchMaterial: materialForRow(row),
    });
  }

  return drafts;
}

export function previewRowsAreExampleOnly(rows: ReadonlyArray<PreviewRowWithId>): boolean {
  return rows.length > 0 && rows.every((row) => isExamplePreviewOrderRow(row));
}
