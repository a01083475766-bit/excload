/**
 * Order CSV Export Module
 * Exports FinalResult data to CSV format with platform-specific column mappings
 */

import type { FinalResult } from '@/app/lib/refinement-engine/types/FinalResult';

/**
 * Supported export platforms
 */
export type ExportPlatform = 'naver' | 'smartstore' | 'coupang' | 'default';

/**
 * Common field names used across all platforms
 */
type CommonFields = {
  recipient: string;
  phone: string;
  address: string;
  product: string;
  option: string;
  request: string;
  quantity: string;
};

/**
 * Platform-specific column mapping preset
 * Maps common fields to platform-specific column names
 */
type PlatformColumnMapping = {
  [K in keyof CommonFields]: string;
};

/**
 * Platform column mapping presets
 * Defines how common fields map to platform-specific column names
 * 
 * TODO:
 * 플랫폼별 CSV 컬럼 매핑 로직은
 * 상품/옵션/수량 확정(E 파이프) 이후 구현 예정
 * 현재는 export 구조만 유지
 */
const PLATFORM_COLUMN_MAPPINGS: Record<ExportPlatform, PlatformColumnMapping> = {
  naver: {
    recipient: '', // TODO: Map to Naver Shopping recipient column name
    phone: '', // TODO: Map to Naver Shopping phone column name
    address: '', // TODO: Map to Naver Shopping address column name
    product: '', // TODO: Map to Naver Shopping product column name
    option: '', // TODO: Map to Naver Shopping option column name
    request: '', // TODO: Map to Naver Shopping request column name
    quantity: '', // TODO: Map to Naver Shopping quantity column name
  },
  smartstore: {
    recipient: '', // TODO: Map to Smart Store recipient column name
    phone: '', // TODO: Map to Smart Store phone column name
    address: '', // TODO: Map to Smart Store address column name
    product: '', // TODO: Map to Smart Store product column name
    option: '', // TODO: Map to Smart Store option column name
    request: '', // TODO: Map to Smart Store request column name
    quantity: '', // TODO: Map to Smart Store quantity column name
  },
  coupang: {
    recipient: '', // TODO: Map to Coupang recipient column name
    phone: '', // TODO: Map to Coupang phone column name
    address: '', // TODO: Map to Coupang address column name
    product: '', // TODO: Map to Coupang product column name
    option: '', // TODO: Map to Coupang option column name
    request: '', // TODO: Map to Coupang request column name
    quantity: '', // TODO: Map to Coupang quantity column name
  },
  default: {
    recipient: 'recipient',
    phone: 'phone',
    address: 'address',
    product: 'product',
    option: 'option',
    request: 'request',
    quantity: 'quantity',
  },
};

/**
 * Extracts common field values from FinalResult
 * @param finalResult - FinalResult structure containing recipient, products, etc.
 * @returns CommonFields object with extracted values
 */
function extractCommonFields(finalResult: FinalResult): CommonFields {
  const recipient = finalResult.recipient.candidates[0]?.name ?? '';
  const phone = finalResult.recipient.candidates[0]?.phone ?? '';
  const address = finalResult.recipient.candidates[0]?.address ?? '';
  
  // Extract product names (first product or concatenated if multiple)
  const product = finalResult.products
    .map((p) => p.candidates[0]?.name ?? '')
    .filter(Boolean)
    .join(', ') || '';
  
  // Extract product options (first product option or concatenated if multiple)
  const option = finalResult.products
    .map((p) => p.candidates[0]?.option ?? '')
    .filter(Boolean)
    .join(', ') || '';
  
  // TODO: Extract request field from FinalResult or input text
  const request = '';

  // Extract product quantities (concatenated if multiple)
  const quantity = finalResult.products
    .map((p) => p.candidates[0]?.quantity?.toString() ?? '')
    .filter(Boolean)
    .join(', ') || '';

  return {
    recipient,
    phone,
    address,
    product,
    option,
    request,
    quantity,
  };
}

/**
 * Maps common fields to platform-specific column names
 * @param commonFields - Common field values
 * @param platform - Target export platform
 * @returns Object with platform-specific column names as keys
 */
function mapToPlatformColumns(
  commonFields: CommonFields,
  platform: ExportPlatform
): Record<string, string> {
  const mapping = PLATFORM_COLUMN_MAPPINGS[platform];
  
  // TODO: Implement actual mapping logic based on platform requirements
  // This should handle:
  // - Column name transformations
  // - Value formatting per platform
  // - Additional platform-specific fields
  // - Data validation and sanitization
  
  return {
    [mapping.recipient]: commonFields.recipient,
    [mapping.phone]: commonFields.phone,
    [mapping.address]: commonFields.address,
    [mapping.product]: commonFields.product,
    [mapping.option]: commonFields.option,
    [mapping.request]: commonFields.request,
    [mapping.quantity]: commonFields.quantity,
  };
}

/**
 * Converts data object to CSV row string
 * @param headers - Array of column headers
 * @param rowData - Object with column names as keys
 * @returns CSV row string
 */
function convertToCsvRow(headers: string[], rowData: Record<string, string>): string {
  return headers
    .map((header) => {
      const value = rowData[header] ?? '';
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    })
    .join(',');
}

/**
 * Exports FinalResult to CSV format
 * @param finalResult - FinalResult structure to export
 * @param platform - Target export platform (default: 'default')
 * @returns CSV string with headers and data rows
 */
export function exportOrderCsv(
  finalResult: FinalResult,
  platform: ExportPlatform = 'default'
): string {
  // Extract common fields from FinalResult
  const commonFields = extractCommonFields(finalResult);

  // Get platform-specific column mapping
  const mapping = PLATFORM_COLUMN_MAPPINGS[platform];

  // Build headers array from platform mapping
  const headers = [
    mapping.recipient,
    mapping.phone,
    mapping.address,
    mapping.product,
    mapping.option,
    mapping.request,
    mapping.quantity,
  ].filter(Boolean); // Remove empty strings

  // Map common fields to platform columns
  const rowData = mapToPlatformColumns(commonFields, platform);

  // Generate CSV
  const csvHeaders = headers.join(',');
  const csvRow = convertToCsvRow(headers, rowData);

  return `${csvHeaders}\n${csvRow}`;
}

/**
 * Exports multiple FinalResult entries to CSV format
 * @param finalResults - Array of FinalResult structures to export
 * @param platform - Target export platform (default: 'default')
 * @returns CSV string with headers and multiple data rows
 */
export function exportOrderCsvBatch(
  finalResults: FinalResult[],
  platform: ExportPlatform = 'default'
): string {
  if (finalResults.length === 0) {
    return '';
  }

  // Extract common fields from first result to determine headers
  const firstResult = finalResults[0];
  const mapping = PLATFORM_COLUMN_MAPPINGS[platform];

  const headers = [
    mapping.recipient,
    mapping.phone,
    mapping.address,
    mapping.product,
    mapping.option,
    mapping.request,
    mapping.quantity,
  ].filter(Boolean);

  // Generate CSV rows for all results
  const csvRows = finalResults.map((result) => {
    const commonFields = extractCommonFields(result);
    const rowData = mapToPlatformColumns(commonFields, platform);
    return convertToCsvRow(headers, rowData);
  });

  const csvHeaders = headers.join(',');
  return `${csvHeaders}\n${csvRows.join('\n')}`;
}

