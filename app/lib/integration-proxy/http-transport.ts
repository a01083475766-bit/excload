import { assertIntegrationProxyUrlAllowed } from '@/app/lib/integration-proxy/allowed-domains';
import {
  assertIntegrationProxyConfigReady,
  getIntegrationProxyBaseUrl,
  getIntegrationProxyInvokePath,
  getIntegrationProxyKeyId,
  getIntegrationProxySharedSecret,
} from '@/app/lib/integration-proxy/config';
import { EXCLOAD_PROXY_HEADER, signProxyRequest } from '@/app/lib/integration-proxy/signing';

const DEFAULT_TIMEOUT_MS = 60_000;

export type IntegrationHttpRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutMs?: number;
};

export type IntegrationHttpResult = {
  httpStatus: number;
  bodyText: string;
};

type IntegrationProxyInvokeBody = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
};

type IntegrationProxyInvokeResponse = {
  ok: boolean;
  httpStatus: number;
  bodyText: string;
  error?: string;
};

export class IntegrationProxyError extends Error {
  constructor(
    message: string,
    readonly code: 'PROXY_CONFIG' | 'PROXY_NETWORK' | 'PROXY_RESPONSE' | 'DOMAIN_DENIED' = 'PROXY_NETWORK',
  ) {
    super(message);
    this.name = 'IntegrationProxyError';
  }
}

export async function invokeIntegrationHttp(
  request: IntegrationHttpRequest,
): Promise<IntegrationHttpResult> {
  assertIntegrationProxyConfigReady();
  assertIntegrationProxyUrlAllowed(request.url);

  const baseUrl = getIntegrationProxyBaseUrl()!;
  const secret = getIntegrationProxySharedSecret()!;
  const invokePath = getIntegrationProxyInvokePath();
  const url = `${baseUrl}${invokePath}`;

  const payload: IntegrationProxyInvokeBody = {
    method: request.method.toUpperCase(),
    url: request.url,
    ...(request.headers ? { headers: request.headers } : {}),
    ...(request.body != null ? { body: request.body } : {}),
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
        [EXCLOAD_PROXY_HEADER.keyId]: getIntegrationProxyKeyId(),
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

    let wrapped: IntegrationProxyInvokeResponse;
    try {
      wrapped = JSON.parse(responseText) as IntegrationProxyInvokeResponse;
    } catch {
      throw new IntegrationProxyError('고정 IP 프록시 응답을 해석하지 못했습니다.', 'PROXY_RESPONSE');
    }

    if (!wrapped.ok) {
      return {
        httpStatus: wrapped.httpStatus || 502,
        bodyText: wrapped.bodyText || wrapped.error || '고정 IP 프록시 호출에 실패했습니다.',
      };
    }

    return {
      httpStatus: wrapped.httpStatus,
      bodyText: wrapped.bodyText,
    };
  } catch (error) {
    if (error instanceof IntegrationProxyError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new IntegrationProxyError(
        '고정 IP 프록시 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
        'PROXY_NETWORK',
      );
    }
    throw new IntegrationProxyError(
      '고정 IP 프록시 서버에 연결하지 못했습니다. INTEGRATION_PROXY_BASE_URL 설정을 확인해 주세요.',
      'PROXY_NETWORK',
    );
  } finally {
    clearTimeout(timeout);
  }
}
