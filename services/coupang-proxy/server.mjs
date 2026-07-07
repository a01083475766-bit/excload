/**
 * 쿠팡 Open API 고정 IP 프록시 — 참조 서버
 *
 * 배포: Lightsail / EC2 등 고정 outbound IP가 있는 VM
 * Vercel env: COUPANG_PROXY_BASE_URL, COUPANG_PROXY_SHARED_SECRET
 *
 * 실행:
 *   COUPANG_PROXY_SHARED_SECRET=... node server.mjs
 *
 * ⚠️ 참조 구현입니다. 운영 전 HTTPS(TLS), requestId 중복 차단, 로그 마스킹을 보강하세요.
 */

import { createServer } from 'node:http';
import { createHash, createHmac, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const SHARED_SECRET = process.env.COUPANG_PROXY_SHARED_SECRET?.trim();
const INVOKE_PATH = '/internal/coupang/invoke';
const MAX_AGE_MS = 5 * 60 * 1000;

if (!SHARED_SECRET) {
  console.error('COUPANG_PROXY_SHARED_SECRET is required');
  process.exit(1);
}

function hashBody(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function verifySignature({ method, path, body, timestamp, signature }) {
  const requestTime = Date.parse(timestamp);
  if (Number.isNaN(requestTime)) return false;
  if (Math.abs(Date.now() - requestTime) > MAX_AGE_MS) return false;

  const message = `${timestamp}${method.toUpperCase()}${path}${hashBody(body)}`;
  const expected = createHmac('sha256', SHARED_SECRET).update(message, 'utf8').digest('hex');
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
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
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
  return authorization;
}

async function invokeCoupang(payload) {
  const authorization = buildCoupangAuthorization({
    method: payload.method,
    pathWithQuery: payload.pathWithQuery,
    accessKey: payload.accessKey,
    secretKey: payload.secretKey,
  });

  const url = `https://api-gateway.coupang.com${payload.pathWithQuery}`;
  const response = await fetch(url, {
    method: payload.method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-By': payload.vendorId,
      'X-MARKET': 'KR',
      'X-EXTENDED-TIMEOUT': '90000',
    },
    body: payload.body != null ? JSON.stringify(payload.body) : undefined,
  });

  return {
    httpStatus: response.status,
    bodyText: await response.text(),
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.url === '/healthz' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.url !== INVOKE_PATH || req.method !== 'POST') {
    sendJson(res, 404, { ok: false, error: 'not found' });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  const timestamp = req.headers['x-excload-proxy-timestamp'];
  const signature = req.headers['x-excload-proxy-signature'];
  const requestId = req.headers['x-excload-proxy-request-id'] || randomUUID();

  if (typeof timestamp !== 'string' || typeof signature !== 'string') {
    sendJson(res, 401, { ok: false, error: 'missing proxy auth headers' });
    return;
  }

  if (!verifySignature({
    method: 'POST',
    path: INVOKE_PATH,
    body: rawBody,
    timestamp,
    signature,
  })) {
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
    const result = await invokeCoupang(payload);
    console.info('[coupang-proxy] invoke ok', { requestId, httpStatus: result.httpStatus });
    sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('[coupang-proxy] invoke failed', { requestId, message: error?.message });
    sendJson(res, 502, {
      ok: false,
      httpStatus: 502,
      bodyText: '',
      error: 'coupang upstream failed',
    });
  }
});

server.listen(PORT, () => {
  console.info(`coupang proxy listening on :${PORT}`);
});
