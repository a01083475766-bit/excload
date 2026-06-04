/** 닉네임 비교용: 공백 제거 + 소문자 */
function normalizeNickname(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

/** 닉네임 전체가 이 문자열과 같으면 거부 */
const NICKNAME_EXACT_BLOCKED = [
  '운영',
  '관리',
  '공식',
  'admin',
  'akman',
  'excload',
  '엑클로드',
] as const;

/** 닉네임에 포함되면 거부 (운영자·브랜드 사칭) */
const NICKNAME_CONTAINS_BLOCKED = [
  '엑클로드',
  'excload',
  'akman',
  '운영자',
  '운영팀',
  '관리자',
  '고객센터',
  '공식',
] as const;

export const RESERVED_NICKNAME_MESSAGE =
  '운영자·공식 계정을 연상시키는 닉네임은 사용할 수 없습니다.';

export function isReservedNickname(nickname: string): boolean {
  const normalized = normalizeNickname(nickname);
  if (!normalized) return false;

  if (NICKNAME_EXACT_BLOCKED.some((term) => normalized === term.toLowerCase())) {
    return true;
  }

  return NICKNAME_CONTAINS_BLOCKED.some((term) =>
    normalized.includes(term.toLowerCase()),
  );
}
