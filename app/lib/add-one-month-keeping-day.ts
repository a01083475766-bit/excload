/** 가입일·지급일 기준으로 같은 '일'을 유지하며 한 달 뒤 Date 반환 */
export function addOneMonthKeepingDay(baseDate: Date): Date {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();
  const hour = baseDate.getHours();
  const minute = baseDate.getMinutes();
  const second = baseDate.getSeconds();
  const millisecond = baseDate.getMilliseconds();

  const targetMonthStart = new Date(year, month + 1, 1, hour, minute, second, millisecond);
  const lastDayOfTargetMonth = new Date(year, month + 2, 0).getDate();
  targetMonthStart.setDate(Math.min(day, lastDayOfTargetMonth));
  return targetMonthStart;
}
