/**
 * 쇼핑몰 송장 일괄 업로드용 운송장번호 정리 (하이픈·공백 제거)
 */

export function isTrackingNumberUploadHeader(header: string): boolean {
  const normalized = String(header ?? '')
    .replace(/\s/g, '')
    .replace(/\(.*?\)/g, '');
  return normalized === '송장번호' || normalized === '운송장번호';
}

export function sanitizeTrackingNumberForUpload(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s-]/g, '');
}
