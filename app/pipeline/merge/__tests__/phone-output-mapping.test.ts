/**
 * 전화번호 기준헤더가 실제 택배사 출력 양식(Stage3)까지 올바르게 전달되는지 검증하는 회귀 테스트.
 *
 * - 기준헤더 표준: 전화번호는 항상 `받는사람전화1`/`받는사람전화2` (숫자 없는 `받는사람전화`는 기준헤더로 존재하지 않음)
 * - CJ/롯데/로젠 등 실제 업로드 양식의 전화 컬럼 명칭이 제각각이어도 전부 `받는사람전화1`로 매핑되어야 하고,
 *   Stage3(buildPreviewRowFromStandardRow)에서 그 값이 출력 컬럼에 그대로 채워져야 함.
 */
import { describe, it, expect } from 'vitest';
import { mapTemplateToBase } from '@/app/pipeline/template/map-template-to-base';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { buildPreviewRowFromStandardRow } from '@/app/pipeline/merge/build-preview-row';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';

const COURIER_TEMPLATES: Array<{ name: string; headers: string[]; phoneHeader: string }> = [
  {
    name: 'CJ대한통운 일반 B2C',
    headers: [
      '받는분성명',
      '받는분전화번호',
      '받는분기타연락처',
      '받는분우편번호',
      '받는분주소(전체)',
      '품목명',
      '수량',
    ],
    phoneHeader: '받는분전화번호',
  },
  {
    name: '롯데택배 일반',
    headers: [
      '수취인명',
      '수취인전화',
      '수취인휴대폰',
      '수취인우편번호',
      '수취인주소',
      '상품명',
      '상품수량',
    ],
    phoneHeader: '수취인전화',
  },
  {
    name: '로젠택배 일반',
    headers: [
      '받는분이름',
      '받는분전화',
      '받는분핸드폰',
      '받는분주소',
      '품명',
      '수량',
    ],
    phoneHeader: '받는분전화',
  },
];

async function buildBridgeFile(headers: string[]): Promise<TemplateBridgeFile> {
  const mappingResult = await mapTemplateToBase(headers, undefined, `phone-test-${headers.join('|')}`);
  return {
    baseHeaders: [...BASE_HEADERS],
    courierHeaders: headers,
    mappedBaseHeaders: mappingResult.mappedBaseHeaders,
    unknownHeaders: mappingResult.unknownHeaders,
  };
}

describe('전화번호 기준헤더 → 택배사 출력 양식 매핑 검증', () => {
  it.each(COURIER_TEMPLATES)(
    '$name 양식의 전화 컬럼("$phoneHeader")이 받는사람전화1로 매핑되고, 출력 단계에서 값이 정상 반영된다',
    async ({ headers, phoneHeader }) => {
      const template = await buildBridgeFile(headers);
      const phoneIdx = headers.indexOf(phoneHeader);

      // 1. 기준헤더 매핑 확인: 반드시 받는사람전화1 (받는사람전화 X)
      expect(template.mappedBaseHeaders[phoneIdx]).toBe('받는사람전화1');

      // 2. Stage3 출력 확인: 표준행의 받는사람전화1 값이 해당 출력 컬럼에 그대로 들어가야 함
      const standardRow: Record<string, string> = {
        받는사람: '이수취',
        받는사람전화1: '010-1111-2222',
      };
      const previewRow = buildPreviewRowFromStandardRow(standardRow, template, {});

      expect(previewRow[phoneHeader]).toBe('010-1111-2222');
    },
  );

  it('BASE_HEADERS에는 숫자 없는 "받는사람전화"가 존재하지 않는다 (표준은 항상 받는사람전화1/2)', () => {
    expect(BASE_HEADERS.includes('받는사람전화' as any)).toBe(false);
    expect(BASE_HEADERS.includes('받는사람전화1' as any)).toBe(true);
    expect(BASE_HEADERS.includes('받는사람전화2' as any)).toBe(true);
  });
});
