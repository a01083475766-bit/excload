import { CoupangApiError } from '@/app/lib/coupang/errors';
import {
  EXCLOAD_PROXY_HEADER,
  signProxyRequest,
} from '@/app/lib/coupang/proxy-signing';
import {
  assertCoupangProxyConfigReady,
  getCoupangProxyBaseUrl,
  getCoupangProxyInvokePath,
  getCoupangProxyKeyId,
  getCoupangProxySharedSecret,
} from '@/app/lib/coupang/transport/config';
import type {
  CoupangTransport,
  CoupangTransportRequest,
  CoupangTransportResult,
} from '@/app/lib/coupang/transport/types';

const DEFAULT_TIMEOUT_MS = 60_000;

/** Vercel → 고정 IP 프록시 서버 요청 본문 */
export type CoupangProxyInvokeBody = {
  method: string;
  pathWithQuery: string;
  vendorId: string;
  accessKey: string;
  secretKey: string;
  body?: unknown;
  /** lossless 직렬화 JSON 원문 — 프록시가 쿠팡으로 그대로 전달 */
  bodyText?: string;
};

/** 프록시 → Vercel 응답 래퍼 */
export type CoupangProxyInvokeResponse = {
  ok: boolean;
  httpStatus: number;
  bodyText: string;
  error?: string;
};

export class ProxyCoupangTransport implements CoupangTransport {
  readonly mode = 'proxy' as const;

  async invoke(request: CoupangTransportRequest): Promise<CoupangTransportResult> {
    assertCoupangProxyConfigReady();

    const baseUrl = getCoupangProxyBaseUrl()!;
    const secret = getCoupangProxySharedSecret()!;
    const invokePath = getCoupangProxyInvokePath();
    const url = `${baseUrl}${invokePath}`;

    const payload: CoupangProxyInvokeBody = {
      method: request.method,
      pathWithQuery: request.pathWithQuery,
      vendorId: request.vendorId,
      accessKey: request.accessKey,
      secretKey: request.secretKey,
      ...(request.bodyText !== undefined
        ? { bodyText: request.bodyText }
        : request.body !== undefined
          ? { body: request.body }
          : {}),
    };

    const body = JSON.stringify(payload);
    const { timestamp, signature, requestId } = signProxyRequest({
      method: 'POST',
      path: invokePath,
      body,
      secret,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          [EXCLOAD_PROXY_HEADER.timestamp]: timestamp,
          [EXCLOAD_PROXY_HEADER.signature]: signature,
          [EXCLOAD_PROXY_HEADER.requestId]: requestId,
          [EXCLOAD_PROXY_HEADER.keyId]: getCoupangProxyKeyId(),
        },
        body,
        signal: controller.signal,
        cache: 'no-store',
      });

      const responseText = await response.text();

      if (!response.ok) {
        return {
          httpStatus: response.status,
          bodyText: responseText,
        };
      }

      let wrapped: CoupangProxyInvokeResponse;
      try {
        wrapped = JSON.parse(responseText) as CoupangProxyInvokeResponse;
      } catch {
        throw new CoupangApiError(
          'UNKNOWN',
          '쿠팡 프록시 서버 응답을 해석하지 못했습니다.',
        );
      }

      if (!wrapped.ok) {
        return {
          httpStatus: wrapped.httpStatus || 502,
          bodyText: wrapped.bodyText || wrapped.error || '쿠팡 프록시 호출에 실패했습니다.',
        };
      }

      return {
        httpStatus: wrapped.httpStatus,
        bodyText: wrapped.bodyText,
      };
    } catch (error) {
      if (error instanceof CoupangApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CoupangApiError(
          'SERVER_DELAY',
          '쿠팡 프록시 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
      throw new CoupangApiError(
        'UNKNOWN',
        '쿠팡 프록시 서버에 연결하지 못했습니다. COUPANG_PROXY_BASE_URL 설정을 확인해 주세요.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
