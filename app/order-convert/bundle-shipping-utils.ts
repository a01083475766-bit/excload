import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import type { PreviewRowWithId } from '@/app/order-convert/OrderConvertPreviewTableRow';

const NAME_BASE_HEADERS = ['받는사람'] as const;
const PHONE_BASE_HEADERS = ['받는사람전화1', '받는사람전화2', '주문자연락처'] as const;
const ADDRESS_BASE_HEADERS = ['받는사람주소1', '받는사람주소2'] as const;

export type RecipientCourierColumns = {
  nameHeaders: string[];
  phoneHeaders: string[];
  addressHeaders: string[];
};

export type BundleShippingGroup = {
  /** 정규화된 수령인 키 */
  key: string;
  groupId: string;
  rowIds: string[];
  displayName: string;
  displayPhone: string;
  displayAddress: string;
};

export function normalizeRecipientName(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/님$/u, '')
    .toUpperCase();
}

export function normalizeRecipientPhone(value: string): string {
  return String(value ?? '').replace(/\D+/g, '');
}

export function normalizeRecipientAddress(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^\w가-힣]/g, '');
}

function pickFirstNonEmpty(values: string[]): string {
  for (const v of values) {
    const t = String(v ?? '').trim();
    if (t) return t;
  }
  return '';
}

function courierHeadersForBase(
  template: TemplateBridgeFile,
  baseHeaders: readonly string[],
): string[] {
  const out: string[] = [];
  for (let i = 0; i < template.courierHeaders.length; i++) {
    const base = template.mappedBaseHeaders[i];
    if (base && baseHeaders.includes(base as (typeof baseHeaders)[number])) {
      const ch = template.courierHeaders[i];
      if (ch && !out.includes(ch)) out.push(ch);
    }
  }
  return out;
}

function fallbackCourierHeaders(
  courierHeaders: string[],
  patterns: RegExp[],
): string[] {
  return courierHeaders.filter((h) => {
    const n = h.replace(/\s+/g, '');
    return patterns.some((p) => p.test(n));
  });
}

export function resolveRecipientCourierColumns(
  template: TemplateBridgeFile | null,
  courierHeaders: string[],
): RecipientCourierColumns | null {
  if (template) {
    const nameHeaders = courierHeadersForBase(template, NAME_BASE_HEADERS);
    const phoneHeaders = courierHeadersForBase(template, PHONE_BASE_HEADERS);
    const addressHeaders = courierHeadersForBase(template, ADDRESS_BASE_HEADERS);
    if (nameHeaders.length > 0 && phoneHeaders.length > 0 && addressHeaders.length > 0) {
      return { nameHeaders, phoneHeaders, addressHeaders };
    }
  }

  const nameHeaders = fallbackCourierHeaders(courierHeaders, [
    /수령|수취|받는사람|받는분|수하인|consignee/i,
  ]);
  const phoneHeaders = fallbackCourierHeaders(courierHeaders, [
    /연락|전화|휴대|핸드폰|phone|tel/i,
  ]).filter((h) => !/주문자|보내|송화|발송/i.test(h));
  const addressHeaders = fallbackCourierHeaders(courierHeaders, [
    /배송지|주소|address/i,
  ]).filter((h) => !/보내|송화|발송|우편/i.test(h));

  if (nameHeaders.length === 0 || phoneHeaders.length === 0 || addressHeaders.length === 0) {
    return null;
  }

  return {
    nameHeaders: nameHeaders.slice(0, 2),
    phoneHeaders: phoneHeaders.slice(0, 2),
    addressHeaders: addressHeaders.slice(0, 2),
  };
}

export function getCellDisplayValue(
  row: PreviewRowWithId,
  header: string,
  userOverrides: Record<string, Record<string, string>>,
): string {
  const override = userOverrides[row.rowId]?.[header];
  if (override !== undefined) return String(override);
  return String(row.data[header] ?? '');
}

function buildRecipientFingerprint(
  row: PreviewRowWithId,
  columns: RecipientCourierColumns,
  userOverrides: Record<string, Record<string, string>>,
): string | null {
  const name = normalizeRecipientName(
    pickFirstNonEmpty(columns.nameHeaders.map((h) => getCellDisplayValue(row, h, userOverrides))),
  );
  const phone = normalizeRecipientPhone(
    pickFirstNonEmpty(columns.phoneHeaders.map((h) => getCellDisplayValue(row, h, userOverrides))),
  );
  const address = normalizeRecipientAddress(
    columns.addressHeaders.map((h) => getCellDisplayValue(row, h, userOverrides)).join(' '),
  );

  if (!name || !phone || !address) return null;
  return `${name}|${phone}|${address}`;
}

export function detectBundleShippingGroups(
  previewRows: PreviewRowWithId[],
  courierHeaders: string[],
  template: TemplateBridgeFile | null,
  userOverrides: Record<string, Record<string, string>>,
): { groups: BundleShippingGroup[]; columns: RecipientCourierColumns | null } {
  const columns = resolveRecipientCourierColumns(template, courierHeaders);
  if (!columns || previewRows.length < 2) {
    return { groups: [], columns };
  }

  const byKey = new Map<string, PreviewRowWithId[]>();

  for (const row of previewRows) {
    const key = buildRecipientFingerprint(row, columns, userOverrides);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const groups: BundleShippingGroup[] = [];

  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;

    const sample = rows[0];
    const displayName = pickFirstNonEmpty(
      columns.nameHeaders.map((h) => getCellDisplayValue(sample, h, userOverrides)),
    );
    const displayPhone = pickFirstNonEmpty(
      columns.phoneHeaders.map((h) => getCellDisplayValue(sample, h, userOverrides)),
    );
    const displayAddress = pickFirstNonEmpty(
      columns.addressHeaders.map((h) => getCellDisplayValue(sample, h, userOverrides)),
    );

    groups.push({
      key,
      groupId: key,
      rowIds: rows.map((r) => r.rowId),
      displayName,
      displayPhone,
      displayAddress,
    });
  }

  groups.sort((a, b) => b.rowIds.length - a.rowIds.length);
  return { groups, columns };
}

export function countBundleShippingDuplicateRows(groups: BundleShippingGroup[]): number {
  return groups.reduce((sum, g) => sum + g.rowIds.length, 0);
}
