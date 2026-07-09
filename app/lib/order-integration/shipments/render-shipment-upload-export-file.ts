import type { OrderIntegrationProvider } from '@prisma/client';
import * as XLSX from 'xlsx';

import type { ShipmentUploadExportGroup } from '@/app/lib/order-integration/shipments/build-shipment-upload-export-rows';

export type ShipmentUploadExportFormat = 'xlsx' | 'csv';

export const SHIPMENT_UPLOAD_EXPORT_FILE_HEADERS = [
  '쇼핑몰',
  '연동계정ID',
  '쇼핑몰주문번호',
  '엑클로드관리번호',
  '택배사',
  '송장번호',
  '매칭ID',
  '주문스냅샷ID',
] as const;

export type ShipmentUploadExportFileRow = Record<
  (typeof SHIPMENT_UPLOAD_EXPORT_FILE_HEADERS)[number],
  string
>;

export function parseShipmentUploadExportFormat(
  value: string | null | undefined,
): ShipmentUploadExportFormat | { error: string } {
  const normalized = String(value ?? 'xlsx').trim().toLowerCase();
  if (normalized === 'xlsx' || normalized === 'csv') {
    return normalized;
  }
  return { error: 'format은 xlsx 또는 csv여야 합니다.' };
}

export function parseShipmentUploadExportProvider(
  value: string | null | undefined,
): OrderIntegrationProvider | null | { error: string } {
  if (value == null || value.trim() === '') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  const providers: OrderIntegrationProvider[] = [
    'COUPANG',
    'ELEVEN',
    'SMARTSTORE',
    'CAFE24',
    'LOTTEON',
    'SSG',
    'CJONSTYLE',
    'SHOPBY',
    'GODOMALL',
    'MAKESHOP',
    'SHOPIFY',
  ];

  if (providers.includes(normalized as OrderIntegrationProvider)) {
    return normalized as OrderIntegrationProvider;
  }

  return { error: '유효하지 않은 provider입니다.' };
}

export function parseShipmentUploadExportIntegrationAccountId(
  value: string | null | undefined,
): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

export function mapShipmentUploadExportGroupToFileRows(
  group: ShipmentUploadExportGroup,
): ShipmentUploadExportFileRow[] {
  return group.rows.map((row) => ({
    쇼핑몰: group.provider,
    연동계정ID: group.integrationAccountId ?? '',
    쇼핑몰주문번호: row.mallOrderNo,
    엑클로드관리번호: row.excloadOrderNo,
    택배사: row.carrierName ?? '',
    송장번호: row.trackingNumber,
    매칭ID: row.shipmentMatchId,
    주문스냅샷ID: row.orderSyncOrderId,
  }));
}

export function buildShipmentUploadExportSheetName(group: ShipmentUploadExportGroup): string {
  const accountPart = group.integrationAccountId?.slice(0, 8) ?? 'default';
  const raw = `${group.provider}-${accountPart}`;
  return raw.replace(/[\\/?*[\]]/g, '_').slice(0, 31);
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildShipmentUploadExportCsvContent(groups: ShipmentUploadExportGroup[]): string {
  const group = groups[0];
  if (!group) {
    return '\uFEFF';
  }

  const rows = mapShipmentUploadExportGroupToFileRows(group);
  const headers = [...SHIPMENT_UPLOAD_EXPORT_FILE_HEADERS];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header] ?? '')).join(',')),
  ];

  return `\uFEFF${lines.join('\r\n')}`;
}

export function buildShipmentUploadExportXlsxBuffer(groups: ShipmentUploadExportGroup[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  for (const group of groups) {
    let sheetName = buildShipmentUploadExportSheetName(group);
    let suffix = 1;
    while (usedSheetNames.has(sheetName)) {
      sheetName = `${buildShipmentUploadExportSheetName(group).slice(0, 28)}_${suffix}`;
      suffix += 1;
    }
    usedSheetNames.add(sheetName);

    const rows = mapShipmentUploadExportGroupToFileRows(group);
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [...SHIPMENT_UPLOAD_EXPORT_FILE_HEADERS],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildShipmentUploadExportFileName(input: {
  format: ShipmentUploadExportFormat;
  batchId: string;
  provider?: OrderIntegrationProvider | null;
}): string {
  if (input.format === 'csv' && input.provider) {
    return `excload-shipment-upload-${input.provider}-${input.batchId}.csv`;
  }
  return `excload-shipment-upload-${input.batchId}.${input.format}`;
}

export function resolveShipmentUploadExportGroupsForDownload(input: {
  groups: ShipmentUploadExportGroup[];
  format: ShipmentUploadExportFormat;
  provider?: OrderIntegrationProvider | null;
  integrationAccountId?: string | null;
  hasIntegrationAccountFilter: boolean;
}):
  | { ok: true; groups: ShipmentUploadExportGroup[] }
  | { ok: false; status: 400; error: string } {
  if (input.groups.length === 0) {
    return { ok: false, status: 400, error: '보낼 데이터가 없습니다.' };
  }

  if (input.format === 'xlsx') {
    return { ok: true, groups: input.groups };
  }

  if (input.groups.length > 1 && !input.provider) {
    return {
      ok: false,
      status: 400,
      error: 'CSV 다운로드는 쇼핑몰(provider)를 지정해 주세요.',
    };
  }

  let selected = input.groups;
  if (input.provider) {
    selected = selected.filter((group) => group.provider === input.provider);
  }

  if (selected.length === 0) {
    return { ok: false, status: 400, error: '지정한 범위의 보낼 데이터가 없습니다.' };
  }

  if (selected.length > 1 && !input.hasIntegrationAccountFilter) {
    return {
      ok: false,
      status: 400,
      error: 'CSV 다운로드는 연동 계정(integrationAccountId)을 지정해 주세요.',
    };
  }

  if (input.hasIntegrationAccountFilter) {
    const accountId = input.integrationAccountId ?? null;
    selected = selected.filter(
      (group) => (group.integrationAccountId ?? null) === accountId,
    );
  }

  if (selected.length === 0) {
    return { ok: false, status: 400, error: '지정한 범위의 보낼 데이터가 없습니다.' };
  }

  if (selected.length > 1) {
    return { ok: false, status: 400, error: 'CSV 다운로드 범위가 명확하지 않습니다.' };
  }

  return { ok: true, groups: selected };
}
