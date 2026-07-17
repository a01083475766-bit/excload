import type { OrderIntegrationProvider } from '@prisma/client';

/**
 * DB에 저장되는 실제 연결(외부 API) 상태.
 * 계정 활성/비활성을 뜻하는 `status`(OrderIntegrationAccountStatus)와는 별개다.
 *
 * 주의: CHECKING은 여기에 포함하지 않는다. "확인 중"은 클라이언트의 일시적 UI 상태로만
 * 사용하며, DB에는 실제 검사가 끝난 결과(HEALTHY 또는 오류 카테고리)만 저장한다.
 */
export type HealthStatus =
  | 'HEALTHY'
  | 'AUTH_REQUIRED'
  | 'IP_NOT_ALLOWED'
  | 'PERMISSION_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'RATE_LIMITED'
  | 'TEMPORARY_ERROR'
  | 'ACCOUNT_CONFIG_ERROR'
  | 'REQUEST_INVALID'
  | 'UNKNOWN';

/** 오류 카테고리 = HEALTHY를 제외한 HealthStatus. lastErrorCategory에 저장한다. */
export type HealthErrorCategory = Exclude<HealthStatus, 'HEALTHY'>;

/** 클라이언트 전용 UI 상태(저장하지 않음). */
export const CLIENT_ONLY_HEALTH_STATE = 'CHECKING' as const;
export type ClientHealthState = HealthStatus | typeof CLIENT_ONLY_HEALTH_STATE;

/**
 * 몰 어댑터가 실제 연결 확인 후 반환하는 표준 결과.
 * 모든 쇼핑몰 어댑터는 자신의 인증 방식과 무관하게 이 형태로 반환해야 한다.
 */
export type ConnectionHealthResult = {
  status: HealthStatus;
  /**
   * 관리자 진단용 원본 코드(예: HTTP status, 게이트웨이 코드 "GW.AUTHN").
   * 비밀키·토큰·헤더·전체 응답 원문은 담지 않는다.
   */
  rawCode?: string;
  /**
   * 관리자 진단용 짧은 원본 메시지(민감정보 제거·길이 제한).
   * 사용자 화면에는 노출하지 않는다.
   */
  rawMessage?: string;
  /** 검사 완료 시각. */
  checkedAt: Date;
};

/**
 * 공급자 헬스체크 "준비 상태"(내부 값). 실제 판매자 계정으로 검증 완료됐다는 뜻이 아니다.
 * 사용자 화면에는 이 값을 직접 노출하지 않는다. 사용자는 각 계정의 healthStatus
 * (연결 정상 / 재인증 필요 / IP 등록 필요 / 연결 확인 준비 중 등)만 본다.
 *
 * - VERIFIED: 자동 헬스체크를 실행할 수 있도록 코드·사양이 준비된 공급자. 운영 자동 확인 실행 + 상태 표시.
 * - PROVISIONAL: 공식 API 사양 또는 실제 호출 검증 전(예: placeholder 스펙). 운영 자동 확인에서 제외하고
 *   화면에는 '연결 확인 준비 중' 또는 기존 저장 상태만 표시. (개발 환경에서 명시적 검사만 허용)
 * - DISABLED: 헬스체크 사용 중지(호출 금지).
 */
export type ProviderReadiness = 'VERIFIED' | 'PROVISIONAL' | 'DISABLED';

/** provider별 실제 연결 확인 어댑터. */
export type ConnectionHealthAdapter<TAccount = unknown> = {
  provider: OrderIntegrationProvider;
  /**
   * 준비 상태. 잘못된 추정 API 호출로 정상 계정을 오류로 표시하지 않도록,
   * 공식 근거가 없으면 VERIFIED로 두지 않는다.
   */
  readiness: ProviderReadiness;
  /** 최소 범위의 읽기 전용 확인. 성공 시 HEALTHY, 실패 시 오류 카테고리를 담아 반환. */
  checkConnection(account: TAccount): Promise<ConnectionHealthResult>;
};

/**
 * persist 시 계정에 기록할 필드(부분 업데이트).
 * lastCheckedAt만 항상 포함되고, 나머지는 결과 종류에 따라 선택적으로 채워진다.
 * (REQUEST_INVALID 같은 중립 결과는 healthStatus/카운터를 건드리지 않는다.)
 */
export type HealthFieldsPatch = {
  lastCheckedAt: Date;
  healthStatus?: HealthStatus;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastErrorCategory?: HealthErrorCategory | null;
  lastErrorCode?: string | null;
  consecutiveFailureCount?: number;
};

/** computeHealthFields가 참고하는 이전 상태(부분). DB의 string 값을 그대로 받는다. */
export type PreviousHealthState = {
  healthStatus?: string | null;
  consecutiveFailureCount?: number | null;
};
