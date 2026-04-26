/** 휴대폰(가입/조회용): DB와 동일한 숫자만 남기기·검증 */

export function normalizeKoreanPhoneDigits(input: string): string {
  return input.replace(/[^0-9]/g, '');
}

export function isValidKoreanPhoneDigits(d: string): boolean {
  if (d.length < 10 || d.length > 11) return false;
  if (d.length === 11) return /^01[016789]\d{8}$/.test(d);
  return /^\d{10}$/.test(d);
}
