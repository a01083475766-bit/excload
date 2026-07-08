import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { detectShipmentHeaderRowIndex } from '@/app/lib/order-integration/shipments/normalize-shipment-row';
import {
  extractNormalizedShipmentRows,
  parseCsvText,
  parseShipmentCsv,
  parseShipmentSheetMatrix,
  parseShipmentWorkbook,
} from '@/app/lib/order-integration/shipments/parse-shipment-file';

describe('parseCsvText', () => {
  it('parses quoted CSV fields', () => {
    const rows = parseCsvText('송장번호,받는분전화번호\n"0123456789","010-1234-5678"');
    expect(rows).toEqual([
      ['송장번호', '받는분전화번호'],
      ['0123456789', '010-1234-5678'],
    ]);
  });
});

describe('parseShipmentCsv', () => {
  it('parses multiple shipment rows from CSV text', () => {
    const csv = [
      '송장번호,받는분전화번호,주문번호,엑클로드관리번호,택배사',
      '0123456789,010-1234-5678,ORD-1001,EXC-20260709-000001,CJ대한통운',
      '9876543210,01022223333,ORD-2002,,롯데택배',
    ].join('\n');

    const result = parseShipmentCsv(csv);

    expect(result.ok).toBe(true);
    expect(result.file?.rows).toHaveLength(2);
    expect(result.file?.rows[0]?.normalized.trackingNumber).toBe('0123456789');
    expect(result.file?.rows[0]?.normalized.receiverPhone).toBe('010-1234-5678');
    expect(result.file?.rows[0]?.normalized.receiverPhoneNormalized).toBe('01012345678');
    expect(result.file?.rows[0]?.normalized.mallOrderNo).toBe('ORD-1001');
    expect(result.file?.rows[0]?.normalized.excloadOrderNo).toBe('EXC-20260709-000001');
    expect(result.file?.rows[1]?.normalized.mallOrderNo).toBe('ORD-2002');
  });

  it('preserves leading zeros in tracking number and phone', () => {
    const result = parseShipmentCsv('송장번호,받는분전화번호\n0123456789,01012345678');

    expect(result.file?.rows[0]?.normalized.trackingNumber).toBe('0123456789');
    expect(result.file?.rows[0]?.normalized.receiverPhoneNormalized).toBe('01012345678');
  });

  it('removes empty rows and preserves original row numbers', () => {
    const csv = [
      '송장번호,주문번호',
      '1111111111,ORD-1',
      '',
      '2222222222,ORD-2',
    ].join('\n');

    const result = parseShipmentCsv(csv);

    expect(result.file?.rows).toHaveLength(2);
    expect(result.file?.rows[0]?.originalRowIndex).toBe(1);
    expect(result.file?.rows[1]?.originalRowIndex).toBe(3);
  });

  it('recognizes alternate header aliases', () => {
    const result = parseShipmentCsv(
      '운송장번호,수취인전화,쇼핑몰주문번호,내부관리번호\n1234567890,01099998888,ORD-9,EXC-9',
    );

    expect(result.file?.rows[0]?.normalized.mallOrderNo).toBe('ORD-9');
    expect(result.file?.rows[0]?.normalized.excloadOrderNo).toBe('EXC-9');
    expect(result.file?.rows[0]?.normalized.receiverPhoneNormalized).toBe('01099998888');
  });

  it('warns when tracking number is missing', () => {
    const result = parseShipmentCsv('송장번호,주문번호\n,ORD-1');

    expect(result.file?.rows[0]?.warnings.some((w) => w.code === 'MISSING_TRACKING_NUMBER')).toBe(
      true,
    );
    expect(result.warnings.some((w) => w.code === 'MISSING_TRACKING_NUMBER')).toBe(true);
  });

  it('fails safely on completely empty CSV', () => {
    const result = parseShipmentCsv('   \n  ');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('읽을 수 있는 행');
    expect(result.warnings[0]?.code).toBe('EMPTY_FILE');
  });
});

describe('parseShipmentSheetMatrix', () => {
  it('parses workbook-like sheet matrix with header row detection', () => {
    const matrix = [
      ['택배 송장 업로드 안내'],
      ['송장번호', '받는분', '받는분전화번호', '주문번호', '엑클로드관리번호'],
      ['0123456789', '홍길동', '010-1111-2222', 'ORD-1001', 'EXC-20260709-000001'],
      ['', '', '', '', ''],
      ['9876543210', '김철수', '01033334444', 'ORD-1002', ''],
    ];

    const result = parseShipmentSheetMatrix(matrix, 'sheet');

    expect(result.ok).toBe(true);
    expect(result.file?.headerRowIndex).toBe(1);
    expect(result.file?.rows).toHaveLength(2);
    expect(result.file?.rows[0]?.originalRowIndex).toBe(2);
    expect(result.file?.rows[0]?.normalized.excloadOrderNo).toBe('EXC-20260709-000001');
    expect(result.file?.rows[1]?.originalRowIndex).toBe(4);
  });

  it('picks the best header row among multiple candidates', () => {
    const matrix = [
      ['no', 'phone', 'order'],
      ['송장번호', '받는분전화번호', '주문번호', '수취인'],
      ['1234567890', '01012345678', 'ORD-1', '홍길동'],
    ];

    expect(detectShipmentHeaderRowIndex(matrix)).toBe(1);

    const result = parseShipmentSheetMatrix(matrix);
    expect(result.file?.headerRowIndex).toBe(1);
    expect(result.file?.rows[0]?.normalized.mallOrderNo).toBe('ORD-1');
  });

  it('extracts normalized rows for match layer', () => {
    const result = parseShipmentSheetMatrix([
      ['송장번호', '주문번호'],
      ['1234567890', 'ORD-1'],
    ]);

    const normalized = extractNormalizedShipmentRows(result);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.mallOrderNo).toBe('ORD-1');
  });
});

describe('parseShipmentWorkbook', () => {
  it('parses xlsx workbook buffer into shipment rows', () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['송장번호', '받는분전화번호', '주문번호', '엑클로드관리번호'],
      ['0123456789', '01012345678', 'ORD-1001', 'EXC-20260709-000001'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '송장');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const result = parseShipmentWorkbook(buffer, 'xlsx');

    expect(result.ok).toBe(true);
    expect(result.file?.format).toBe('xlsx');
    expect(result.file?.rows[0]?.normalized.trackingNumber).toBe('0123456789');
    expect(result.file?.rows[0]?.normalized.excloadOrderNo).toBe('EXC-20260709-000001');
  });

  it('fails safely on empty workbook sheet', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'empty');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const result = parseShipmentWorkbook(buffer);

    expect(result.ok).toBe(false);
    expect(result.warnings[0]?.code).toBe('EMPTY_FILE');
  });
});
