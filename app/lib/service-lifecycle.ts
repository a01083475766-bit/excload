/**
 * 서비스 일정 SSOT (Asia/Seoul, end-exclusive)
 *
 * OPEN_BETA_ENDS_AT === SERVICE_GA_AT
 * → 베타 혜택은 […, endsAt) 동안만 유효하고, endsAt 부터 정식 정책.
 */

/** 기본값: 2026-10-01T00:00:00+09:00 (UTC 2026-09-30T15:00:00.000Z) */
export const DEFAULT_OPEN_BETA_ENDS_AT_ISO = '2026-10-01T00:00:00+09:00';

const ENV_KEY = 'OPEN_BETA_ENDS_AT';

let warnedInvalidEnv = false;

/**
 * 오픈베타 종료·정식 시작 시각 (end-exclusive).
 * 환경변수 OPEN_BETA_ENDS_AT가 있으면 사용, 없거나 잘못되면 기본값(+경고).
 */
export function getOpenBetaEndsAt(): Date {
  const raw = process.env[ENV_KEY]?.trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
    if (!warnedInvalidEnv) {
      warnedInvalidEnv = true;
      console.error(
        `[service-lifecycle] Invalid ${ENV_KEY}="${raw}". Falling back to ${DEFAULT_OPEN_BETA_ENDS_AT_ISO}`,
      );
    }
  }
  return new Date(DEFAULT_OPEN_BETA_ENDS_AT_ISO);
}

/** 정식 서비스 시작 = 오픈베타 종료 (동일 instant, 공백·중첩 없음) */
export function getServiceGaAt(): Date {
  return getOpenBetaEndsAt();
}

/** now < endsAt 이면 오픈베타 기간 */
export function isBeforeOpenBetaEnd(now: Date = new Date()): boolean {
  return now.getTime() < getOpenBetaEndsAt().getTime();
}
