/**
 * Entity type definitions
 * Represents the core entity structures used in the refinement pipeline
 */

export type Recipient = {
  name: string | null;
  phone: string | null;
  address: string | null;
};

export type Sender = {
  name: string | null;
  phone: string | null;
  address: string | null;
};

import type { RequestWithType } from '@/app/lib/refinement-engine/types/RequestWithType';

export type Product = {
  name: string;
  quantity: number | null;
  option?: string;
  options?: string[];
  // requests can be simple strings or typed request objects produced by
  // product hint resolvers. Accept both shapes for compatibility.
  requests?: Array<string | RequestWithType>;
};

