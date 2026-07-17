import type { HealthErrorCategory, HealthStatus } from './types';

/**
 * 외부 API 오류를 공통 상태(HealthStatus)로 분류한다.
 * 쇼핑몰별 어댑터는 자신의 원본 오류(HTTP status, 게이트웨이 코드, 메시지)를 넘겨
 * 공통 카테고리로 변환한다.
 */
export function categorizeApiError(input: {
  httpStatus?: number;
  /** 게이트웨이/플랫폼 코드 (예: "GW.AUTHN", "GW.IP_NOT_ALLOWED"). */
  code?: string;
  /** 원본 메시지(분류 힌트용). */
  message?: string;
}): HealthErrorCategory {
  const code = (input.code ?? '').toUpperCase();
  const text = (input.message ?? '').toLowerCase();
  const status = input.httpStatus;

  // 1) 명시적 게이트웨이/플랫폼 코드 우선
  if (code.includes('GW.AUTHN')) return 'AUTH_REQUIRED';
  if (code.includes('IP_NOT_ALLOWED') || code.includes('GW.IP')) return 'IP_NOT_ALLOWED';
  if (code.includes('RATE_LIMIT') || code.includes('QUOTA')) return 'RATE_LIMITED';
  if (code.includes('AUTHZ') || code.includes('FORBIDDEN')) return 'PERMISSION_DENIED';

  // 2) 호출 제한/서버 지연 → 일시적
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408 || (typeof status === 'number' && status >= 500)) return 'TEMPORARY_ERROR';

  // 3) IP 미등록
  if (
    text.includes('not allowed ip') ||
    text.includes('ip is not') ||
    text.includes('ip address') ||
    text.includes('허용되지') ||
    text.includes('ip 미등록') ||
    text.includes('아이피')
  ) {
    return 'IP_NOT_ALLOWED';
  }

  // 4) 승인 대기/미승인
  if (
    text.includes('approval') ||
    text.includes('승인 대기') ||
    text.includes('미승인') ||
    text.includes('반영 대기') ||
    text.includes('pending')
  ) {
    return 'APPROVAL_REQUIRED';
  }

  // 5) 권한 부족
  if (
    text.includes('permission') ||
    text.includes('scope') ||
    text.includes('권한') ||
    (status === 403 && !text.includes('ip'))
  ) {
    return 'PERMISSION_DENIED';
  }

  // 6) 계정 설정 문제 (키/판매자번호/URL/서버 환경변수/만료된 키)
  if (
    text.includes('expired') ||
    text.includes('만료') ||
    text.includes('invalid credential') ||
    text.includes('credential') ||
    text.includes('secret') ||
    text.includes('vendor') ||
    text.includes('seller id') ||
    text.includes('업체코드') ||
    text.includes('판매자') ||
    text.includes('env') ||
    text.includes('환경 변수') ||
    text.includes('환경변수') ||
    text.includes('설정')
  ) {
    return 'ACCOUNT_CONFIG_ERROR';
  }

  // 7) 인증 실패(위 세부 분류에 안 걸린 401)
  if (status === 401) return 'AUTH_REQUIRED';

  // 8) 요청 파라미터/조건 오류 (연결 상태를 나쁘게 만들지 않는다)
  if (
    text.includes('유효하지 않') ||
    text.includes('invalid') ||
    text.includes('parameter') ||
    text.includes('날짜') ||
    text.includes('조회 조건') ||
    text.includes('조회 기간') ||
    status === 400
  ) {
    return 'REQUEST_INVALID';
  }

  return 'UNKNOWN';
}

/** 일시적 오류(연결 끊김으로 바로 처리하지 않음). */
export function isTransientCategory(status: HealthStatus): boolean {
  return status === 'RATE_LIMITED' || status === 'TEMPORARY_ERROR';
}

/** 사용자의 즉시 조치가 필요한 오류. */
export function isImmediateActionCategory(status: HealthStatus): boolean {
  return (
    status === 'AUTH_REQUIRED' ||
    status === 'IP_NOT_ALLOWED' ||
    status === 'PERMISSION_DENIED' ||
    status === 'APPROVAL_REQUIRED' ||
    status === 'ACCOUNT_CONFIG_ERROR'
  );
}

/**
 * 이 상태가 "연결 건강"을 악화시키는가?
 * - HEALTHY: 성공
 * - REQUEST_INVALID: 요청 파라미터 문제이므로 연결 상태를 악화시키지 않는다(중립).
 * - 그 외: 실패로 간주.
 */
export function worsensConnection(status: HealthStatus): boolean {
  return status !== 'HEALTHY' && status !== 'REQUEST_INVALID';
}
