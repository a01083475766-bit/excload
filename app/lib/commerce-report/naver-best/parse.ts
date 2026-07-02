/**
 * "네이버 BEST 키워드 가져오기" — HTML 파싱 (순수 함수, 실험 기능)
 *
 * ⚠️ 클래스명 뒤 해시(예: "__g38oq")는 네이버 쪽 배포마다 바뀔 수 있어, 접두사(prefix)만으로
 * 느슨하게 매칭합니다. 그래도 구조가 크게 바뀌면 매칭에 실패할 수 있으며, 이 경우 빈 배열을
 * 반환합니다 — 실패 판정(0개 처리)은 호출부(route.ts)에서 수행합니다.
 * ⚠️ 순위·키워드명·카테고리·등락 라벨만 추출 대상입니다. 같은 랭킹 블록에 함께 렌더링되는
 * 상품명·상품 링크·이미지·가격·리뷰수·판매자 정보는 애초에 매칭 패턴에 포함하지 않습니다.
 */
import type { NaverBestKeywordItem } from './types';

const MAX_ITEMS = 20;
/**
 * 키워드 제목 앞뒤로 순위/등락/카테고리를 찾아볼 범위 (문자 수).
 * ⚠️ "급등" 상태는 인라인 SVG 아이콘(약 700자 이상)이 순위 숫자와 제목 사이에 끼어 있어
 * 넉넉하게 잡아야 합니다 (실제 샘플로 검증한 값).
 */
const SEARCH_WINDOW = 1500;

const TITLE_PATTERN = /rankingTitleResponsive_title__[\w-]+"[^>]*>([^<]{1,40})<\/strong>/g;
const RANK_PATTERN = /rankingTitleResponsive_ranking__[\w-]+"[^>]*>(\d{1,3})/g;
const CHANGE_PATTERN = /class="blind">랭킹\s*([^<]{0,10})</g;
const CATEGORY_PATTERN = /rankingTitleResponsive_tag__[\w-]+"[^>]*>([^<]{1,30})<\/em>/;

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** 전역(global) 정규식으로 찾은 매치 중 가장 마지막(=검색 대상 문자열 끝에 가장 가까운) 것만 반환 */
function findLastMatch(pattern: RegExp, text: string): RegExpMatchArray | null {
  const matches = [...text.matchAll(pattern)];
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

export function parseNaverBestKeywordsHtml(html: string): NaverBestKeywordItem[] {
  const items: NaverBestKeywordItem[] = [];
  const seenRanks = new Set<number>();

  TITLE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TITLE_PATTERN.exec(html)) !== null) {
    const keyword = decodeBasicHtmlEntities(match[1]);
    if (!keyword) continue;

    const windowStart = Math.max(0, match.index - SEARCH_WINDOW);
    const before = html.slice(windowStart, match.index);
    const after = html.slice(match.index, Math.min(html.length, match.index + SEARCH_WINDOW));

    // 순위 숫자는 제목 앞쪽 블록에서 가장 가까운(=마지막) 매치를 사용
    const rankMatch = findLastMatch(RANK_PATTERN, before);
    if (!rankMatch) continue;
    const rank = Number.parseInt(rankMatch[1], 10);
    if (!Number.isFinite(rank) || rank <= 0 || rank > 200 || seenRanks.has(rank)) continue;

    const changeMatch = findLastMatch(CHANGE_PATTERN, before);
    const categoryMatch = CATEGORY_PATTERN.exec(after);

    seenRanks.add(rank);
    items.push({
      rank,
      keyword,
      category: categoryMatch ? decodeBasicHtmlEntities(categoryMatch[1]) || null : null,
      changeLabel: changeMatch ? decodeBasicHtmlEntities(changeMatch[1]) || null : null,
    });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, MAX_ITEMS);
}
