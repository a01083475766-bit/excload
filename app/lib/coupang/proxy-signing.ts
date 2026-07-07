import { createHash, createHmac, randomUUID } from 'crypto';

export const EXCLOAD_PROXY_HEADER = {
  timestamp: 'x-excload-proxy-timestamp',
  signature: 'x-excload-proxy-signature',
  requestId: 'x-excload-proxy-request-id',
  keyId: 'x-excload-proxy-key-id',
} as const;

export const PROXY_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export function hashProxyBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export function buildProxySignatureMessage(input: {
  timestamp: string;
  method: string;
  path: string;
  bodyHash: string;
}): string {
  return `${input.timestamp}${input.method.toUpperCase()}${input.path}${input.bodyHash}`;
}

export function signProxyRequest(input: {
  method: string;
  path: string;
  body: string;
  secret: string;
  timestamp?: string;
}): { timestamp: string; signature: string; bodyHash: string; requestId: string } {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const bodyHash = hashProxyBody(input.body);
  const message = buildProxySignatureMessage({
    timestamp,
    method: input.method,
    path: input.path,
    bodyHash,
  });
  const signature = createHmac('sha256', input.secret).update(message, 'utf8').digest('hex');
  const requestId = randomUUID();

  return { timestamp, signature, bodyHash, requestId };
}

export function verifyProxyRequest(input: {
  method: string;
  path: string;
  body: string;
  secret: string;
  timestamp: string;
  signature: string;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const requestTime = Date.parse(input.timestamp);
  if (Number.isNaN(requestTime)) return false;
  if (Math.abs(now.getTime() - requestTime) > PROXY_SIGNATURE_MAX_AGE_MS) return false;

  const bodyHash = hashProxyBody(input.body);
  const message = buildProxySignatureMessage({
    timestamp: input.timestamp,
    method: input.method,
    path: input.path,
    bodyHash,
  });
  const expected = createHmac('sha256', input.secret).update(message, 'utf8').digest('hex');

  return timingSafeEqualHex(expected, input.signature);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
