import { buildCoupangApiUrl, buildCoupangAuthorizationHeader } from '@/app/lib/coupang/hmac';
import type {
  CoupangTransport,
  CoupangTransportRequest,
  CoupangTransportResult,
} from '@/app/lib/coupang/transport/types';

const DEFAULT_TIMEOUT_MS = 60_000;

export class DirectCoupangTransport implements CoupangTransport {
  readonly mode = 'direct' as const;

  async invoke(request: CoupangTransportRequest): Promise<CoupangTransportResult> {
    const { authorization } = buildCoupangAuthorizationHeader({
      method: request.method,
      pathWithQuery: request.pathWithQuery,
      accessKey: request.accessKey,
      secretKey: request.secretKey,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(buildCoupangApiUrl(request.pathWithQuery), {
        method: request.method,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json;charset=UTF-8',
          'X-Requested-By': request.vendorId,
          'X-MARKET': 'KR',
          'X-EXTENDED-TIMEOUT': '90000',
        },
        body:
          request.bodyText ??
          (request.body !== undefined ? JSON.stringify(request.body) : undefined),
        signal: controller.signal,
        cache: 'no-store',
      });

      return {
        httpStatus: response.status,
        bodyText: await response.text(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
