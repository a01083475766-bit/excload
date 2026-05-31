import { describe, it, expect } from 'vitest';
import {
  coerceStage2CellValue,
  restoreLeadingZeroForKoreanPhoneDigits,
} from '@/app/lib/excel/coerce-excel-phone';
import { buildPreviewDownloadAoA } from '@/app/lib/excel/preview-download-xlsx';

describe('restoreLeadingZeroForKoreanPhoneDigits', () => {
  it('휴대 010 — 엑셀 숫자 10자리', () => {
    expect(restoreLeadingZeroForKoreanPhoneDigits('1012345678')).toBe('01012345678');
  });

  it('지역 0507 — 엑셀 숫자 10자리', () => {
    expect(restoreLeadingZeroForKoreanPhoneDigits('5071234567')).toBe('05071234567');
  });

  it('수도권 02 — 엑셀 숫자 9자리', () => {
    expect(restoreLeadingZeroForKoreanPhoneDigits('212345678')).toBe('0212345678');
  });

  it('이미 0으로 시작하면 유지', () => {
    expect(restoreLeadingZeroForKoreanPhoneDigits('01012345678')).toBe('01012345678');
  });
});

describe('coerceStage2CellValue', () => {
  it('전화 기준헤더 + 숫자 셀 → 선행 0 복원', () => {
    expect(coerceStage2CellValue(1012345678, '받는사람전화1')).toBe('01012345678');
    expect(coerceStage2CellValue(5071234567, '받는사람전화2')).toBe('05071234567');
    expect(coerceStage2CellValue(212345678, '주문자연락처')).toBe('0212345678');
  });

  it('비전화 필드는 숫자를 그대로 문자열화', () => {
    expect(coerceStage2CellValue(42, '수량')).toBe('42');
  });

  it('하이픈 포함 문자열 전화는 trim만', () => {
    expect(coerceStage2CellValue('010-1234-5678', '받는사람전화1')).toBe('010-1234-5678');
  });
});

describe('buildPreviewDownloadAoA', () => {
  it('미리보기·다운로드 동일 셀 값 (전화 0 유지)', () => {
    const headers = ['받는사람', '받는사람전화1'];
    const rows = [
      {
        rowId: 'r1',
        data: { 받는사람: '홍길동', 받는사람전화1: '01012345678' },
      },
    ];
    const aoa = buildPreviewDownloadAoA(headers, rows, {});
    expect(aoa[1]).toEqual(['홍길동', '01012345678']);
  });
});
