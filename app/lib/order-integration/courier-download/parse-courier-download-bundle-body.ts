/**
 * POST /api/.../courier-download-bundles body parser
 */

import type { CourierDownloadWorkItemDraft } from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';
import type { MatchFingerprintMaterial } from '@/app/lib/order-integration/courier-download/match-fingerprint-material';

export type ParseCourierDownloadBundleBodyResult =
  | {
      ok: true;
      body: {
        courierTemplateLabel: string | null;
        items: CourierDownloadWorkItemDraft[];
      };
    }
  | { ok: false; error: string };

const MAX_ITEMS = 2000;
const SOURCES = new Set(['API', 'EXCEL', 'TEXT']);

function parseMatchMaterial(raw: unknown): MatchFingerprintMaterial | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const value = obj[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const material: MatchFingerprintMaterial = {
    receiverPhone: pick('receiverPhone'),
    receiverName: pick('receiverName'),
    receiverAddress: pick('receiverAddress'),
  };
  if (!material.receiverPhone && !material.receiverName && !material.receiverAddress) {
    return null;
  }
  return material;
}

export function parseCourierDownloadBundleBody(raw: unknown): ParseCourierDownloadBundleBodyResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  const itemsRaw = obj.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    return { ok: false, error: 'items must be a non-empty array.' };
  }
  if (itemsRaw.length > MAX_ITEMS) {
    return { ok: false, error: `items must be at most ${MAX_ITEMS}.` };
  }

  const items: CourierDownloadWorkItemDraft[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: 'Each item must be an object.' };
    }
    const row = entry as Record<string, unknown>;
    const inputSource = typeof row.inputSource === 'string' ? row.inputSource.trim().toUpperCase() : '';
    if (!SOURCES.has(inputSource)) {
      return { ok: false, error: 'inputSource must be API, EXCEL, or TEXT.' };
    }
    // 예시 미리보기 행은 클라이언트가 보내지 않아야 함 — 방어적으로 거부
    if (row.isExamplePreview === true) {
      return { ok: false, error: 'Example preview rows cannot create download bundles.' };
    }
    items.push({
      inputSource: inputSource as 'API' | 'EXCEL' | 'TEXT',
      sourceMallKey: typeof row.sourceMallKey === 'string' ? row.sourceMallKey : null,
      sourceMallLabel: typeof row.sourceMallLabel === 'string' ? row.sourceMallLabel : null,
      mallOrderNo: typeof row.mallOrderNo === 'string' ? row.mallOrderNo : null,
      orderSyncOrderId: typeof row.orderSyncOrderId === 'string' ? row.orderSyncOrderId : null,
      matchMaterial: parseMatchMaterial(row.matchMaterial),
    });
  }

  const label =
    typeof obj.courierTemplateLabel === 'string' ? obj.courierTemplateLabel.trim() || null : null;

  return { ok: true, body: { courierTemplateLabel: label, items } };
}
