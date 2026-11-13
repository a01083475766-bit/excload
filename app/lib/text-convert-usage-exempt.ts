/**
 * 텍스트 변환 사용량 차감 제외 계정.
 * 차감 API 대기 없이 변환 결과를 바로 쓰게 하려는 지정 회원만 해당한다.
 * 엑셀 다운로드 차감은 이 목록과 무관하다.
 */
const TEXT_CONVERT_USAGE_EXEMPT_EMAILS = new Set(['ksl3399@naver.com']);

export function isTextConvertUsageExemptEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEXT_CONVERT_USAGE_EXEMPT_EMAILS.has(email.trim().toLowerCase());
}
