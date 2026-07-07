import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

type Cafe24OAuthStatePayload = {
  userId: string;
  accountId: string;
  mallId: string;
  nonce: string;
  ts: number;
};

function getOAuthStateSecret(): string {
  const secret =
    process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    '';
  if (!secret) {
    throw new Error('OAuth state 서명 키가 설정되지 않았습니다.');
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getOAuthStateSecret()).update(encodedPayload).digest('base64url');
}

export function createCafe24OAuthState(input: {
  userId: string;
  accountId: string;
  mallId: string;
}): string {
  const payload: Cafe24OAuthStatePayload = {
    userId: input.userId,
    accountId: input.accountId,
    mallId: input.mallId,
    nonce: randomBytes(16).toString('hex'),
    ts: Date.now(),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyCafe24OAuthState(state: string): Cafe24OAuthStatePayload | null {
  const [encodedPayload, signature] = state.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = signPayload(encodedPayload);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: Cafe24OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Cafe24OAuthStatePayload;
  } catch {
    return null;
  }

  if (!payload.userId || !payload.accountId || !payload.mallId || !payload.nonce || !payload.ts) {
    return null;
  }

  if (Date.now() - payload.ts > STATE_TTL_MS) {
    return null;
  }

  return payload;
}
