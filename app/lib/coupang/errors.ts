export type CoupangApiErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'IP_NOT_REGISTERED'
  | 'API_KEY_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'VENDOR_MISMATCH'
  | 'SERVER_DELAY'
  | 'UNKNOWN';

export class CoupangApiError extends Error {
  readonly code: CoupangApiErrorCode;
  readonly httpStatus?: number;
  readonly coupangMessage?: string;

  constructor(code: CoupangApiErrorCode, message: string, options?: {
    httpStatus?: number;
    coupangMessage?: string;
  }) {
    super(message);
    this.name = 'CoupangApiError';
    this.code = code;
    this.httpStatus = options?.httpStatus;
    this.coupangMessage = options?.coupangMessage;
  }
}

export function toUserFacingCoupangErrorMessage(error: unknown): string {
  if (error instanceof CoupangApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('EXCLOAD_INTEGRATION_ENCRYPTION_KEY')) {
    return '서버 암호화 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.';
  }
  return '쿠팡 API 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

export function classifyCoupangHttpError(input: {
  httpStatus: number;
  bodyText: string;
  vendorId?: string;
}): CoupangApiError {
  const text = input.bodyText.toLowerCase();

  if (input.httpStatus === 408 || input.httpStatus === 429 || input.httpStatus >= 500) {
    return new CoupangApiError(
      'SERVER_DELAY',
      '쿠팡 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
      { httpStatus: input.httpStatus },
    );
  }

  if (
    text.includes('not allowed ip') ||
    text.includes('ip address') ||
    text.includes('ip is not') ||
    text.includes('허용되지') ||
    text.includes('ip 미등록')
  ) {
    return new CoupangApiError(
      'IP_NOT_REGISTERED',
      '쿠팡 WING에 엑클로드 고정 IP가 등록되어 있는지 확인해 주세요.',
      { httpStatus: input.httpStatus, coupangMessage: input.bodyText.slice(0, 200) },
    );
  }

  if (
    text.includes('expired') ||
    text.includes('만료') ||
    text.includes('expire')
  ) {
    return new CoupangApiError(
      'API_KEY_EXPIRED',
      '쿠팡 API 키가 만료되었을 수 있습니다.',
      { httpStatus: input.httpStatus, coupangMessage: input.bodyText.slice(0, 200) },
    );
  }

  if (
    text.includes('vendor') ||
    text.includes('seller id') ||
    text.includes('업체코드') ||
    text.includes('판매자')
  ) {
    return new CoupangApiError(
      'VENDOR_MISMATCH',
      '쿠팡 업체코드가 올바른지 확인해 주세요.',
      { httpStatus: input.httpStatus, coupangMessage: input.bodyText.slice(0, 200) },
    );
  }

  if (input.httpStatus === 401 || input.httpStatus === 403) {
    if (text.includes('permission') || text.includes('권한')) {
      return new CoupangApiError(
        'PERMISSION_DENIED',
        '쿠팡 API 권한이 승인되지 않았거나 반영 대기 중일 수 있습니다.',
        { httpStatus: input.httpStatus, coupangMessage: input.bodyText.slice(0, 200) },
      );
    }

    return new CoupangApiError(
      'INVALID_CREDENTIALS',
      'API Key 또는 Secret Key가 올바르지 않습니다.',
      { httpStatus: input.httpStatus, coupangMessage: input.bodyText.slice(0, 200) },
    );
  }

  return new CoupangApiError(
    'UNKNOWN',
    '쿠팡 API 요청에 실패했습니다. 입력값과 IP 등록 상태를 확인해 주세요.',
    { httpStatus: input.httpStatus, coupangMessage: input.bodyText.slice(0, 200) },
  );
}
