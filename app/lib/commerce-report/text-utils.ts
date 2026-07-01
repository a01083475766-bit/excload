/**
 * 커머스 리포트 — 텍스트 요약용 공통 유틸 (순수 함수)
 *
 * ⚠️ 네이버 쇼핑/블로그/뉴스 검색 API 응답을 요약값으로 변환할 때 공통으로 쓰입니다.
 * 입력 텍스트(제목·설명 원문)는 이 함수들 실행 중에만 쓰이고 반환값에는 포함되지 않습니다.
 */

const NUMERIC_OR_UNIT_TOKEN = /^\d+(\.\d+)?(kg|g|mg|ml|l|cm|mm|m|인치|개입|개|팩|매|호|ea|box|세트)?$/i;

export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/** 제목/설명 텍스트를 토큰 배열로 분리 (공통 불용어·숫자/단위·제외어 필터링) */
export function tokenizeText(text: string, stopwords: Set<string>, excludeWords: string[] = []): string[] {
  const cleaned = stripHtmlTags(text);
  const excludeSet = new Set(excludeWords.map((w) => w.trim()).filter(Boolean));
  return cleaned
    .split(/[\s/,.·()\[\]{}_\-+"'!?~^%※]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !excludeSet.has(token))
    .filter((token) => !stopwords.has(token))
    .filter((token) => !NUMERIC_OR_UNIT_TOKEN.test(token));
}

/** 토큰 목록에서 빈도 TOP N 단어 추출 */
export function topFrequentTokens(tokenLists: string[][], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const tokens of tokenLists) {
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

/** 연속된 두 토큰을 묶어 "OO 준비물" 같은 짧은 구(phrase) 후보를 만들고 빈도 TOP N만 반환 */
export function topFrequentBigramPhrases(tokenLists: string[][], limit: number, minCount = 2): string[] {
  const counts = new Map<string, number>();
  for (const tokens of tokenLists) {
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase]) => phrase);
}

/** 고정된 표현 사전과 대조해서, 텍스트 목록에 실제로 등장한 표현만 반환 (등장 빈도 내림차순) */
export function findMatchingPhrases(texts: string[], dictionary: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  const cleanedTexts = texts.map((t) => stripHtmlTags(t));
  for (const phrase of dictionary) {
    let count = 0;
    for (const text of cleanedTexts) {
      if (text.includes(phrase)) count += 1;
    }
    if (count > 0) counts.set(phrase, count);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase]) => phrase);
}

/** 빈도 집계용 카운터를 만들고 TOP N의 [이름] 배열만 반환 (브랜드/몰명 등 단순 카운팅에 사용) */
export function topFrequentValues(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}
