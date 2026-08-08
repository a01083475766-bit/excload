/**
 * Upstream 응답 바이트 → UTF-8 문자열.
 * 11번가 등 EUC-KR XML을 response.text()(UTF-8 가정)로 깨뜨리지 않기 위함.
 * Lightsail 프록시(`services/coupang-proxy/decode-response-body.mjs`)와 동일 규칙.
 */

const CHARSET_ALIASES = new Map<string, string>([
  ['euc-kr', 'euc-kr'],
  ['euckr', 'euc-kr'],
  ['cseuckr', 'euc-kr'],
  ['ks_c_5601-1987', 'euc-kr'],
  ['ksc_5601', 'euc-kr'],
  ['windows-949', 'euc-kr'],
  ['ms949', 'euc-kr'],
  ['uhc', 'euc-kr'],
  ['utf-8', 'utf-8'],
  ['utf8', 'utf-8'],
  ['us-ascii', 'utf-8'],
  ['ascii', 'utf-8'],
  ['iso-8859-1', 'iso-8859-1'],
  ['latin1', 'iso-8859-1'],
]);

export function normalizeCharsetLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return null;
  return CHARSET_ALIASES.get(normalized) ?? normalized;
}

export function detectCharsetFromContentType(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType);
  return normalizeCharsetLabel(match?.[1]);
}

export function detectCharsetFromXmlDeclaration(bytes: Uint8Array): string | null {
  const previewLength = Math.min(bytes.byteLength, 256);
  let preview = '';
  for (let i = 0; i < previewLength; i += 1) {
    preview += String.fromCharCode(bytes[i] ?? 0);
  }
  const match = /<\?xml[^>]*encoding\s*=\s*["']\s*([^"']+)\s*["']/i.exec(preview);
  return normalizeCharsetLabel(match?.[1]);
}

export function detectBomCharset(bytes: Uint8Array): 'utf-8' | null {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8';
  }
  return null;
}

export function decodeBytesWithCharset(bytes: Uint8Array, charset: string): string {
  const normalized = normalizeCharsetLabel(charset) ?? 'utf-8';
  const candidates =
    normalized === 'euc-kr' ? ['euc-kr', 'windows-949', 'utf-8'] : [normalized, 'utf-8'];

  for (const label of candidates) {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      // try next label
    }
  }

  return Buffer.from(bytes).toString('utf8');
}

export function decodeResponseBody(
  body: Uint8Array | ArrayBuffer,
  contentType?: string | null,
): { text: string; encoding: string; contentType: string | null } {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const headerCharset = detectCharsetFromContentType(contentType);
  const bomCharset = detectBomCharset(bytes);
  const xmlCharset = detectCharsetFromXmlDeclaration(bytes);
  const encoding = bomCharset ?? headerCharset ?? xmlCharset ?? 'utf-8';
  return {
    text: decodeBytesWithCharset(bytes, encoding),
    encoding,
    contentType: contentType ?? null,
  };
}
