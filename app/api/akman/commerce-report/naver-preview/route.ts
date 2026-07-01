/**
 * POST /api/akman/commerce-report/naver-preview — 네이버 쇼핑/블로그/뉴스 검색 API 실시간 참고 조회 (관리자 전용)
 *
 * ⚠️ DB 저장 없음. 원본 상품/포스트/기사 리스트는 응답에 포함하지 않고 요약값만 반환합니다.
 * ⚠️ 키워드 사이는 순차 호출(지연 포함) — 키워드 내부는 쇼핑 조회 후 블로그·뉴스만 소수 병렬 호출.
 * ⚠️ 블로그·뉴스는 기존 NAVER_SHOPPING_CLIENT_ID/SECRET을 그대로 재사용합니다(신규 환경변수 없음).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { fetchNaverShoppingItems, NaverShoppingApiError } from '@/app/lib/commerce-report/naver-shopping/client';
import { summarizeNaverShoppingItems } from '@/app/lib/commerce-report/naver-shopping/summarize';
import { fetchNaverBlogItems, NaverBlogApiError } from '@/app/lib/commerce-report/naver-blog/client';
import { summarizeNaverBlogItems } from '@/app/lib/commerce-report/naver-blog/summarize';
import { fetchNaverNewsItems, NaverNewsApiError } from '@/app/lib/commerce-report/naver-news/client';
import { summarizeNaverNewsItems } from '@/app/lib/commerce-report/naver-news/summarize';
import type { KeywordReferenceSummary } from '@/app/lib/commerce-report/types';
import type { NaverBlogPreviewSummary } from '@/app/lib/commerce-report/naver-blog/types';
import type { NaverNewsPreviewSummary } from '@/app/lib/commerce-report/naver-news/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_KEYWORDS_PER_REQUEST = 10;
const DELAY_BETWEEN_KEYWORDS_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessageForStatus(status: number): string {
  if (status === 401 || status === 403) return '네이버 API 인증에 실패했습니다. 관리자에게 문의해 주세요.';
  if (status === 429) return '오늘 네이버 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
  if (status === 400) return '요청 형식에 문제가 있습니다. 키워드를 확인해 주세요.';
  if (status === 500) return '네이버 API 연동 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.';
  if (status === 0) return '네이버 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.';
  return '참고 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

/** 블로그 조회 — 실패해도 전체 키워드를 막지 않고 null로 처리 (상태 코드만 로그) */
async function fetchBlogSummaryOrNull(keyword: string): Promise<NaverBlogPreviewSummary | null> {
  try {
    const { total, items } = await fetchNaverBlogItems(keyword);
    return summarizeNaverBlogItems(keyword, total, items);
  } catch (err) {
    const status = err instanceof NaverBlogApiError ? err.status : 0;
    console.error('[CommerceReportNaverPreview] blog fetch failed', { status });
    return null;
  }
}

/** 뉴스 조회 — 실패해도 전체 키워드를 막지 않고 null로 처리 (상태 코드만 로그) */
async function fetchNewsSummaryOrNull(keyword: string): Promise<NaverNewsPreviewSummary | null> {
  try {
    const { total, items } = await fetchNaverNewsItems(keyword);
    return summarizeNaverNewsItems(keyword, total, items);
  } catch (err) {
    const status = err instanceof NaverNewsApiError ? err.status : 0;
    console.error('[CommerceReportNaverPreview] news fetch failed', { status });
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const rawKeywords = Array.isArray(body?.keywords) ? body.keywords : [];
    const keywords = rawKeywords
      .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value: string) => value.trim())
      .slice(0, MAX_KEYWORDS_PER_REQUEST);

    if (keywords.length === 0) {
      return NextResponse.json({ error: '조회할 키워드를 선택해 주세요.' }, { status: 400 });
    }

    const results: KeywordReferenceSummary[] = [];
    const failedKeywords: string[] = [];
    let sharedErrorMessage: string | null = null;

    for (let i = 0; i < keywords.length; i += 1) {
      const keyword = keywords[i];
      try {
        // 쇼핑 조회는 필수 — 실패하면 이 키워드는 통째로 건너뜀
        const { total, items } = await fetchNaverShoppingItems(keyword);
        const shopping = summarizeNaverShoppingItems(keyword, total, items);

        // 블로그·뉴스는 소수 병렬 호출(2개) — 개별 실패는 null로만 처리하고 전체를 막지 않음
        const [blog, news] = await Promise.all([
          fetchBlogSummaryOrNull(keyword),
          fetchNewsSummaryOrNull(keyword),
        ]);

        results.push({
          keyword,
          fetchedAt: new Date().toISOString(),
          shopping,
          blog,
          news,
        });
      } catch (err) {
        const status = err instanceof NaverShoppingApiError ? err.status : 0;
        // 상태 코드·짧은 메시지만 기록 (원본 응답·items 배열은 절대 로그하지 않음)
        console.error('[CommerceReportNaverPreview] shopping fetch failed', { status });
        failedKeywords.push(keyword);
        sharedErrorMessage = sharedErrorMessage ?? errorMessageForStatus(status);
      }

      if (i < keywords.length - 1) {
        await sleep(DELAY_BETWEEN_KEYWORDS_MS);
      }
    }

    return NextResponse.json(
      {
        success: true,
        results,
        failedKeywords,
        ...(results.length === 0 && sharedErrorMessage ? { error: sharedErrorMessage } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[CommerceReportNaverPreviewPOST]',
      error instanceof Error ? error.message : 'unknown error',
    );
    return NextResponse.json(
      { error: '참고 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 },
    );
  }
}
