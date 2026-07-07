export type CoupangTransportMode = 'direct' | 'proxy';

export type CoupangTransportRequest = {
  method: string;
  pathWithQuery: string;
  vendorId: string;
  accessKey: string;
  secretKey: string;
  body?: unknown;
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
