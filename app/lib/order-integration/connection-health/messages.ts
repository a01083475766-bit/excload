import type { ClientHealthState, HealthStatus } from './types';

export type HealthMessage = {
  /** 배지/요약용 짧은 라벨. */
  label: string;
  /** 상세 안내 제목(사용자 조치 유도). */
  title: string;
  /** 사용자에게 보여줄 설명(공통 분류 문구). */
  description: string;
  /** 사용자가 취할 실제 해결 방법. HEALTHY 등은 빈 문자열. */
  action: string;
  /** UI 강조 톤(색 결정용). ok=초록, info=중립, warn=주황, error=빨강. */
  tone: 'ok' | 'info' | 'warn' | 'error';
};

const MESSAGES: Record<ClientHealthState, HealthMessage> = {
  CHECKING: {
    label: '확인 중',
    title: '연결 상태를 확인하고 있습니다.',
    description: '잠시만 기다려 주세요.',
    action: '',
    tone: 'info',
  },
  HEALTHY: {
    label: '연결 정상',
    title: '연결이 정상입니다.',
    description: '쇼핑몰 API가 정상적으로 응답합니다.',
    action: '',
    tone: 'ok',
  },
  AUTH_REQUIRED: {
    label: '재인증 필요',
    title: '인증정보를 확인해 주세요.',
    description: '인증이 만료되었거나 인증정보가 올바르지 않습니다.',
    action: 'Client ID·Client Secret 등 인증정보를 확인한 뒤 다시 연결해 주세요.',
    tone: 'error',
  },
  IP_NOT_ALLOWED: {
    label: 'IP 등록 필요',
    title: 'IP 등록이 필요합니다.',
    description: '엑클로드 호출 IP가 쇼핑몰에 등록되어 있지 않습니다.',
    action: '쇼핑몰 API 설정의 호출 IP에 엑클로드 IP를 추가해 주세요.',
    tone: 'error',
  },
  PERMISSION_DENIED: {
    label: '권한 확인 필요',
    title: '주문 API 권한을 확인해 주세요.',
    description: '주문 조회에 필요한 API 권한이 없습니다.',
    action: '애플리케이션에서 주문 관련 API 권한이 선택되어 있는지 확인해 주세요.',
    tone: 'error',
  },
  APPROVAL_REQUIRED: {
    label: '승인·계약 확인 필요',
    title: 'API 사용 승인을 확인해 주세요.',
    description: 'API 사용 승인이 완료되지 않았거나 반영 대기 중입니다.',
    action: '쇼핑몰에서 API 사용 승인·계약 상태를 확인한 뒤 다시 확인해 주세요.',
    tone: 'warn',
  },
  RATE_LIMITED: {
    label: '일시적 호출 제한',
    title: '잠시 후 다시 확인해 주세요.',
    description: '쇼핑몰 API 호출이 일시적으로 제한되었습니다. 연결이 해제된 것은 아닙니다.',
    action: '잠시 후 다시 확인해 주세요.',
    tone: 'warn',
  },
  TEMPORARY_ERROR: {
    label: '일시적 연결 문제',
    title: '일시적으로 연결을 확인하지 못했습니다.',
    description: '쇼핑몰 서버 또는 연결이 일시적으로 불안정합니다.',
    action: '잠시 후 자동으로 다시 확인하거나 「다시 확인」을 눌러 주세요.',
    tone: 'warn',
  },
  ACCOUNT_CONFIG_ERROR: {
    label: '설정 확인 필요',
    title: '연동 설정을 확인해 주세요.',
    description: '연동 정보(키·판매자번호·URL·서버 설정)에 문제가 있습니다.',
    action: '연동 설정에서 입력값과 서버 설정을 확인한 뒤 다시 저장해 주세요.',
    tone: 'error',
  },
  REQUEST_INVALID: {
    label: '조회 조건 확인',
    title: '조회 조건을 확인해 주세요.',
    description: '요청한 조회 조건(날짜·검색어 등)이 올바르지 않습니다. 연결 자체 문제는 아닙니다.',
    action: '조회 기간·조건을 바꿔 다시 시도해 주세요.',
    tone: 'info',
  },
  UNKNOWN: {
    label: '상태 미확인',
    title: '연결 상태를 확인하지 못했습니다.',
    description: '연결 확인 중 알 수 없는 상태가 확인되었습니다.',
    action: '잠시 후 「다시 확인」을 눌러 주세요. 계속되면 관리자에게 문의하세요.',
    tone: 'warn',
  },
};

export function getHealthMessage(status: ClientHealthState): HealthMessage {
  return MESSAGES[status];
}

/** DB에 저장되는 상태(HealthStatus) 전용 조회 헬퍼. */
export function getHealthMessageForStatus(status: HealthStatus): HealthMessage {
  return MESSAGES[status];
}