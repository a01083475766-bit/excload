/**
 * B pipeline output schema types
 * Defines the output structure for phone, address, and name refinement results
 * Each entity type is defined independently without dependencies on other entities
 */

/**
 * Phone refinement result output schema for B pipeline
 * Contains phone number candidates, selected value, confidence, and original text reference
 */
export type BPhoneResult = {
  /** Phone number candidates extracted from the input text */
  candidates: string[];
  /** Selected phone number (if any) */
  selected?: string;
  /** Confidence score for the phone number extraction */
  confidence: number;
  /** Original text reference: the original input text from which this phone was extracted */
  originalText: string;
  /** Start index in the original text where the phone number was found (if selected) */
  originalStartIndex?: number;
  /** End index in the original text where the phone number was found (if selected) */
  originalEndIndex?: number;
};

/**
 * Address refinement result output schema for B pipeline
 * Contains address candidates, selected value, confidence, and original text reference
 */
export type BAddressResult = {
  /** Address candidates extracted from the input text */
  candidates: string[];
  /** Selected address (if any) */
  selected?: string;
  /** Confidence score for the address extraction */
  confidence: number;
  /** Original text reference: the original input text from which this address was extracted */
  originalText: string;
  /** Start index in the original text where the address was found (if selected) */
  originalStartIndex?: number;
  /** End index in the original text where the address was found (if selected) */
  originalEndIndex?: number;
};

/**
 * Name refinement result output schema for B pipeline
 * Contains name candidates, selected value, confidence, and original text reference
 */
export type BNameResult = {
  /** Name candidates extracted from the input text */
  candidates: string[];
  /** Selected name (if any) */
  selected?: string;
  /** Confidence score for the name extraction */
  confidence: number;
  /** Original text reference: the original input text from which this name was extracted */
  originalText: string;
  /** Start index in the original text where the name was found (if selected) */
  originalStartIndex?: number;
  /** End index in the original text where the name was found (if selected) */
  originalEndIndex?: number;
};


