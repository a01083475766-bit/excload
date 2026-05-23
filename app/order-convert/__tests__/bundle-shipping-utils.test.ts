import { describe, expect, test } from 'vitest';
import {
  detectBundleShippingGroups,
  normalizeRecipientPhone,
} from '@/app/order-convert/bundle-shipping-utils';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import type { PreviewRowWithId } from '@/app/order-convert/OrderConvertPreviewTableRow';

const template: TemplateBridgeFile = {
  baseHeaders: [],
  courierHeaders: ['수령자명', '수령자연락처', '배송지주소', '상품명'],
  mappedBaseHeaders: ['받는사람', '받는사람전화1', '받는사람주소1', '상품명'],
  unknownHeaders: [],
};

function row(id: string, name: string, phone: string, addr: string): PreviewRowWithId {
  return {
    rowId: id,
    data: {
      수령자명: name,
      수령자연락처: phone,
      배송지주소: addr,
      상품명: '상품',
    },
  };
}

describe('bundle-shipping-utils', () => {
  test('normalizeRecipientPhone strips non-digits', () => {
    expect(normalizeRecipientPhone('010-9350-4622')).toBe('01093504622');
  });

  test('detects duplicate recipient groups', () => {
    const rows = [
      row('a', '신표범님', '010-9350-4622', '청송군 청송읍 금벽로41'),
      row('b', '신표범', '01093504622', '청송군 청송읍 금벽로 41'),
      row('c', '다른사람', '010-1111-2222', '서울시'),
    ];
    const { groups } = detectBundleShippingGroups(rows, template.courierHeaders, template, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].rowIds.sort()).toEqual(['a', 'b']);
  });
});
