import type { NormalizationResult } from '@/app/lib/refinement-engine/hint-engine/e-prime-ai';

/**
 * rows를 순회하여 name, phone, address, product, quantity, request 필드를 채운 NormalizationResult[] 반환
 * 
 * @param rows - 정규화할 데이터 행 배열
 * @returns NormalizationResult 배열
 */
export function basicNormalize(rows: Record<string, any>[]): NormalizationResult[] {
  return rows.map((row) => {
    const result: NormalizationResult = {
      status: 'OK',
    };

    // name 필드 추출
    if (row.name !== undefined && row.name !== null && row.name !== '') {
      result.name = String(row.name).trim();
    }

    // phone 필드 추출
    if (row.phone !== undefined && row.phone !== null && row.phone !== '') {
      result.phone = String(row.phone).trim();
    }

    // address 필드 추출
    if (row.address !== undefined && row.address !== null && row.address !== '') {
      result.address = String(row.address).trim();
    }

    // product 필드 추출 - parseExcel에서 생성된 값을 그대로 전달 (분석/판단/구조화 금지)
    // [DIAGNOSTIC][BASIC_NORMALIZE_PRODUCT] basicNormalize에서 product 값 추적
    console.log('[DIAGNOSTIC][BASIC_NORMALIZE_PRODUCT]', {
      'row.product': row.product,
      'row.product type': typeof row.product,
      'row.product === undefined': row.product === undefined,
      'row.product === null': row.product === null,
      'row.product === ""': row.product === '',
      'row.products': (row as any).products,
      'row keys': Object.keys(row),
      'row product keys': Object.keys(row).filter(k => {
        const kLower = k.toLowerCase();
        return kLower.includes('product') || kLower.includes('상품') || kLower.includes('item') || kLower.includes('제품');
      }),
    });
    
    if (row.product !== undefined && row.product !== null && row.product !== '') {
      // NormalizationResult.product is optional; compatible assignments
      result.product = String(row.product).trim();
      
      // [DIAGNOSTIC][BASIC_NORMALIZE_PRODUCT_SET] product 값 설정 후 추적
      console.log('[DIAGNOSTIC][BASIC_NORMALIZE_PRODUCT_SET]', {
        'result.product (before)': result.product,
        'result.product (after trim)': result.product,
        'result.product type': typeof result.product,
      });
    } else {
      // [DIAGNOSTIC][BASIC_NORMALIZE_PRODUCT_NOT_SET] product 값이 설정되지 않은 경우 추적
      console.log('[DIAGNOSTIC][BASIC_NORMALIZE_PRODUCT_NOT_SET]', {
        'row.product': row.product,
        'row.product === undefined': row.product === undefined,
        'row.product === null': row.product === null,
        'row.product === ""': row.product === '',
        'result.product': result.product,
        'result.product === undefined': result.product === undefined,
      });
    }

    // quantity 필드 추출 (숫자로 변환 시도)
    if (row.quantity !== undefined && row.quantity !== null && row.quantity !== '') {
      const quantityValue = row.quantity;
      if (typeof quantityValue === 'number') {
        result.quantity = quantityValue;
      } else {
        const parsed = Number(quantityValue);
        result.quantity = isNaN(parsed) ? null : parsed;
      }
    } else {
      result.quantity = null;
    }

    // request 필드 추출
    if (row.request !== undefined && row.request !== null && row.request !== '') {
      result.request = String(row.request).trim();
    }

    // [TRACE_AFTER_BASIC_NORMALIZE] basicNormalize 내부 return 직전
    console.log('[TRACE_AFTER_BASIC_NORMALIZE]', {
      'result.product': result.product,
      'result.products': (result as any).products,
    });

    return result;
  });
}


