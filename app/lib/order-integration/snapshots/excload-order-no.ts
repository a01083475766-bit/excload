/**
 * excloadOrderNo 발급 — Phase C-1a 테스트용 순수 함수.
 * 운영 환경에서는 DB sequence + transaction으로 중복을 방지해야 한다.
 */

export function formatExcloadOrderNoDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function generateExcloadOrderNo(input: {
  date?: Date;
  dateKey?: string;
  sequence: number;
}): string {
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new Error('excloadOrderNo sequence는 1 이상의 정수여야 합니다.');
  }

  const dateKey = input.dateKey ?? formatExcloadOrderNoDateKey(input.date ?? new Date());
  const seq = String(input.sequence).padStart(6, '0');
  return `EXC-${dateKey}-${seq}`;
}
