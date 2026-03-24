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
  
  // akman 관리자 이메일 또는 환경 변수의 ADMIN_EMAIL과 일치하는지 확인
  return (
    email === 'akman@excload.com' ||
    email === process.env.ADMIN_EMAIL
  );
}
