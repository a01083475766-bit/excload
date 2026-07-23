import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { OrderStandardFile } from '../../order/order-pipeline';
import { mergeOrderAndInvoiceStandardFiles } from '../merge-order-invoice-standard';

const BH = ['주문번호', '받는사람', '운송장번호', '택배사'] as const;

function ofile(rows: Record<string, string>[], unknown: string[] = []): OrderStandardFile {
  return {
    baseHeaders: [...BH],
    rows,
    unknownHeaders: unknown,
  };
}

test('주문번호 일치 시 송장 쪽 운송장번호가 비어 있지 않으면 덮어씀', () => {
  const order = ofile([{ 주문번호: 'A1', 받는사람: '김', 운송장번호: '', 택배사: '' }]);
  const inv = ofile([{ 주문번호: 'A1', 받는사람: '타인', 운송장번호: '1234567890', 택배사: '롯데택배' }]);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].운송장번호, '1234567890');
  assert.equal(m.rows[0].택배사, '롯데택배');
  assert.equal(m.rows[0].받는사람, '김');
  assert.equal(m.rows[0].주문번호, 'A1');
});

test('동일 주문번호 송장 N행이면 주문 행 N개로 복제', () => {
  const order = ofile([{ 주문번호: 'B2', 받는사람: '이', 운송장번호: '', 택배사: '' }]);
  const inv = ofile([
    { 주문번호: 'B2', 받는사람: '', 운송장번호: '111', 택배사: '' },
    { 주문번호: 'B2', 받는사람: '', 운송장번호: '222', 택배사: '' },
  ]);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 2);
  assert.equal(m.rows[0].운송장번호, '111');
  assert.equal(m.rows[1].운송장번호, '222');
});

test('매칭 없으면 주문 행만 유지', () => {
  const order = ofile([{ 주문번호: 'C3', 받는사람: '박', 운송장번호: '', 택배사: '' }]);
  const inv = ofile([{ 주문번호: 'ZZZ', 받는사람: '', 운송장번호: '999', 택배사: '' }]);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].운송장번호, '');
});

test('unknownHeaders 병합', () => {
  const order = ofile([{ 주문번호: '1', 받는사람: '', 운송장번호: '', 택배사: '' }], ['a']);
  const inv = ofile([{ 주문번호: '1', 받는사람: '', 운송장번호: 'x', 택배사: '' }], ['b', 'a']);
  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.deepEqual(m.unknownHeaders, ['a', 'b']);
});

test('주문번호가 비어 있어도 상품주문번호가 일치하면 송장번호를 병합', () => {
  const order = ofile([
    {
      주문번호: '',
      상품주문번호: '403481828',
      받는사람: '김',
      운송장번호: '',
      택배사: '',
    } as Record<string, string>,
  ]);
  const inv = ofile([
    {
      주문번호: '',
      상품주문번호: '403481828',
      받는사람: '',
      운송장번호: '9988776655',
      택배사: '',
    } as Record<string, string>,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].운송장번호, '9988776655');
});

test('번호 키가 없어도 받는사람+전화+주소가 일치하면 보조 매칭', () => {
  const order = ofile([
    {
      주문번호: '',
      상품주문번호: '',
      받는사람: '홍길동',
      받는사람전화1: '010-1111-2222',
      받는사람주소1: '서울시 강남구 테헤란로 1',
      운송장번호: '',
      택배사: '',
    } as Record<string, string>,
  ]);
  const inv = ofile([
    {
      주문번호: '',
      상품주문번호: '',
      받는사람: '홍 길 동',
      받는사람전화1: '01011112222',
      받는사람주소1: '서울시강남구테헤란로1',
      운송장번호: 'A-TRACK-1',
      택배사: 'CJ대한통운',
    } as Record<string, string>,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows[0].운송장번호, 'A-TRACK-1');
  assert.equal(m.rows[0].택배사, 'CJ대한통운');
});

test('택배 파일에 주문번호·전화·주소가 없어도 받는사람만 유일하면 보조 매칭', () => {
  const order = ofile([
    {
      주문번호: '2026072267270121',
      받는사람: '조은영',
      받는사람전화1: '01050264273',
      받는사람주소1: '경기도 광주시 경충대로 1430',
      운송장번호: '',
      택배사: '',
    } as Record<string, string>,
  ]);
  const inv = ofile([
    {
      주문번호: '',
      받는사람: '조은영',
      운송장번호: '260577467533',
      택배사: '롯데택배',
    } as Record<string, string>,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows[0].운송장번호, '260577467533');
  assert.equal(m.rows[0].택배사, '롯데택배');
  assert.equal(m.rows[0].주문번호, '2026072267270121');
});

test('전화만 유일 일치해도 보조 매칭', () => {
  const order = ofile([
    {
      주문번호: 'O1',
      받는사람: '갑',
      받는사람전화1: '010-9999-8888',
      운송장번호: '',
      택배사: '',
    } as Record<string, string>,
  ]);
  const inv = ofile([
    {
      주문번호: '',
      받는사람: '을',
      받는사람전화1: '01099998888',
      운송장번호: 'PHONE-ONLY-1',
      택배사: '',
    } as Record<string, string>,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows[0].운송장번호, 'PHONE-ONLY-1');
});

test('주소만 부분 일치(포함)인 경우 보조 매칭하지 않음', () => {
  const order = ofile([
    {
      주문번호: 'O2',
      받는사람: '갑',
      받는사람주소1: '서울특별시 강남구 테헤란로 123',
      운송장번호: '',
      택배사: '',
    } as Record<string, string>,
  ]);
  const inv = ofile([
    {
      주문번호: '',
      받는사람: '을',
      받는사람주소1: '서울',
      운송장번호: 'ADDR-FUZZY-1',
      택배사: '',
    } as Record<string, string>,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows[0].운송장번호, '');
});

test('보조 매칭 동점 후보가 2개면 첫 후보로 연결하고 확인 필요', () => {
  const order = ofile([
    {
      주문번호: '',
      상품주문번호: '',
      받는사람: '김민수',
      받는사람전화1: '010-2222-3333',
      받는사람주소1: '경기도 성남시 분당구',
      운송장번호: '',
      택배사: '',
    } as Record<string, string>,
  ]);
  const inv = ofile([
    {
      주문번호: '',
      상품주문번호: '',
      받는사람: '김민수',
      받는사람전화1: '01022223333',
      받는사람주소1: '경기도성남시분당구',
      운송장번호: 'TRACK-1',
      택배사: '',
    } as Record<string, string>,
    {
      주문번호: '',
      상품주문번호: '',
      받는사람: '김민수',
      받는사람전화1: '01022223333',
      받는사람주소1: '경기도성남시분당구',
      운송장번호: 'TRACK-2',
      택배사: '',
    } as Record<string, string>,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rows[0].운송장번호, 'TRACK-1');
  assert.equal(m.rowMatchStatuses[0], 'NEEDS_CONFIRMATION');
});

test('유일 보조 매칭은 확정', () => {
  const order = ofile([
    {
      주문번호: '',
      받는사람: '조은영',
      운송장번호: '',
      택배사: '',
    } as Record<string, string>,
  ]);
  const inv = ofile([
    {
      주문번호: '',
      받는사람: '조은영',
      운송장번호: '260577467533',
      택배사: '롯데택배',
    } as Record<string, string>,
  ]);

  const m = mergeOrderAndInvoiceStandardFiles(order, inv);
  assert.equal(m.rowMatchStatuses[0], 'CONFIDENT');
});
