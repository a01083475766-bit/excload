/**
 * E Product Interpreter pipeline module
 * Handles product interpretation from D pipeline output
 */

import type { DProductTextResult } from '@/app/lib/refinement-engine/hint-engine/d-product-text';

/**
 * Product Interpretation Result type
 * Represents the intermediate structure for product interpretation
 */
export type ProductInterpretationResult = {
  /**
   * Product tokens (tokenized from productText with spaces and particles removed)
   */
  productTokens: string[];
  
  /**
   * Option tokens (tokenized from optionText with spaces and particles removed)
   */
  optionTokens: string[];
  
  /**
   * Quantity hint (pass-through from DProductTextResult)
   */
  quantityHint: string;
};

/**
 * Korean particles (조사) to remove from tokens
 * Common particles that should be stripped from the end of words
 */
const KOREAN_PARTICLES = [
  // 주격 조사
  '이', '가', '께서',
  // 목적격 조사
  '을', '를',
  // 부사격 조사
  '에', '에서', '으로', '로', '와', '과', '의', '도', '만', '부터', '까지', '처럼', '만큼', '보다', '같이',
  // 보조사
  '은', '는', '조차', '마저', '에게', '한테', '께',
];

/**
 * Removes Korean particles from the end of a word
 * @param word - Word to remove particles from
 * @returns Word with particles removed
 */
function removeParticles(word: string): string {
  let result = word;
  
  // Sort particles by length (longer first) to match longer particles first
  const sortedParticles = [...KOREAN_PARTICLES].sort((a, b) => b.length - a.length);
  
  for (const particle of sortedParticles) {
    if (result.endsWith(particle)) {
      result = result.slice(0, -particle.length);
      break; // Only remove one particle (the longest matching one)
    }
  }
  
  return result;
}

/**
 * Tokenizes text by splitting on spaces and removing particles
 * @param text - Text to tokenize
 * @returns Array of tokens with particles removed
 */
function tokenizeText(text: string): string[] {
  // Split by spaces
  const tokens = text.split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);
  
  // Remove particles from each token
  const cleanedTokens = tokens
    .map(token => removeParticles(token))
    .filter(token => token.length > 0);
  
  return cleanedTokens;
}

/**
 * E Product Interpreter pipeline function
 * Interprets D pipeline output (productText, optionText, requestText, quantityHint)
 * to produce an intermediate interpretation structure
 * 
 * @param dProductTextResult - DProductTextResult containing productText, optionText, requestText, quantityHint
 * @returns ProductInterpretationResult with interpreted product information
 */
export default function runEProductInterpreterPipeline(
  dProductTextResult: DProductTextResult
): ProductInterpretationResult {
  // Step 1: Tokenize productText and optionText (remove spaces and particles)
  const productTokens = tokenizeText(dProductTextResult.productText);
  const optionTokens = tokenizeText(dProductTextResult.optionText);
  
  // Pass through quantityHint without any calculation or confirmation logic
  const quantityHint = dProductTextResult.quantityHint;
  
  return {
    productTokens,
    optionTokens,
    quantityHint,
  };
}

