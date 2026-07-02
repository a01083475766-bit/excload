/**
 * "네이버 BEST 키워드 가져오기" — 실험 기능 타입
 *
 * ⚠️ 순위·키워드명·카테고리·등락 라벨만 다룹니다. 상품명·링크·이미지·가격·리뷰수·판매자 정보는
 * 이 도메인 어디에도 포함하지 않습니다.
 */
export interface NaverBestKeywordItem {
  rank: number;
  keyword: string;
  category: string | null;
  /** "유지" / "상승" / "하락" / "급등" 등 페이지에 표시된 등락 라벨 원문 (없으면 null) */
  changeLabel: string | null;
}
