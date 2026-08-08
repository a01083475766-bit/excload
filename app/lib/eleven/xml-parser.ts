/** 11번가 Seller REST XML 응답 — 경량 태그 추출 (외부 XML 의존성 없음) */

export type ElevenApiErrorInfo = {
  code: string;
  message: string;
  /** 화면·로그용: `[코드] 메시지` 또는 메시지만 */
  displayMessage: string;
};

export function extractFirstXmlTagValue(xml: string, tagName: string): string {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escapeRegExp(tagName)}>`,
    'i',
  );
  const match = pattern.exec(xml);
  if (!match?.[1]) return '';
  return decodeXmlEntities(match[1].trim());
}

/** 여러 후보 태그 중 첫 비어 있지 않은 값을 반환한다. */
export function extractFirstXmlTagValueAny(xml: string, tagNames: readonly string[]): string {
  for (const tagName of tagNames) {
    const value = extractFirstXmlTagValue(xml, tagName);
    if (value) return value;
  }
  return '';
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

function isSuccessResultCode(code: string): boolean {
  return code === '0' || code === '00';
}

function buildDisplayMessage(code: string, message: string): string {
  if (code && message) return `[${code}] ${message}`;
  if (message) return message;
  if (code) return `11번가 API 오류 (코드: ${code})`;
  return '11번가 API 오류가 발생했습니다.';
}

/** XML에서 11번가 오류 코드·문구를 구조화해 추출한다. 성공이면 null. */
export function extractElevenApiError(xml: string): ElevenApiErrorInfo | null {
  const trimmed = xml.trim();
  if (!trimmed.startsWith('<')) return null;

  // 공식: result_code / result_text · 호환: resultCode / resultMessage / error*
  const resultCode = extractFirstXmlTagValueAny(trimmed, ['result_code', 'resultCode']);
  if (resultCode && !isSuccessResultCode(resultCode)) {
    const message = extractFirstXmlTagValueAny(trimmed, [
      'result_text',
      'resultText',
      'resultMessage',
      'message',
      'errorMessage',
    ]);
    return {
      code: resultCode,
      message,
      displayMessage: buildDisplayMessage(resultCode, message),
    };
  }

  const errorCode = extractFirstXmlTagValueAny(trimmed, ['errorCode', 'error_code']);
  if (errorCode) {
    const message = extractFirstXmlTagValueAny(trimmed, [
      'errorMessage',
      'error_message',
      'message',
      'result_text',
      'resultMessage',
    ]);
    return {
      code: errorCode,
      message,
      displayMessage: buildDisplayMessage(errorCode, message),
    };
  }

  // 레거시 OpenAPI 스타일: <Error><Code>003</Code><Message>unregisteredKey</Message></Error>
  const legacyBlocks = extractXmlBlocks(trimmed, 'Error');
  for (const block of legacyBlocks) {
    const code = extractFirstXmlTagValueAny(block, [
      'Code',
      'errorCode',
      'error_code',
      'result_code',
      'resultCode',
    ]);
    if (!code || isSuccessResultCode(code)) continue;
    const message = extractFirstXmlTagValueAny(block, [
      'Message',
      'errorMessage',
      'error_message',
      'result_text',
      'resultMessage',
    ]);
    return {
      code,
      message,
      displayMessage: buildDisplayMessage(code, message),
    };
  }

  return null;
}

/** @deprecated — extractElevenApiError 사용. 호환용 문자열만 반환. */
export function parseElevenApiError(xml: string): string | null {
  return extractElevenApiError(xml)?.displayMessage ?? null;
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
