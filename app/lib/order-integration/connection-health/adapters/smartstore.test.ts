import { describe, expect, it } from 'vitest';
import {
  categorizeSmartstoreOperationError,
  classifySmartstoreApiFailure,
  runSmartstoreHealthCheck,
  smartstoreHealthResultToOperationResult,
  type SmartstoreHealthHttpFn,
} from './smartstore';
import {
  collectSmartstoreProductOrders,
  SmartstoreApiError,
  type SmartstoreCredentials,
} from '@/app/lib/smartstore/client';

describe('스마트스토어 구조화 오류 분류', () => {
  it.each([
    { code: 'invalid_client', message: 'invalid client', httpStatus: 400 },
    { code: undefined, message: 'Client ID 또는 Client Secret 오류', httpStatus: 400 },
    { code: undefined, message: '전자서명 실패', httpStatus: 400 },
    { code: 'GW.AUTHN', message: 'authentication failed', httpStatus: 401 },
  ])('토큰 인증 오류 $code/$httpStatus → AUTH_REQUIRED', (failure) => {
    expect(classifySmartstoreApiFailure({ ...failure, stage: 'TOKEN' })).toBe('AUTH_REQUIRED');
  });

  it('invalid_client를 포함해도 REQUEST_INVALID로 분류하지 않는다', () => {
    const error = new SmartstoreApiError({
      stage: 'TOKEN',
      httpStatus: 400,
      code: 'invalid_client',
      rawMessage: 'invalid client credentials',
    });
    expect(categorizeSmartstoreOperationError(error).category).toBe('AUTH_REQUIRED');
  });

  it('주문 날짜 파라미터 400은 REQUEST_INVALID', () => {
    expect(
      classifySmartstoreApiFailure({
        stage: 'ORDER',
        httpStatus: 400,
        code: 'INVALID_PARAMETER',
        message: 'lastChangedFrom 날짜 파라미터가 올바르지 않습니다.',
      }),
    ).toBe('REQUEST_INVALID');
  });

  it('승인·계약 신호가 있는 403은 일반 권한 오류보다 APPROVAL_REQUIRED를 우선한다', () => {
    expect(
      classifySmartstoreApiFailure({
        stage: 'ORDER',
        httpStatus: 403,
        code: 'CONTRACT_PENDING',
        message: 'API 계약 승인 대기',
      }),
    ).toBe('APPROVAL_REQUIRED');
  });

  it('조회 조건 근거 없이 invalid 단어만 있는 오류는 REQUEST_INVALID로 단정하지 않는다', () => {
    expect(
      classifySmartstoreApiFailure({ stage: 'ORDER', message: 'invalid response' }),
    ).toBe('UNKNOWN');
  });

  it('구조화 정보가 없는 사용자 문자열은 다시 분석하지 않고 UNKNOWN으로 둔다', () => {
    expect(categorizeSmartstoreOperationError(new Error('GW.AUTHN invalid_client'))).toMatchObject({
      success: false,
      category: 'UNKNOWN',
    });
  });
});

const NOW = new Date('2026-07-18T00:00:00.000Z');
const CREDENTIALS: SmartstoreCredentials = {
  clientId: 'test-client',
  clientSecret: '$2a$10$abcdefghijklmnopqrstuv',
  authType: 'SELF',
};

const TOKEN_OK = { httpStatus: 200, bodyText: JSON.stringify({ access_token: 'tok-123', expires_in: 3600 }) };

function isTokenRequest(url: string): boolean {
  return url.includes('/oauth2/token');
}

/** 호출 시퀀스를 순서대로 반환하는 fake http. 토큰/주문 호출을 URL로 구분한다. */
function makeHttp(responses: {
  token: Array<{ httpStatus: number; bodyText: string } | 'throw'>;
  order: Array<{ httpStatus: number; bodyText: string } | 'throw'>;
}): { http: SmartstoreHealthHttpFn; tokenCalls: () => number; orderCalls: () => number } {
  let tokenIdx = 0;
  let orderIdx = 0;
  const http: SmartstoreHealthHttpFn = async ({ url }) => {
    if (isTokenRequest(url)) {
      const r = responses.token[tokenIdx++] ?? responses.token[responses.token.length - 1];
      if (r === 'throw') throw new Error('network');
      return r;
    }
    const r = responses.order[orderIdx++] ?? responses.order[responses.order.length - 1];
    if (r === 'throw') throw new Error('network');
    return r;
  };
  return { http, tokenCalls: () => tokenIdx, orderCalls: () => orderIdx };
}

