/**
 * C Product pipeline module
 * Handles product/option/request processing and refinement operations
 * 
 * ⚠️ 중요 규칙 (Important Rule):
 * 이 파이프는 상품/옵션/요청사항에 대한 판단·분리·확정을 절대 수행하지 않으며,
 * 상품 로직은 반드시 D 파이프 이후에서만 처리한다.
 * 
 * This pipeline absolutely does not perform judgment/separation/confirmation 
 * for products/options/requirements, and product logic must only be processed 
 * after the D pipeline.
 */

import type { ABConnectorResult } from '@/app/lib/refinement-engine/hint-engine/ab-connector/types';
import type { MaskRange } from '@/app/lib/refinement-engine/utils/maskRanges';

/**
 * C Product result type
 * Represents the result of product pipeline processing
 */
export type CProductResult = {
  /**
   * AB Connector result (pass-through)
   * The original ABConnectorResult passed through without modification
   */
  abConnectorResult: ABConnectorResult;
  
  /**
   * Remaining text (pass-through)
   * The original remainingText passed through without modification
   */
  remainingText: string;
  
  /**
   * Product mask ranges
   * Array of mask ranges for PRODUCT entity covering the entire remainingText
   */
  productMaskRanges: MaskRange[];
};

/**
 * Removes greeting and courtesy phrases from text
 * Removes phrases like "안녕하세요", "안녕", "감사합니다", "문의드립니다", "주문합니다" etc.
 * 
 * @param text - Text to clean
 * @returns Text with greeting/courtesy phrases removed
 */
function removeGreetingPhrases(text: string): string {
  if (!text) return text;
  
  // Pattern to match greeting/courtesy phrases at the start or end of text
  // Includes: 안녕하세요, 안녕, 감사합니다, 문의드립니다, 주문합니다, etc.
  const greetingPattern = /^(안녕하세요|안녕|감사합니다|문의드립니다|주문합니다)[\s,\.]*/i;
  const endingPattern = /[\s,\.]*(안녕하세요|안녕|감사합니다|문의드립니다|주문합니다)[\s,\.]*$/i;
  
  let cleaned = text;
  
  // Remove from start
  cleaned = cleaned.replace(greetingPattern, '');
  
  // Remove from end
  cleaned = cleaned.replace(endingPattern, '');
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * C Product pipeline function signature
 * Processes ABConnectorResult and remainingText to extract product information
 * 
 * ⚠️ 중요 규칙 (Important Rule):
 * 이 파이프는 상품/옵션/요청사항에 대한 판단·분리·확정을 절대 수행하지 않으며,
 * 상품 로직은 반드시 D 파이프 이후에서만 처리한다.
 * 
 * This pipeline absolutely does not perform judgment/separation/confirmation 
 * for products/options/requirements, and product logic must only be processed 
 * after the D pipeline.
 * 
 * @param abConnectorResult - ABConnectorResult containing phone, address, and name refinement results
 * @param remainingText - Remaining text from ACollectorResult after entity extraction
 * @returns CProductResult with product/option/request information (currently pass-through)
 */
export function runCProductPipeline(
  abConnectorResult: ABConnectorResult,
  remainingText: string
): CProductResult {
  // Preprocess: remove greeting/courtesy phrases from remainingText
  const cleanedRemainingText = removeGreetingPhrases(remainingText);
  
  // Create PRODUCT maskRange for entire remainingText (pass-through, no separation/scoring/option judgment)
  const productMaskRanges: MaskRange[] = cleanedRemainingText
    ? [
        {
          startIndex: 0,
          endIndex: cleanedRemainingText.length,
          entityType: 'PRODUCT',
        },
      ]
    : [];
  
  // Pass-through implementation (no product/option/request logic yet)
  return {
    abConnectorResult,
    remainingText: cleanedRemainingText,
    productMaskRanges,
  };
}

