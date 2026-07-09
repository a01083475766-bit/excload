import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import type { ShipmentUploadExportGroup } from '@/app/lib/order-integration/shipments/build-shipment-upload-export-rows';
import {
  buildShipmentUploadExportCsvContent,
  buildShipmentUploadExportFileName,
  buildShipmentUploadExportSheetName,
  buildShipmentUploadExportXlsxBuffer,
  mapShipmentUploadExportGroupToFileRows,
  parseShipmentUploadExportFormat,
  resolveShipmentUploadExportGroupsForDownload,
  SHIPMENT_UPLOAD_EXPORT_FILE_HEADERS,
} from '@/app/lib/order-integration/shipments/render-shipment-upload-export-file';

function buildGroup(overrides: Partial<ShipmentUploadExportGroup> = {}): ShipmentUploadExportGroup {
  return {
    provider: 'SMARTSTORE',
    integrationAccountId: 'acc-1',
    rows: [
      {
        orderSyncOrderId: 'order-1',
        shipmentMatchId: 'match-1',
        shipmentUploadRowId: 'row-1',
        mallOrderNo: 'ORD-1001',
        excloadOrderNo: 'EXC-1',
        trackingNumber: '12345678901234',
        carrierName: 'CJ대한통운',
        recipientNameMasked: '홍*동',
        recipientPhoneMasked: '010-****-5678',
      },
    ],
    ...overrides,
  };
}

describe('parseShipmentUploadExportFormat', () => {
  it('defaults to xlsx and accepts csv', () => {
    expect(parseShipmentUploadExportFormat(null)).toBe('xlsx');
    expect(parseShipmentUploadExportFormat('csv')).toBe('csv');
  });
});

describe('mapShipmentUploadExportGroupToFileRows', () => {
  it('maps only upload columns without recipient PII or raw json', () => {
    const rows = mapShipmentUploadExportGroupToFileRows(buildGroup());

    expect(rows[0]).toEqual({
      쇼핑몰: 'SMARTSTORE',
      연동계정ID: 'acc-1',
      쇼핑몰주문번호: 'ORD-1001',
      엑클로드관리번호: 'EXC-1',
      택배사: 'CJ대한통운',
      송장번호: '12345678901234',
      매칭ID: 'match-1',
      주문스냅샷ID: 'order-1',
    });
    expect(JSON.stringify(rows)).not.toContain('rawRowJson');
    expect(JSON.stringify(rows)).not.toContain('candidateOrdersJson');
    expect(JSON.stringify(rows)).not.toContain('홍*동');
    expect(JSON.stringify(rows)).not.toContain('010-****-5678');
  });
});

describe('resolveShipmentUploadExportGroupsForDownload', () => {
  it('returns all groups for xlsx', () => {
    const groups = [
      buildGroup(),
      buildGroup({ provider: 'COUPANG', integrationAccountId: 'acc-2' }),
    ];

    expect(
      resolveShipmentUploadExportGroupsForDownload({
        groups,
        format: 'xlsx',
        hasIntegrationAccountFilter: false,
      }),
    ).toEqual({ ok: true, groups });
  });

  it('requires provider for csv when multiple groups exist', () => {
    const groups = [
      buildGroup(),
      buildGroup({ provider: 'COUPANG', integrationAccountId: 'acc-2' }),
    ];

    expect(
      resolveShipmentUploadExportGroupsForDownload({
        groups,
        format: 'csv',
        hasIntegrationAccountFilter: false,
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: 'CSV 다운로드는 쇼핑몰(provider)를 지정해 주세요.',
    });
  });

  it('filters csv to a single provider/account group', () => {
    const groups = [
      buildGroup(),
      buildGroup({ provider: 'COUPANG', integrationAccountId: 'acc-2' }),
    ];

    expect(
      resolveShipmentUploadExportGroupsForDownload({
        groups,
        format: 'csv',
        provider: 'SMARTSTORE',
        integrationAccountId: 'acc-1',
        hasIntegrationAccountFilter: true,
      }),
    ).toEqual({ ok: true, groups: [groups[0]] });
  });
});

describe('buildShipmentUploadExportCsvContent', () => {
  it('includes UTF-8 BOM and header row', () => {
    const content = buildShipmentUploadExportCsvContent([buildGroup()]);

    expect(content.startsWith('\uFEFF')).toBe(true);
    expect(content).toContain(SHIPMENT_UPLOAD_EXPORT_FILE_HEADERS.join(','));
    expect(content).toContain('ORD-1001');
  });
});

describe('buildShipmentUploadExportXlsxBuffer', () => {
  it('creates separate sheets per provider/account group', () => {
    const buffer = buildShipmentUploadExportXlsxBuffer([
      buildGroup(),
      buildGroup({ provider: 'COUPANG', integrationAccountId: 'acc-2' }),
    ]);

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toHaveLength(2);
    expect(buildShipmentUploadExportSheetName(buildGroup())).toBe('SMARTSTORE-acc-1');
  });
});

describe('buildShipmentUploadExportFileName', () => {
  it('builds xlsx and csv filenames', () => {
    expect(buildShipmentUploadExportFileName({ format: 'xlsx', batchId: 'batch-1' })).toBe(
      'excload-shipment-upload-batch-1.xlsx',
    );
    expect(
      buildShipmentUploadExportFileName({
        format: 'csv',
        batchId: 'batch-1',
        provider: 'SHOPIFY',
      }),
    ).toBe('excload-shipment-upload-SHOPIFY-batch-1.csv');
  });
});
