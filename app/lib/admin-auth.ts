/**
 * 관리자 인증 유틸리티
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

/**
 * 관리자 이메일인지 확인
 * 
 * @param email 확인할 이메일
 * @returns 관리자 여부
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  // 문자열 비교 안정성 향상: 공백/대소문자 차이로 인한 오판 방지
  const normalized = email.trim().toLowerCase();
  const singleAdmin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminList = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (singleAdmin && normalized === singleAdmin) {
    return true;
  }

  return adminList.includes(normalized);
}
