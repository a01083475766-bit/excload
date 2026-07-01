/**
 * 커머스 리포트 뉴스레터 — AI 프롬프트 빌더 (순수 함수)
 *
 * ⚠️ 네이버 원본 응답·상품/포스트/기사 리스트는 여기 들어오지 않습니다.
 * 호출부에서 이미 요약된 값(KeywordReferenceSummary)만 전달합니다.
 */

import type { CommerceReportSettingsData, KeywordReferenceSummary } from './types';

const TONE_LABELS: Record<CommerceReportSettingsData['toneStyle'], string> = {
  PLAIN: '담백하고 정보 전달 위주로',
  FRIENDLY: '친근하고 편안한 말투로',
  PROFESSIONAL: '전문적이고 신뢰감 있는 어투로',
};

export function buildCommerceNewsletterSystemPrompt(
  settings: CommerceReportSettingsData,
  extraInstruction?: string,
): string {
  const toneLabel = TONE_LABELS[settings.toneStyle] ?? TONE_LABELS.PLAIN;
  const bannedWordsText =
    settings.bannedWords.length > 0 ? settings.bannedWords.join(', ') : '(지정된 금지 표현 없음)';

  return [
    '당신은 이커머스 트렌드 뉴스레터를 작성하는 전문 에디터입니다.',
    '사용자 메시지로 제공되는 키워드별 실시간 참고 데이터를 바탕으로,',
    '블로그·카페에 게시할 커머스 뉴스레터 초안을 작성하세요.',
    '',
    '[제공되는 데이터 구조]',
    '각 키워드는 shopping(쇼핑 검색 요약)·blog(블로그 언급 요약)·news(뉴스 이슈 요약) 3가지 참고 데이터를 가집니다.',
    'blog 또는 news 값이 null이면 해당 키워드는 그 데이터가 조회되지 않은 것이므로, 없는 데이터로 취급하고 언급하지 마세요.',
    '',
    `[문체] ${toneLabel} 작성하세요.`,
    '',
    `[절대 금지 표현] 다음 표현은 절대 사용하지 마세요: ${bannedWordsText}`,
    '',
    `[안내 문구] 본문(body) 끝부분에 다음 문구를 자연스럽게 포함하세요: "${settings.adPhrase}"`,
    '',
    '[작성 규칙]',
    '- 제공된 데이터에 없는 순위·증감률·전주/전년 대비 비교·판매량·거래량·매출은 절대 만들어내지 마세요.',
    '- shopping의 상품수·가격대·가격 구간 비율·브랜드·쇼핑몰·자주 보이는 단어·대표 카테고리는 제공된 값만 사용하세요.',
    '- blog의 언급 게시물 수·자주 쓰는 표현·고민형 표현은 "최근 블로그에서는 이런 표현이 자주 보인다" 정도의 참고 서술로만 쓰세요.',
    '- news의 기사 수·이슈 키워드는 "최근 이런 이슈/키워드가 함께 언급된다" 정도의 배경 설명으로만 쓰고, 특정 사건을 단정적으로 설명하지 마세요.',
    '- blog·news의 검색 클릭 수치를 판매량·구매 전환·매출로 해석하거나 단정하지 마세요.',
    '- 과장된 확정 표현(무조건, 반드시, 100% 등) 대신 참고용 정보임을 유지하세요.',
    '',
    '[출력 형식]',
    '다른 설명이나 코드블록 없이, 반드시 아래 JSON 객체 형식으로만 응답하세요.',
    '{',
    '  "title": "뉴스레터 제목 (1문장)",',
    '  "summary": "3~4문장 요약",',
    '  "body": "본문 (여러 단락, 단락 구분은 줄바꿈 두 번 \\n\\n)",',
    '  "tags": ["키워드1", "키워드2"]',
    '}',
    ...(extraInstruction ? ['', `[추가 지시] ${extraInstruction}`] : []),
  ].join('\n');
}

export function buildCommerceNewsletterUserContent(keywordSummaries: KeywordReferenceSummary[]): string {
  return [
    '아래는 키워드별 실시간 참고 데이터입니다',
    '(네이버 쇼핑/블로그/뉴스 검색 API 요약값, JSON, 원본 리스트 아님):',
    JSON.stringify(
      keywordSummaries.map(({ keyword, shopping, blog, news }) => ({ keyword, shopping, blog, news })),
    ),
  ].join('\n');
}
