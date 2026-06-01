/**
 * 체험판 IP·브라우저 진입 한도 (가입 후·다계정 어뷰즈 완화용).
 * 랜딩 무료체험(/excload, /trial)에는 TrialAccessGate를 쓰지 않습니다.
 * 체험 텍스트 변환 한도는 브라우저 sessionStorage 2,000(글자 수 차감)으로만 제한합니다.
 */

/** `false`면 TrialAccessGate·/api/trial/allow IP 카운트 비활성. */
export const TRIAL_ACCESS_LIMITS_ENABLED = true;

export const TRIAL_ACCESS_MAX_PER_BROWSER = 5;
export const TRIAL_ACCESS_MAX_PER_IP = 5;

/** 개발·로컬에서만: 이 호스트면 브라우저 localStorage 카운트를 적용하지 않음 */
export function isTrialLocalhostHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export const TRIAL_LS_BROWSER_COUNT = 'excload_trial_browser_sessions_v1';
/** 같은 탭에서 새로고침 시 API·카운트 중복 방지 */
export const TRIAL_SS_SESSION_PASSED = 'excload_trial_gate_passed_v1';
