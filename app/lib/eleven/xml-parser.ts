/** 11번가 Seller REST XML 응답 — 경량 태그 추출 (외부 XML 의존성 없음) */

export function extractFirstXmlTagValue(xml: string, tagName: string): string {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escapeRegExp(tagName)}>`,
    'i',
  );
  const match = pattern.exec(xml);
  if (!match?.[1]) return '';
  return decodeXmlEntities(match[1].trim());
}

export function extractXmlBlocks(xml: string, tagName: string): string[] {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${escapeRegExp(tagName)}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:[\\w.-]+:)?${escapeRegExp(tagName)}>`,
    'gi',
  );
  return xml.match(pattern) ?? [];
}

export function parseXmlRecord(block: string, fieldNames: readonly string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const field of fieldNames) {
    record[field] = extractFirstXmlTagValue(block, field);
  }
  return record;
}

export function parseElevenApiError(xml: string): string | null {
  const trimmed = xml.trim();
  if (!trimmed.startsWith('<')) return null;

  const resultCode = extractFirstXmlTagValue(trimmed, 'resultCode');
  if (resultCode && resultCode !== '0' && resultCode !== '00') {
    const message =
      extractFirstXmlTagValue(trimmed, 'resultMessage') ||
      extractFirstXmlTagValue(trimmed, 'message') ||
      extractFirstXmlTagValue(trimmed, 'errorMessage');
    return message || `11번가 API 오류 (코드: ${resultCode})`;
  }

  const errorCode = extractFirstXmlTagValue(trimmed, 'errorCode');
  if (errorCode) {
    const message =
      extractFirstXmlTagValue(trimmed, 'errorMessage') ||
      extractFirstXmlTagValue(trimmed, 'message');
    return message || `11번가 API 오류 (코드: ${errorCode})`;
  }

  return null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
