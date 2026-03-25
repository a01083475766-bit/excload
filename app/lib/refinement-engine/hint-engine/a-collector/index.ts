/**
 * A Collector pipeline module
 * Handles collection of confirmed entities and separation of remaining text
 */

import type { InputText } from '@/app/lib/refinement-engine/types/InputText';
import type { EntityResult } from '@/app/lib/refinement-engine/types/EntityResult';

/**
 * A Collector pipeline result type
 * Separates confirmed entities from the remaining text
 */
export type ACollectorResult = {
  /**
   * 확정 엔티티 목록
   * Confirmed entities extracted from the input text
   */
  confirmedEntities: EntityResult<string>[];
  
  /**
   * 잔여 텍스트
   * Remaining text after extracting confirmed entities
   */
  remainingText: string;
};

/**
 * A Collector pipeline interface
 * Processes input text and separates confirmed entities from remaining text
 * 
 * @param input - InputText containing the text to process
 * @returns ACollectorResult with confirmed entities and remaining text
 */
export type ACollectorPipeline = (input: InputText) => ACollectorResult;


