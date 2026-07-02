/**
 * 커머스 리포트 — "추천 키워드 자동 찾기" 후보 추출 (순수 함수)
 *
 * ⚠️ 입력으로 받은 원본 상품명(title)·brand·maker는 이 함수 실행 중에만 사용되고
 * 반환값(후보 키워드 문자열 배열)에는 포함되지 않습니다.
 * ⚠️ 판매순위·판매량이 아니라 상품명에 등장하는 표현의 "빈도"만 다룹니다.
 */

import {
  countBigramFrequency,
  countTokenFrequency,
  tokenizeText,
  topFrequentValues,
} from './text-utils';
import { MAX_KEYWORD_CANDIDATES } from './constants';
import type { NaverShoppingRawItem } from './naver-shopping/types';

/** 쇼핑 요약(summarize.ts)의 기본 불용어 + 이 기능 전용 확장 불용어 */
const CANDIDATE_STOPWORDS = new Set([
  '상품', '제품', '정품', '무료배송', '당일발송', '베스트', '인기', '신상', '단독', '특가',
  '추천', '무료', '배송', '세트', '대형', '미니',
]);

const TOP_BRAND_POOL = 15;

interface CandidateEntry {
  text: string;
  count: number;
  isBrandRelated: boolean;
}

/** 후보 문자열이 브랜드 세트와 겹치는 단어를 포함하는지 (단일 단어는 완전 일치, 구는 구성 단어 중 하나라도 일치) */
function containsBrandWord(candidate: string, brandSet: Set<string>): boolean {
  return candidate.split(' ').some((word) => brandSet.has(word));
}

/**
 * 시드 키워드별로 조회한 네이버 쇼핑 검색 결과(원본 items)에서 후보 키워드를 추출합니다.
 *
 * @param seedKeywords 이번에 실제로 사용된 시드 키워드 목록 (후보에서 자기 자신 제외용)
 * @param itemsBySeed 시드별 원본 상품 items 배열의 배열 (조회 실패한 시드는 빈 배열로 전달)
 */
export function extractKeywordCandidates(
  seedKeywords: string[],
  itemsBySeed: NaverShoppingRawItem[][],
): string[] {
  const allItems = itemsBySeed.flat();
  if (allItems.length === 0) return [];

  // brand가 비어 있으면 maker로 대체 — 브랜드명 세트를 만들어 후보 제외/우선순위 낮추기에 사용
  const brandOrMakerValues = allItems.map((item) => {
    const brand = typeof item.brand === 'string' ? item.brand.trim() : '';
    if (brand) return brand;
    const maker = typeof item.maker === 'string' ? item.maker.trim() : '';
    return maker;
  });
  const brandSet = new Set(topFrequentValues(brandOrMakerValues, TOP_BRAND_POOL));

  const tokenLists = allItems.map((item) =>
    tokenizeText(typeof item.title === 'string' ? item.title : '', CANDIDATE_STOPWORDS, seedKeywords),
  );

  const singleWordCounts = countTokenFrequency(tokenLists);
  const bigramCounts = countBigramFrequency(tokenLists);

  const entries: CandidateEntry[] = [];
  for (const [text, count] of singleWordCounts.entries()) {
    // 단일 단어는 브랜드명과 완전히 같으면 후보에서 제외
    if (brandSet.has(text)) continue;
    entries.push({ text, count, isBrandRelated: false });
  }
  for (const [text, count] of bigramCounts.entries()) {
    if (count < 2) continue; // 1회만 등장한 구는 우연의 일치일 가능성이 높아 제외
    entries.push({ text, count, isBrandRelated: containsBrandWord(text, brandSet) });
  }

  entries.sort((a, b) => {
    // 브랜드명이 섞인 구는 완전히 제외하지 않되 우선순위를 낮춤
    if (a.isBrandRelated !== b.isBrandRelated) return a.isBrandRelated ? 1 : -1;
    return b.count - a.count;
  });

  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.text)) continue;
    seen.add(entry.text);
    result.push(entry.text);
    if (result.length >= MAX_KEYWORD_CANDIDATES) break;
  }
  return result;
}