describe('runSmartstoreHealthCheck', () => {
  it('토큰 발급 + 주문 API 빈 응답이면 HEALTHY', async () => {
    const { http } = makeHttp({
      token: [TOKEN_OK],
      order: [{ httpStatus: 200, bodyText: JSON.stringify({ data: { lastChangeStatuses: [] } }) }],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('HEALTHY');
  });

  it('401 GW.AUTHN이면 토큰 재발급 후 1회 재시도하여 성공 시 HEALTHY', async () => {
    const { http, tokenCalls, orderCalls } = makeHttp({
      token: [TOKEN_OK, TOKEN_OK],
      order: [
        { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: '인증 실패' }) },
        { httpStatus: 200, bodyText: JSON.stringify({ data: { lastChangeStatuses: [] } }) },
      ],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('HEALTHY');
    expect(tokenCalls()).toBe(2);
    expect(orderCalls()).toBe(2);
  });

  it('401 GW.AUTHN이 재시도에도 계속되면 AUTH_REQUIRED (재시도는 정확히 1회)', async () => {
    const { http, orderCalls } = makeHttp({
      token: [TOKEN_OK, TOKEN_OK],
      order: [
        { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: '인증 실패' }) },
        { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: '인증 실패' }) },
      ],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('AUTH_REQUIRED');
    expect(orderCalls()).toBe(2);
  });

  it.each([
    {
      label: '429',
      response: { httpStatus: 429, bodyText: JSON.stringify({ code: 'GW.RATE_LIMIT', message: 'too many' }) },
      expected: 'RATE_LIMITED',
    },
    {
      label: 'IP 오류',
      response: {
        httpStatus: 403,
        bodyText: JSON.stringify({ code: 'GW.IP_NOT_ALLOWED', message: 'not allowed ip' }),
      },
      expected: 'IP_NOT_ALLOWED',
    },
    {
      label: '권한 오류',
      response: {
        httpStatus: 403,
        bodyText: JSON.stringify({ code: 'GW.AUTHZ', message: 'permission denied' }),
      },
      expected: 'PERMISSION_DENIED',
    },
    {
      label: '5xx',
      response: { httpStatus: 503, bodyText: JSON.stringify({ code: 'GW.SERVER', message: 'unavailable' }) },
      expected: 'TEMPORARY_ERROR',
    },
  ])('인증 재시도 두 번째 응답 $label도 다시 분류한다', async ({ response, expected }) => {
    const { http, tokenCalls, orderCalls } = makeHttp({
      token: [TOKEN_OK, TOKEN_OK],
      order: [
        { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: '인증 실패' }) },
        response,
      ],
    });

    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe(expected);
    expect(tokenCalls()).toBe(2);
    expect(orderCalls()).toBe(2);
  });

  it('403 GW.IP_NOT_ALLOWED → IP_NOT_ALLOWED', async () => {
    const { http } = makeHttp({
      token: [TOKEN_OK],
      order: [{ httpStatus: 403, bodyText: JSON.stringify({ code: 'GW.IP_NOT_ALLOWED', message: 'ip' }) }],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('IP_NOT_ALLOWED');
  });

  it('429 → RATE_LIMITED', async () => {
    const { http } = makeHttp({
      token: [TOKEN_OK],
      order: [{ httpStatus: 429, bodyText: JSON.stringify({ code: 'GW.RATE_LIMIT', message: 'too many' }) }],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('RATE_LIMITED');
  });

  it('주문 API 네트워크 예외 → TEMPORARY_ERROR', async () => {
    const { http } = makeHttp({ token: [TOKEN_OK], order: ['throw'] });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('TEMPORARY_ERROR');
  });

  it('토큰 발급 인증정보 오류(invalid_client)는 AUTH_REQUIRED로 매핑하고 주문 API를 호출하지 않는다', async () => {
    const { http, orderCalls } = makeHttp({
      token: [{ httpStatus: 400, bodyText: JSON.stringify({ code: 'invalid_client', message: '시크릿이 유효하지 않습니다' }) }],
      order: [{ httpStatus: 200, bodyText: '{}' }],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('AUTH_REQUIRED');
    expect(orderCalls()).toBe(0);
  });

  it('토큰 401(인증정보 유효하지 않음)은 AUTH_REQUIRED', async () => {
    const { http } = makeHttp({
      token: [{ httpStatus: 401, bodyText: JSON.stringify({ message: '인증에 실패했습니다' }) }],
      order: [{ httpStatus: 200, bodyText: '{}' }],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('AUTH_REQUIRED');
  });

  it('토큰 단계 GW.IP_NOT_ALLOWED → IP_NOT_ALLOWED', async () => {
    const { http } = makeHttp({
      token: [{ httpStatus: 403, bodyText: JSON.stringify({ code: 'GW.IP_NOT_ALLOWED', message: 'ip' }) }],
      order: [{ httpStatus: 200, bodyText: '{}' }],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('IP_NOT_ALLOWED');
  });

  it('토큰 단계 429 → RATE_LIMITED, 5xx → TEMPORARY_ERROR', async () => {
    const rate = await runSmartstoreHealthCheck({
      credentials: CREDENTIALS,
      http: makeHttp({ token: [{ httpStatus: 429, bodyText: '{}' }], order: [{ httpStatus: 200, bodyText: '{}' }] }).http,
      now: NOW,
    });
    expect(rate.status).toBe('RATE_LIMITED');

    const temp = await runSmartstoreHealthCheck({
      credentials: CREDENTIALS,
      http: makeHttp({ token: [{ httpStatus: 503, bodyText: '{}' }], order: [{ httpStatus: 200, bodyText: '{}' }] }).http,
      now: NOW,
    });
    expect(temp.status).toBe('TEMPORARY_ERROR');
  });

  it('토큰 발급 네트워크 예외 → TEMPORARY_ERROR', async () => {
    const { http } = makeHttp({ token: ['throw'], order: [{ httpStatus: 200, bodyText: '{}' }] });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    expect(result.status).toBe('TEMPORARY_ERROR');
  });

  it('원본 응답에 access_token/헤더 원문을 결과로 노출하지 않는다', async () => {
    const { http } = makeHttp({
      token: [TOKEN_OK],
      order: [{ httpStatus: 500, bodyText: JSON.stringify({ code: 'GW.TEMP', message: 'server error' }) }],
    });
    const result = await runSmartstoreHealthCheck({ credentials: CREDENTIALS, http, now: NOW });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('tok-123');
    expect(serialized).not.toContain('Bearer');
  });

  it('자동 헬스체크·수동 테스트 변환·실제 주문조회가 같은 인증 오류를 동일 분류한다', async () => {
    const auto = await runSmartstoreHealthCheck({
      credentials: CREDENTIALS,
      http: makeHttp({
        token: [TOKEN_OK, TOKEN_OK],
        order: [
          { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: '인증 실패' }) },
          { httpStatus: 401, bodyText: JSON.stringify({ code: 'GW.AUTHN', message: '인증 실패' }) },
        ],
      }).http,
      now: NOW,
    });
    const manual = smartstoreHealthResultToOperationResult(auto);
    const actual = categorizeSmartstoreOperationError(
      new SmartstoreApiError({
        stage: 'ORDER',
        httpStatus: 401,
        code: 'GW.AUTHN',
        rawMessage: '인증 실패',
      }),
    );

    expect(auto.status).toBe('AUTH_REQUIRED');
    expect(manual).toMatchObject({ success: false, category: 'AUTH_REQUIRED' });
    expect(actual).toMatchObject({ success: false, category: 'AUTH_REQUIRED' });
  });

  it('실제 수집 래퍼가 원인 객체를 보존해 사용자 문자열 재분석 없이 분류한다', async () => {
    let caught: unknown;
    try {
      await collectSmartstoreProductOrders({
        request: async () => {
          throw new SmartstoreApiError({
            stage: 'ORDER',
            httpStatus: 429,
            code: 'GW.RATE_LIMIT',
            rawMessage: 'too many requests',
          });
        },
        range: {
          fromMs: NOW.getTime() - 60_000,
          toMs: NOW.getTime() - 10_000,
        },
        now: NOW,
      });
    } catch (error) {
      caught = error;
    }

    expect(categorizeSmartstoreOperationError(caught)).toMatchObject({
      success: false,
      category: 'RATE_LIMITED',
      errorCode: 'GW.RATE_LIMIT',
    });
  });
});
