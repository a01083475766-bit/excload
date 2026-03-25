/**
 * Name refinement pipeline module
 * Handles name processing and refinement operations
 */

export * from '@/app/lib/refinement-engine/hint-engine/name/refine';

import type { InputText } from '@/app/lib/refinement-engine/types/InputText';
import type { EntityResult } from '@/app/lib/refinement-engine/types/EntityResult';

// Export types
export type NameRefinementType = {};

// Export function signatures
export declare function refineName(
  input: InputText,
  phoneResult?: EntityResult<string>,
  addressResult?: EntityResult<string>
): EntityResult<string>;

