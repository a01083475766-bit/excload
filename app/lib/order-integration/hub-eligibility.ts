/**
 * 주문조회 결과의 hubEligible 판정.
 * 쿠팡·롯데ON·카페24는 hubEligible===true 일 때만 미리보기 담기 허용.
 * 그 외 몰은 hubEligible===false 가 아니면 허용(미지정 포함).
 */
export function isRowHubEligible(row: {
  mallId: string;
  hubEligible?: boolean;
}): boolean {
  if (row.mallId === 'coupang' || row.mallId === 'lotteon' || row.mallId === 'cafe24') {
    return row.hubEligible === true;
  }
  return row.hubEligible !== false;
}
