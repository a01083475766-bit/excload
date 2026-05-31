/**
 * 엑셀 숫자 셀로 읽힌 전화번호의 선행 0 복원 (Stage2·미리보기·다운로드 공통)
 */

const PHONE_BASE_HEADER_PATTERN = /전화|연락처/;

export function isPhoneBaseHeader(baseHeader: string): boolean {
  return PHONE_BASE_HEADER_PATTERN.test(baseHeader);
}

/**
 * 엑셀에서 leading 0이 떨어진 한국 전화 숫자열 보정
 * - 10자리·10으로 시작 → 휴대(010 등)
 * - 9자리·2로 시작 → 02 등 수도권
 * - 10자리·5로 시작 → 0507 등 지역/인터넷
 */
export function restoreLeadingZeroForKoreanPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length === 0) return d;
  if (d.startsWith('0')) return d;

  if (d.length === 10 && d.startsWith('10')) {
    return `0${d}`;
  }
  if (d.length === 9 && d.startsWith('2')) {
    return `0${d}`;
  }
  if (d.length === 10 && d.startsWith('5')) {
    return `0${d}`;
  }

  return d;
}

export function coerceStage2CellValue(value: unknown, baseHeader: string): string {
  if (value == null) return '';

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (isPhoneBaseHeader(baseHeader)) {
      const asInt = Number.isInteger(value) ? String(Math.trunc(value)) : String(value);
      return restoreLeadingZeroForKoreanPhoneDigits(asInt);
    }
    return String(value).trim();
  }

  const asString = String(value).trim();
  if (isPhoneBaseHeader(baseHeader) && /^\d+$/.test(asString)) {
    return restoreLeadingZeroForKoreanPhoneDigits(asString);
  }

  return asString;
}
