/**
 * 엑클로드 주문연동 고정 IP 프록시 — Lightsail 배포용
 *
 * 배포: Lightsail 고정 outbound IP VM
 * Vercel env: INTEGRATION_PROXY_BASE_URL, INTEGRATION_PROXY_SHARED_SECRET
 * (하위 호환: COUPANG_PROXY_*)
 *
 * 엔드포인트:
 *   GET  /healthz
 *   POST /internal/integration/invoke  — 범용 HTTPS 프록시 (도메인 whitelist)
 *   POST /internal/coupang/invoke      — 쿠팡 HMAC 전용 (하위 호환)
 */

import { createServer } from 'node:http';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  assertUrlAllowed,
  getAllowedHostnames,
  INTEGRATION_PROXY_SUFFIX_RULES,
} from './allowed-hosts.mjs';

const PORT = Number(process.env.PORT || 8787);
const SHARED_SECRET = (
  process.env.INTEGRATION_PROXY_SHARED_SECRET ?? process.env.COUPANG_PROXY_SHARED_SECRET
)?.trim();
export const INTEGRATION_INVOKE_PATH = '/internal/integration/invoke';
export const COUPANG_INVOKE_PATH = '/internal/coupang/invoke';
export const MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 60_000;

export function hashBody(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * @param {{ method: string; path: string; body: string; timestamp: string; signature: string; secret: string; now?: number }} input
 */
export function verifySignature({
  method,
  path,
  body,
  timestamp,
  signature,
  secret,
  now = Date.now(),
}) {
  const requestTime = Date.parse(timestamp);
  if (Number.isNaN(requestTime)) return false;
  if (Math.abs(now - requestTime) > MAX_AGE_MS) return false;

  const message = `${timestamp}${method.toUpperCase()}${path}${hashBody(body)}`;
  const expected = createHmac('sha256', secret).update(message, 'utf8').digest('hex');
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export function buildHealthzPayload() {
  return {
    ok: true,
    coupangInvokeEnabled: true,
    integrationInvokeEnabled: true,
    exactAllowedHosts: getAllowedHostnames(),
    suffixRules: INTEGRATION_PROXY_SUFFIX_RULES.map((rule) => ({
      suffix: rule.suffix,
      protocols: [...rule.protocols],
      malls: [...rule.malls],
    })),
  };
}

function formatSignedDate(date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function buildCoupangAuthorization({ method, pathWithQuery, accessKey, secretKey }) {
  const questionIndex = pathWithQuery.indexOf('?');
  const path = questionIndex === -1 ? pathWithQuery : pathWithQuery.slice(0, questionIndex);
  const query = questionIndex === -1 ? '' : pathWithQuery.slice(questionIndex + 1);
  const signedDate = formatSignedDate();
  const message = `${signedDate}${method.toUpperCase()}${path}${query}`;
  const signature = createHmac('sha256', secretKey).update(message, 'utf8').digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function invokeCoupang(payload) {
  const authorization = buildCoupangAuthorization({
    method: payload.method,
    pathWithQuery: payload.pathWithQuery,
    accessKey: payload.accessKey,
    secretKey: payload.secretKey,
  });

  const url = `https://api-gateway.coupang.com${payload.pathWithQuery}`;
  const response = await fetchWithTimeout(url, {
    method: payload.method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-By': payload.vendorId,
      'X-MARKET': 'KR',
      'X-EXTENDED-TIMEOUT': '90000',
    },
    body:
      payload.bodyText != null
        ? payload.bodyText
        : payload.body != null
          ? JSON.stringify(payload.body)
          : undefined,
  });

  return {
    httpStatus: response.status,
    bodyText: await response.text(),
  };
}

async function invokeIntegrationHttp(payload) {
  assertUrlAllowed(payload.url);

  const headers = {
    ...(payload.headers ?? {}),
  };

  const response = await fetchWithTimeout(payload.url, {
    method: payload.method?.toUpperCase() || 'GET',
    headers,
    body: payload.body ?? undefined,
    redirect: 'manual',
  });

  return {
    httpStatus: response.status,
    bodyText: await response.text(),
  };
}

export { invokeIntegrationHttp };

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function handleSignedInvoke(req, res, invokePath, handler, secret) {
  const rawBody = await readRequestBody(req);

  const timestamp = req.headers['x-excload-proxy-timestamp'];
  const signature = req.headers['x-excload-proxy-signature'];
  const requestId = req.headers['x-excload-proxy-request-id'] || randomUUID();

  if (typeof timestamp !== 'string' || typeof signature !== 'string') {
    sendJson(res, 401, { ok: false, error: 'missing proxy auth headers' });
    return;
  }

  if (
    !verifySignature({
      method: 'POST',
      path: invokePath,
      body: rawBody,
      timestamp,
      signature,
      secret,
    })
  ) {
    sendJson(res, 401, { ok: false, error: 'invalid proxy signature' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid json body' });
    return;
  }

  try {
    const result = await handler(payload);
    // credential·주문본문·개인정보 로그 금지
    console.info('[integration-proxy] invoke ok', {
      requestId,
      path: invokePath,
      httpStatus: result.httpStatus,
    });
    sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invoke failed';
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.error('[integration-proxy] invoke failed', {
      requestId,
      path: invokePath,
      message: isAbort ? 'upstream timeout' : message,
    });
    sendJson(res, 502, {
      ok: false,
      httpStatus: 502,
      bodyText: '',
      error: isAbort ? 'upstream timeout' : message,
    });
  }
}

/**
 * @param {{ sharedSecret: string }} options
 */
export function createProxyServer({ sharedSecret }) {
  return createServer(async (req, res) => {
    if (req.url === '/healthz' && req.method === 'GET') {
      sendJson(res, 200, buildHealthzPayload());
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return;
    }

    if (req.url === INTEGRATION_INVOKE_PATH) {
      await handleSignedInvoke(req, res, INTEGRATION_INVOKE_PATH, invokeIntegrationHttp, sharedSecret);
      return;
    }

    if (req.url === COUPANG_INVOKE_PATH) {
      await handleSignedInvoke(req, res, COUPANG_INVOKE_PATH, invokeCoupang, sharedSecret);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  });
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  if (!SHARED_SECRET) {
    console.error('INTEGRATION_PROXY_SHARED_SECRET (or COUPANG_PROXY_SHARED_SECRET) is required');
    process.exit(1);
  }

  const server = createProxyServer({ sharedSecret: SHARED_SECRET });
  server.listen(PORT, () => {
    console.info(`integration proxy listening on :${PORT}`);
  });
}
