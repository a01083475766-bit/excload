/**
 * 네이버 스마트스토어 샘플 1행 가짜 데이터로 실제 Stage1(map-template-to-base) +
 * Stage2(order-pipeline) 매핑 결과를 end-to-end로 검증하는 회귀 테스트.
 *
 * 2026-07 스마트스토어 헤더 검토에서 발견/수정된 핵심 버그들의 회귀 방지용:
 * - 구매자ID가 받는사람을 덮어쓰는 문제
 * - 통합배송지가 상세배송지를 드랍시키는 문제
 * - 상품번호(노출상품ID)와 판매자 상품코드(상품코드) 혼동 문제
 * - 결제일이 주문일시를 덮어쓰는 문제
 * - 구매자ID/구매자명이 동시에 있을 때 실명이 우선해야 하는 문제
 */
import { describe, it, expect } from 'vitest';
import { run } from '@/app/pipeline/order/order-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';

describe('스마트스토어 샘플 1행 매핑 검증 (수동 확인용)', () => {
  it('기대 결과와 일치해야 한다', async () => {
    const headers = [
      '구매자ID',
      '구매자명',
      '수취인명',
      '수취인연락처1',
      '기본배송지',
      '상세배송지',
      '통합배송지',
      '상품번호',
      '판매자 상품코드',
      '상품명',
      '옵션정보',
      '수량',
      '배송방법',
      '택배사',
      '송장번호',
      '결제일',
      '주문일시',
    ];

    const values = [
      'testbuyer123',
      '김구매',
      '이수취',
      '010-1111-2222',
      '서울시 강남구 테헤란로 1',
      '101동 202호',
      '서울시 강남구 테헤란로 1 101동 202호',
      '999999',
      'SKU-ABC-001',
      '테스트 상품',
      '블랙 / L',
      '2',
      '택배,등기,소포',
      'CJ대한통운',
      '1234567890',
      '2026-07-03 10:00',
      '2026-07-03 09:30',
    ];

    const cleanInputFile: CleanInputFile = {
      headers,
      rows: [values],
      sourceType: 'excel',
    };

    const result = await run(cleanInputFile, 'manual-check-session');
    const row = result.rows[0];

    // 원본 헤더 -> 매핑된 기준헤더 리포트 출력
    const mappingReport = headers.map((h, i) => ({
      original: h,
      value: values[i],
      mappedBase: result._reuseHeaderMapping?.mappedBaseHeaders[i] ?? null,
    }));
    console.log('\n===== 매핑 리포트 =====');
    console.table(mappingReport);
    console.log('\n===== 최종 표준행 (주요 필드) =====');
    console.log({
      받는사람: row['받는사람'],
      받는사람전화1: row['받는사람전화1'],
      받는사람주소1: row['받는사람주소1'],
      받는사람주소2: row['받는사람주소2'],
      상품코드: row['상품코드'],
      노출상품ID: row['노출상품ID'],
      배송방법: row['배송방법'],
      택배사: row['택배사'],
      운송장번호: row['운송장번호'],
      결제일시: row['결제일시'],
      주문일시: row['주문일시'],
      주문자: row['주문자'],
    });
    console.log('unknownHeaders:', result.unknownHeaders);

    // ===== 기대 결과 =====
    expect(row['받는사람']).toBe('이수취');
    expect(row['받는사람전화1']).toBe('010-1111-2222');
    expect(row['받는사람주소1']).toBe('서울시 강남구 테헤란로 1');
    expect(row['받는사람주소2']).toBe('101동 202호');
    expect(row['상품코드']).toBe('SKU-ABC-001');
    expect(row['노출상품ID']).toBe('999999');
    expect(row['배송방법']).toBe('택배,등기,소포');
    expect(row['택배사']).toBe('CJ대한통운');
    expect(row['운송장번호']).toBe('1234567890');
    expect(row['결제일시']).toBe('2026-07-03 10:00');
    expect(row['주문일시']).toBe('2026-07-03 09:30');
    // 구매자ID(식별자)와 구매자명(실명)이 둘 다 있으면 실명이 주문자 슬롯을 차지해야 함
    expect(row['주문자']).toBe('김구매');

    // ===== 절대 나오면 안 되는 결과 =====
    expect(row['받는사람']).not.toBe('testbuyer123');
    expect(row['상품코드']).not.toBe('999999');
    expect(row['받는사람주소2']).not.toBe('서울시 강남구 테헤란로 1');
    expect(row['받는사람주소2']).not.toBe(''); // 상세배송지 드랍 방지
    expect(row['주문일시']).not.toBe('2026-07-03 10:00'); // 결제일이 주문일시를 덮어쓰면 안 됨
    expect(row['주문자']).not.toBe('testbuyer123'); // ID가 실명을 밀어내면 안 됨
  });
});
