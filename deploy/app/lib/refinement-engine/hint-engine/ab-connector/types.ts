/**
 * AB Connector types
 * Defines types for connecting A Collector results to B pipeline results
 */

import type { ACollectorResult } from '@/app/lib/refinement-engine/hint-engine/a-collector';
import type { BPhoneResult, BAddressResult, BNameResult } from '@/app/lib/refinement-engine/hint-engine/b-core/types';

/**
 * AB Connector result type
 * Combines B pipeline results for phone, address, and name
 */
export type ABConnectorResult = {
  phone: BPhoneResult;
  address: BAddressResult;
  name: BNameResult;
};

/**
 * AB Connector pipeline function signature
 * Processes A Collector result and returns combined B pipeline results
 * 
 * @param input - ACollectorResult containing confirmed entities and remaining text
 * @returns ABConnectorResult with phone, address, and name refinement results
 */
export type ABConnectorPipeline = (input: ACollectorResult) => ABConnectorResult;


