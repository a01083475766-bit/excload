import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { OrderStandardFile } from '../../order/order-pipeline';
import { mergeOrderAndInvoiceStandardFiles } from '../merge-order-invoice-standard';

const BH = ['주문번호', '받는사람', '운송장번호'] as const;

function ofile(rows: Record<string, string>[], unknown: string[] = []): OrderStandardFile {
  return {
    baseHeaders: [...BH],
    rows,
    unknownHeaders: unknown,
  };
}

test('주문번호 일치 시 송장 쪽 운송장번호가 비어 있지 않으면 덮어씀', () => {
  const order = ofile([{ 주문번호: 'A1', 받는사람: '김', 운송장번호: '' }]);
  const inv = ofile([{ 주문번호: 'A1', 받는사람: '타인', 운송장번호: '1234567890' }]);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].운송장번호, '1234567890');
  assert.equal(m.rows[0].받는사람, '김');
  assert.equal(m.rows[0].주문번호, 'A1');
});

test('동일 주문번호 송장 N행이면 주문 행 N개로 복제', () => {
  const order = ofile([{ 주문번호: 'B2', 받는사람: '이', 운송장번호: '' }]);
  const inv = ofile([
    { 주문번호: 'B2', 받는사람: '', 운송장번호: '111' },
    { 주문번호: 'B2', 받는사람: '', 운송장번호: '222' },
  ]);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 2);
  assert.equal(m.rows[0].운송장번호, '111');
  assert.equal(m.rows[1].운송장번호, '222');
});

test('매칭 없으면 주문 행만 유지', () => {
  const order = ofile([{ 주문번호: 'C3', 받는사람: '박', 운송장번호: '' }]);
  const inv = ofile([{ 주문번호: 'ZZZ', 받는사람: '', 운송장번호: '999' }]);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].운송장번호, '');
});

test('unknownHeaders 병합', () => {
  const order = ofile([{ 주문번호: '1', 받는사람: '', 운송장번호: '' }], ['a']);
  const inv = ofile([{ 주문번호: '1', 받는사람: '', 운송장번호: 'x' }], ['b', 'a']);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.deepEqual(m.unknownHeaders, ['a', 'b']);
});

test('주문번호가 비어 있어도 상품주문번호가 일치하면 송장번호를 병합', () => {
  const order = ofile([
    { 주문번호: '', 상품주문번호: '403481828', 받는사람: '김', 운송장번호: '' } as Record<
      string,
      string
    >,
  ]);
  const inv = ofile([
    { 주문번호: '', 상품주문번호: '403481828', 받는사람: '', 운송장번호: '9988776655' } as Record<
      string,
      string
    >,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].운송장번호, '9988776655');
});
