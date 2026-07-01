/**
 * 커머스 리포트 뉴스레터 — AI 프롬프트 빌더 (순수 함수)
 *
 * ⚠️ 네이버 원본 응답·상품 리스트는 여기 들어오지 않습니다.
 * 호출부에서 이미 요약된 값(NaverShoppingPreviewSummary)만 전달합니다.
 */

import type { CommerceReportSettingsData } from './types';

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
    `[문체] ${toneLabel} 작성하세요.`,
    '',
    `[절대 금지 표현] 다음 표현은 절대 사용하지 마세요: ${bannedWordsText}`,
    '',
    `[안내 문구] 본문(body) 끝부분에 다음 문구를 자연스럽게 포함하세요: "${settings.adPhrase}"`,
    '',
    '[작성 규칙]',
    '- 제공된 데이터에 없는 순위·증감률·전주/전년 대비 비교는 절대 만들어내지 마세요.',
    '- 상품수·가격대·자주 보이는 단어·대표 카테고리는 제공된 값만 사용하세요.',
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

export function buildCommerceNewsletterUserContent(
  keywordSummaries: Array<{
    keyword: string;
    productCount: number;
    priceRange: { min: number; max: number; avg: number; sampleSize: number };
    frequentWords: string[];
    representativeCategory: string | null;
  }>,
): string {
  return [
    '아래는 키워드별 실시간 참고 데이터입니다 (네이버 쇼핑 검색 API 요약값, JSON):',
    JSON.stringify(keywordSummaries),
  ].join('\n');
}
