import { describe, expect, it } from 'vitest';
import { ALIAS_DICTIONARY } from '../../base/alias-dictionary';
import { buildTrialBridgeFile } from '@/app/logistics-convert/trial-sample-formats';
import { buildPreviewRowFromStandardRow } from '../build-preview-row';
import {
  buildPreviewDownloadAoA,
  createPreviewDownloadWorkbook,
} from '@/app/lib/excel/preview-download-xlsx';
import { createEmptyBaseHeaderRow } from '../../base/base-headers';
import type { StandardOrderRow } from '../../order/order-pipeline';

/** 롯데 ALLOGIS 기본형 14열 */
const LOTTE_ALLOGIS_HEADERS = [
  '받는사람성명',
  '받는사람전화번호',
  '받는사람휴대폰',
  '받는사람우편번호',
  '받는사람주소',
  '품목명',
  '수량',
  '배송메세지1',
  '배송메세지2',
  '배송메세지3',
  '고객주문번호',
  '박스타입',
  '지점코드',
  '운임구분',
] as const;

describe('롯데 ALLOGIS 기본형 — 매핑·출력·다운로드', () => {
  const bridge = buildTrialBridgeFile([...LOTTE_ALLOGIS_HEADERS]);

  it('배송메세지2/3은 별칭 사전에 없다', () => {
    expect(ALIAS_DICTIONARY['배송메세지2']).toBeUndefined();
    expect(ALIAS_DICTIONARY['배송메세지3']).toBeUndefined();
  });

  it('박스타입은 별칭 사전·기준헤더에 없다', () => {
    expect(ALIAS_DICTIONARY['박스타입']).toBeUndefined();
    expect(bridge.mappedBaseHeaders[LOTTE_ALLOGIS_HEADERS.indexOf('박스타입')]).toBeNull();
  });

  it('지점코드는 센터코드로 매핑된다', () => {
    const idx = LOTTE_ALLOGIS_HEADERS.indexOf('지점코드');
    expect(bridge.mappedBaseHeaders[idx]).toBe('센터코드');
  });

  it('미매핑·빈 주문 시 배송메세지2/3·박스타입·지점코드는 빈칸', () => {
    const standardRow = createEmptyBaseHeaderRow() as StandardOrderRow;
    standardRow['받는사람'] = '홍길동';
    standardRow['받는사람전화1'] = '010-1234-5678';
    standardRow['받는사람주소1'] = '서울시 강남구';
    standardRow['상품명'] = '테스트상품';
    standardRow['수량'] = '2';
    standardRow['배송메시지'] = '문앞';

    const preview = buildPreviewRowFromStandardRow(standardRow, bridge, {});

    expect(preview['배송메세지1']).toBe('문앞');
    expect(preview['배송메세지2']).toBe('');
    expect(preview['배송메세지3']).toBe('');
    expect(preview['박스타입']).toBe('');
    expect(preview['지점코드']).toBe('');
  });

  it('박스타입은 택배 열 고정입력으로 채울 수 있다', () => {
    const standardRow = createEmptyBaseHeaderRow() as StandardOrderRow;
    standardRow['받는사람'] = '홍길동';

    const preview = buildPreviewRowFromStandardRow(standardRow, bridge, {
      박스타입: 'A',
    });

    expect(preview['박스타입']).toBe('A');
  });

  it('박스타입·지점코드가 비어 있어도 다운로드 xlsx 생성 가능', () => {
    const rows = [
      {
        rowId: 'r1',
        data: Object.fromEntries(
          LOTTE_ALLOGIS_HEADERS.map((h) => [h, h === '받는사람성명' ? '홍길동' : '']),
        ),
      },
    ];
    const aoa = buildPreviewDownloadAoA(LOTTE_ALLOGIS_HEADERS, rows, {});
    expect(aoa[0]).toEqual([...LOTTE_ALLOGIS_HEADERS]);
    expect(aoa[1]![LOTTE_ALLOGIS_HEADERS.indexOf('박스타입')]).toBe('');
    expect(aoa[1]![LOTTE_ALLOGIS_HEADERS.indexOf('지점코드')]).toBe('');

    const wb = createPreviewDownloadWorkbook(aoa);
    expect(wb.SheetNames).toContain('Sheet1');
  });
});
