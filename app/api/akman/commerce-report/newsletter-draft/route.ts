/**
 * POST /api/akman/commerce-report/newsletter-draft — 참고 데이터 기반 뉴스레터 초안 생성 (관리자 전용)
 *
 * ⚠️ /api/ai-gateway를 직접 호출하지 않습니다 (일반 사용자용 트라이얼·게이트 로직과 무관한
 *   관리자 전용 흐름이라 독립 라우트로 분리, OpenAI 호출 패턴만 참고).
 * ⚠️ DB 저장 없음. AI에는 네이버 원본 응답·상품/포스트/기사 리스트를 넘기지 않고 요약값만 전달합니다.
 * ⚠️ NEXT_PUBLIC_AI_ENABLED(브라우저 공개용)에는 의존하지 않고, 서버 전용 OPENAI_API_KEY
 *   존재 여부로만 사용 가능 여부를 판단합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { getCommerceReportSettings } from '@/app/lib/commerce-report/settings';
import {
  buildCommerceNewsletterSystemPrompt,
  buildCommerceNewsletterUserContent,
} from '@/app/lib/commerce-report/newsletter-prompt';
import type { CommerceReportSettingsData, KeywordReferenceSummary } from '@/app/lib/commerce-report/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface NewsletterDraftResult {
  title: string;
  summary: string;
  body: string;
  tags: string[];
}

type DraftCallResult =
  | { ok: true; draft: NewsletterDraftResult }
  | { ok: false; reason: 'call_failed' | 'parse_failed' };

function stripCodeFence(input: string): string {
  return input
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function extractJsonObject(input: string): string {
  const first = input.indexOf('{');
  const last = input.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return input.slice(first, last + 1);
  }
  return input;
}

function validateDraftShape(value: unknown): NewsletterDraftResult | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || !v.title.trim()) return null;
  if (typeof v.summary !== 'string' || !v.summary.trim()) return null;
  if (typeof v.body !== 'string' || !v.body.trim()) return null;
  if (!Array.isArray(v.tags) || v.tags.length === 0 || !v.tags.every((t) => typeof t === 'string')) {
    return null;
  }
  return { title: v.title, summary: v.summary, body: v.body, tags: v.tags as string[] };
}

function findBannedWordHits(draft: NewsletterDraftResult, bannedWords: string[]): string[] {
  if (bannedWords.length === 0) return [];
  const haystack = `${draft.title} ${draft.summary} ${draft.body} ${draft.tags.join(' ')}`.toLowerCase();
  return bannedWords.filter((word) => word.trim() && haystack.includes(word.trim().toLowerCase()));
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function sanitizeShoppingSummary(value: unknown): KeywordReferenceSummary['shopping'] | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const priceRange = v.priceRange as Record<string, unknown> | undefined;
  const priceBuckets = Array.isArray(v.priceBuckets)
    ? v.priceBuckets
        .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
        .map((b) => ({
          range: typeof b.range === 'string' ? b.range : '',
          ratio: typeof b.ratio === 'number' ? b.ratio : 0,
        }))
    : [];
  return {
    productCount: typeof v.productCount === 'number' ? v.productCount : 0,
    priceRange: {
      min: typeof priceRange?.min === 'number' ? priceRange.min : 0,
      max: typeof priceRange?.max === 'number' ? priceRange.max : 0,
      avg: typeof priceRange?.avg === 'number' ? priceRange.avg : 0,
      sampleSize: typeof priceRange?.sampleSize === 'number' ? priceRange.sampleSize : 0,
    },
    frequentWords: sanitizeStringArray(v.frequentWords),
    representativeCategory: typeof v.representativeCategory === 'string' ? v.representativeCategory : null,
    topBrands: sanitizeStringArray(v.topBrands),
    topMalls: sanitizeStringArray(v.topMalls),
    priceBuckets,
  };
}

function sanitizeBlogSummary(value: unknown): KeywordReferenceSummary['blog'] {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return {
    postCount: typeof v.postCount === 'number' ? v.postCount : 0,
    frequentPhrases: sanitizeStringArray(v.frequentPhrases),
    concernPhrases: sanitizeStringArray(v.concernPhrases),
    periodDays: typeof v.periodDays === 'number' ? v.periodDays : 30,
    fetchedCount: typeof v.fetchedCount === 'number' ? v.fetchedCount : 0,
    usedCount: typeof v.usedCount === 'number' ? v.usedCount : 0,
    excludedOldCount: typeof v.excludedOldCount === 'number' ? v.excludedOldCount : 0,
  };
}

function sanitizeNewsSummary(value: unknown): KeywordReferenceSummary['news'] {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return {
    articleCount: typeof v.articleCount === 'number' ? v.articleCount : 0,
    issueKeywords: sanitizeStringArray(v.issueKeywords),
    periodDays: typeof v.periodDays === 'number' ? v.periodDays : 7,
    fetchedCount: typeof v.fetchedCount === 'number' ? v.fetchedCount : 0,
    usedCount: typeof v.usedCount === 'number' ? v.usedCount : 0,
    excludedOldCount: typeof v.excludedOldCount === 'number' ? v.excludedOldCount : 0,
  };
}

function sanitizeKeywordSummary(item: unknown): KeywordReferenceSummary | null {
  if (!item || typeof item !== 'object') return null;
  const v = item as Record<string, unknown>;
  if (typeof v.keyword !== 'string' || !v.keyword.trim()) return null;
  const shopping = sanitizeShoppingSummary(v.shopping);
  if (!shopping) return null;
  return {
    keyword: v.keyword,
    fetchedAt: typeof v.fetchedAt === 'string' ? v.fetchedAt : new Date().toISOString(),
    shopping,
    blog: sanitizeBlogSummary(v.blog),
    news: sanitizeNewsSummary(v.news),
  };
}

async function callOpenAiForDraft(
  apiKey: string,
  keywordSummaries: KeywordReferenceSummary[],
  settings: CommerceReportSettingsData,
  extraInstruction?: string,
): Promise<DraftCallResult> {
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  const systemPrompt = buildCommerceNewsletterSystemPrompt(settings, extraInstruction);
  const userContent = buildCommerceNewsletterUserContent(keywordSummaries);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.7,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    console.error('[CommerceNewsletterDraft] fetch failed', err instanceof Error ? err.message : 'unknown');
    return { ok: false, reason: 'call_failed' };
  }

  if (!response.ok) {
    console.error('[CommerceNewsletterDraft] OpenAI API error', { status: response.status });
    return { ok: false, reason: 'call_failed' };
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, reason: 'parse_failed' };
  }

  try {
    const parsed = JSON.parse(extractJsonObject(stripCodeFence(content)));
    const draft = validateDraftShape(parsed);
    if (!draft) return { ok: false, reason: 'parse_failed' };
    return { ok: true, draft };
  } catch {
    return { ok: false, reason: 'parse_failed' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI 초안 생성 기능을 사용할 수 없습니다. 관리자에게 문의해 주세요.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const rawSummaries = Array.isArray(body?.keywordSummaries) ? body.keywordSummaries : [];
    const keywordSummaries = rawSummaries
      .map(sanitizeKeywordSummary)
      .filter((v: KeywordReferenceSummary | null): v is KeywordReferenceSummary => v !== null);

    if (keywordSummaries.length === 0) {
      return NextResponse.json({ error: '먼저 오늘 참고 데이터를 조회해 주세요.' }, { status: 400 });
    }

    const settings = await getCommerceReportSettings();

    const firstAttempt = await callOpenAiForDraft(apiKey, keywordSummaries, settings);
    if (!firstAttempt.ok) {
      const message =
        firstAttempt.reason === 'parse_failed'
          ? 'AI 응답을 처리하지 못했습니다. 다시 시도해 주세요.'
          : '초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      return NextResponse.json({ error: message }, { status: 502 });
    }

    let finalDraft = firstAttempt.draft;
    let bannedWordsFound = findBannedWordHits(finalDraft, settings.bannedWords);

    if (bannedWordsFound.length > 0) {
      const retryInstruction = `이전 응답에 다음 금지 표현이 포함되어 있었습니다: ${bannedWordsFound.join(', ')}. 이 표현들을 모두 제거하고 같은 형식으로 다시 작성하세요.`;
      const retryAttempt = await callOpenAiForDraft(apiKey, keywordSummaries, settings, retryInstruction);
      if (retryAttempt.ok) {
        finalDraft = retryAttempt.draft;
        bannedWordsFound = findBannedWordHits(finalDraft, settings.bannedWords);
      }
      // 재시도 호출 자체가 실패하면 최초 결과를 그대로 사용하고, bannedWordsFound(최초 검출값)를 경고로 노출
    }

    return NextResponse.json(
      {
        success: true,
        draft: finalDraft,
        bannedWordsFound,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[CommerceNewsletterDraftPOST]',
      error instanceof Error ? error.message : 'unknown error',
    );
    return NextResponse.json(
      { error: '초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 },
    );
  }
}
