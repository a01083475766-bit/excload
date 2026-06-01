import { describe, expect, it } from 'vitest';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { reapplyFixedInputToPreviewRows } from '@/app/lib/reapply-fixed-input-preview';

const template: TemplateBridgeFile = {
  courierHeaders: ['받는분성명', '보내는분성명', '배송메시지1'],
  mappedBaseHeaders: ['받는사람', '보내는사람', '배송메시지'],
};

describe('reapplyFixedInputToPreviewRows', () => {
  it('스냅샷이 있으면 주문값은 유지하고 고정 채움 열만 갱신한다', () => {
    const rowId = 'r1';
    const previewRows = [
      {
        rowId,
        data: {
          받는분성명: '이영희',
          보내는분성명: '홍길동',
          배송메시지1: '문앞',
        },
      },
    ];
    const orderSnapshotsByRowId = {
      [rowId]: {
        받는사람: '이영희',
        보내는사람: '',
        배송메시지: '',
      },
    };

    const next = reapplyFixedInputToPreviewRows({
      previewRows,
      orderSnapshotsByRowId,
      template,
      fixedInput: {
        보내는분성명: '김철수',
        배송메시지1: '먼저 전화주세요',
      },
      previousFixedInput: {
        보내는분성명: '홍길동',
        배송메시지1: '문앞',
      },
    });

    expect(next[0]!.data.받는분성명).toBe('이영희');
    expect(next[0]!.data.보내는분성명).toBe('김철수');
    expect(next[0]!.data.배송메시지1).toBe('먼저 전화주세요');
  });

  it('userOverrides가 있는 셀은 덮어쓰지 않는다', () => {
    const rowId = 'r1';
    const previewRows = [
      {
        rowId,
        data: { 보내는분성명: '홍길동' },
      },
    ];

    const next = reapplyFixedInputToPreviewRows({
      previewRows,
      orderSnapshotsByRowId: {
        [rowId]: { 보내는사람: '' },
      },
      template: {
        courierHeaders: ['보내는분성명'],
        mappedBaseHeaders: ['보내는사람'],
      },
      fixedInput: { 보내는분성명: '김철수' },
      previousFixedInput: { 보내는분성명: '홍길동' },
      userOverrides: { [rowId]: { 보내는분성명: '수동입력' } },
    });

    expect(next[0]!.data.보내는분성명).toBe('수동입력');
  });

  it('스냅샷 없을 때 이전 고정값과 같은 셀만 갱신한다', () => {
    const previewRows = [
      {
        rowId: 'r1',
        data: {
          받는분성명: '이영희',
          보내는분성명: '홍길동',
        },
      },
    ];

    const next = reapplyFixedInputToPreviewRows({
      previewRows,
      orderSnapshotsByRowId: {},
      template: {
        courierHeaders: ['받는분성명', '보내는분성명'],
        mappedBaseHeaders: ['받는사람', '보내는사람'],
      },
      fixedInput: { 보내는분성명: '김철수' },
      previousFixedInput: { 보내는분성명: '홍길동' },
    });

    expect(next[0]!.data.받는분성명).toBe('이영희');
    expect(next[0]!.data.보내는분성명).toBe('김철수');
  });
});
