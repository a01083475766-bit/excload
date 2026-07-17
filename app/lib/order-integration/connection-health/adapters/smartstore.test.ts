import { describe, expect, it } from 'vitest';
import {
  categorizeSmartstoreError,
  runSmartstoreHealthCheck,
  type SmartstoreHealthHttpFn,
} from './smartstore';
import type { SmartstoreCredentials } from '@/app/lib/smartstore/client';

describe('categorizeSmartstoreError (실제 주문조회 오류 → 공통 카테고리)', () => {
  it('GW.AUTHN 메시지 → AUTH_REQUIRED', () => {
    const res = categorizeSmartstoreError(
      new Error('스마트스토어 주문 조회 실패. 원인: 스마트스토어 API 오류 (GW.AUTHN)'),
    );
    expect(res.status).toBe('AUTH_REQUIRED');
    expect(res.rawCode).toBe('GW.AUTHN');
  });

  it('IP 미등록 메시지 → IP_NOT_ALLOWED', () => {
    const res = categorizeSmartstoreError(new Error('허용되지 않은 IP입니다.'));
    expect(res.status).toBe('IP_NOT_ALLOWED');
  });

  it('조회 조건/날짜 오류 → REQUEST_INVALID (연결 상태 중립)', () => {
    const res = categorizeSmartstoreError(new Error('조회 기간이 올바르지 않습니다.'));
    expect(res.status).toBe('REQUEST_INVALID');
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
});
