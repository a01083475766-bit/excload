export type CoupangTransportMode = 'direct' | 'proxy';

export type CoupangTransportRequest = {
  method: string;
  pathWithQuery: string;
  vendorId: string;
  accessKey: string;
  secretKey: string;
  /** JSON 객체 — transport가 stringify (일반 GET 등) */
  body?: unknown;
  /** lossless 직렬화된 JSON 원문 — PATCH acknowledgement 등. body와 동시 사용 금지 */
  bodyText?: string;
  timeoutMs?: number;
};

export type CoupangTransportResult = {
  httpStatus: number;
  bodyText: string;
};

export interface CoupangTransport {
  readonly mode: CoupangTransportMode;
  invoke(request: CoupangTransportRequest): Promise<CoupangTransportResult>;
}

export type CoupangTransportInfo = {
  mode: CoupangTransportMode;
  proxyBaseUrl: string | null;
  directAllowed: boolean;
};
