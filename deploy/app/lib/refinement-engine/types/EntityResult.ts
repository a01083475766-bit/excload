/**
 * EntityResult type definition
 * Represents the result of entity processing and refinement through the pipeline
 */

import type { EntityHint } from '@/app/lib/refinement-engine/types/EntityHint';

export type EntityResult<T> = {
  candidates: T[];
  selected?: T;
  // confidence may be absent in some intermediate structures; make optional
  // to allow gradual construction without forcing default values.
  confidence?: number;
  hints: EntityHint;
};

