/** 체험판 남용 완화 — 브라우저·IP 각각 상한 (우회 가능, 부담만 증가) */

export const TRIAL_ACCESS_MAX_PER_BROWSER = 5;
export const TRIAL_ACCESS_MAX_PER_IP = 5;

export const TRIAL_LS_BROWSER_COUNT = 'excload_trial_browser_sessions_v1';
/** 같은 탭에서 새로고침 시 API·카운트 중복 방지 */
export const TRIAL_SS_SESSION_PASSED = 'excload_trial_gate_passed_v1';
