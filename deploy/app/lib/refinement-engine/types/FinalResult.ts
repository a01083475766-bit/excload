/**
 * FinalResult type definition
 * Represents the final output structure after processing through the refinement pipeline
 */

import type { EntityResult } from '@/app/lib/refinement-engine/types/EntityResult';
import type { Recipient, Product, Sender } from '@/app/lib/refinement-engine/types/entities';

export type FinalResult = {
  recipient: EntityResult<Recipient>;
  products: EntityResult<Product>[];
  sender: EntityResult<Sender>;
  quantity: number | null;
  productPreview?: Array<{
    displayName: string;
    displayQuantity: number;
    raw: {
      productName: string;
      quantity: string | null;
      options: string[];
    };
  }>;
  option?: EntityResult<string>;
  confidenceSummary: {
    overall: number;
    recipient?: number;
    products?: number;
    sender?: number;
  };
  ai?: {
    status: 'OK' | 'ERROR';
    product?: string;
    quantity?: number | null;
    option?: string;
    request?: string;
  };
};

