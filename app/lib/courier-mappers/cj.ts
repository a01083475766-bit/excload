/**
 * CJ Courier Mapper
 * Maps NormalizedBatch to CJ upload format (CJRow[])
 */

import type { EnglishNormalizationRow } from '@/app/lib/refinement-engine/hint-engine/e-prime-ai';

/**
 * NormalizedBatch type
 * Array of normalized results
 */
export type NormalizedBatch = EnglishNormalizationRow[];

/**
 * CJRow type
 * Array of strings representing a single row for CJ upload
 * Format: [받는사람명, 받는사람전화, 받는사람주소, 상품명, 수량, 배송메시지]
 */
export type CJRow = [string, string, string, string, string, string];

/**
 * Maps NormalizedBatch to CJ upload format
 * 
 * @param batch - Array of normalized results
 * @returns Array of CJ rows, each row contains: [받는사람명, 받는사람전화, 받는사람주소, 상품명, 수량, 배송메시지]
 */
export function mapCJ(batch: NormalizedBatch): CJRow[] {
  return batch.map((item) => {
    // 받는사람명
    const name = item.name ?? '';
    
    // 받는사람전화
    const phone = item.phone ?? '';
    
    // 받는사람주소
    const address = item.address ?? '';
    
    // 상품명
    const product = item.product ?? '';
    
    // 수량 (number | null -> string)
    const quantity = item.quantity != null ? String(item.quantity) : '';
    
    // 배송메시지
    const request = item.request ?? '';
    
    return [name, phone, address, product, quantity, request];
  });
}


