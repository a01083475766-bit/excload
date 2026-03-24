/**
 * Courier Mappers Index
 * Provides getCourierMapper function to get the appropriate mapper based on courier type
 */

import { mapCJ, type NormalizedBatch } from './cj';

export type CourierType = 'CJ' | 'POST' | 'LOTTE';

/**
 * Returns the appropriate courier mapper function based on courier type
 * 
 * @param courierType - Type of courier ('CJ' | 'POST' | 'LOTTE')
 * @returns Mapper function for the specified courier type
 */
export function getCourierMapper(courierType: CourierType) {
  switch (courierType) {
    case 'CJ':
      return mapCJ;
    case 'POST':
      // TODO: Implement POST courier mapper
      throw new Error('POST courier mapper is not yet implemented');
    case 'LOTTE':
      // TODO: Implement LOTTE courier mapper
      throw new Error('LOTTE courier mapper is not yet implemented');
    default:
      const _exhaustive: never = courierType;
      throw new Error(`Unknown courier type: ${_exhaustive}`);
  }
}

// Re-export types and functions from CJ mapper for convenience
export { mapCJ, type NormalizedBatch, type CJRow } from './cj';


