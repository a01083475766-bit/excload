/**
 * Upstream 응답 바이트 → UTF-8 문자열.
 * 11번가 등 EUC-KR XML을 response.text()(UTF-8 가정)로 깨뜨리지 않기 위함.
 */

const CHARSET_ALIASES = new Map([
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

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeCharsetLabel(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return null;
  return CHARSET_ALIASES.get(normalized) ?? normalized;
}

/**
 * @param {string | null | undefined} contentType
 * @returns {string | null}
 */
export function detectCharsetFromContentType(contentType) {
  if (!contentType) return null;
  const match = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType);
  return normalizeCharsetLabel(match?.[1]);
}

/**
 * XML 선언의 encoding을 latin1 프리뷰로 읽는다(ASCII 범위만 사용).
 * @param {Uint8Array} bytes
 * @returns {string | null}
 */
export function detectCharsetFromXmlDeclaration(bytes) {
  const previewLength = Math.min(bytes.byteLength, 256);
  let preview = '';
  for (let i = 0; i < previewLength; i += 1) {
    preview += String.fromCharCode(bytes[i] ?? 0);
  }
  const match = /<\?xml[^>]*encoding\s*=\s*["']\s*([^"']+)\s*["']/i.exec(preview);
  return normalizeCharsetLabel(match?.[1]);
}

/**
 * @param {Uint8Array} bytes
 * @returns {'utf-8' | null}
 */
export function detectBomCharset(bytes) {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8';
  }
  return null;
}

/**
 * @param {Uint8Array} bytes
 * @param {string} charset
 * @returns {string}
 */
export function decodeBytesWithCharset(bytes, charset) {
  const normalized = normalizeCharsetLabel(charset) ?? 'utf-8';
  const candidates = normalized === 'euc-kr' ? ['euc-kr', 'windows-949', 'utf-8'] : [normalized, 'utf-8'];

  let lastError;
  for (const label of candidates) {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    return Buffer.from(bytes).toString('utf8');
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * @param {Uint8Array | ArrayBuffer} body
 * @param {string | null | undefined} contentType
 * @returns {{ text: string; encoding: string; contentType: string | null }}
 */
export function decodeResponseBody(body, contentType) {
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
