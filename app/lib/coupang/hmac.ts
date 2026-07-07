import { createHmac } from 'crypto';

const COUPANG_API_HOST = 'api-gateway.coupang.com';

function formatSignedDate(date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function splitPathAndQuery(pathWithOptionalQuery: string): { path: string; query: string } {
  const questionIndex = pathWithOptionalQuery.indexOf('?');
  if (questionIndex === -1) {
    return { path: pathWithOptionalQuery, query: '' };
  }
  return {
    path: pathWithOptionalQuery.slice(0, questionIndex),
    query: pathWithOptionalQuery.slice(questionIndex + 1),
  };
}

export function buildCoupangAuthorizationHeader(input: {
  method: string;
  pathWithQuery: string;
  accessKey: string;
  secretKey: string;
  signedDate?: string;
}): { authorization: string; signedDate: string } {
  const signedDate = input.signedDate ?? formatSignedDate();
  const { path, query } = splitPathAndQuery(input.pathWithQuery);
  const message = `${signedDate}${input.method.toUpperCase()}${path}${query}`;
  const signature = createHmac('sha256', input.secretKey).update(message, 'utf8').digest('hex');
  const authorization = `CEA algorithm=HmacSHA256, access-key=${input.accessKey}, signed-date=${signedDate}, signature=${signature}`;

  return { authorization, signedDate };
}

export function buildCoupangApiUrl(pathWithQuery: string): string {
  return `https://${COUPANG_API_HOST}${pathWithQuery}`;
}

export { COUPANG_API_HOST };
