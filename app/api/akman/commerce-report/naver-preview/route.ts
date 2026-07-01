/**
 * POST /api/akman/commerce-report/naver-preview — 네이버 쇼핑 검색 API 실시간 참고 조회 (관리자 전용)
 *
 * ⚠️ DB 저장 없음. 원본 상품 리스트는 응답에 포함하지 않고 요약값만 반환합니다.
 * ⚠️ 순차 호출(키워드별 지연 포함) — 병렬 호출 금지.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { fetchNaverShoppingItems, NaverShoppingApiError } from '@/app/lib/commerce-report/naver-shopping/client';
import { summarizeNaverShoppingItems } from '@/app/lib/commerce-report/naver-shopping/summarize';
import type { NaverShoppingPreviewSummary } from '@/app/lib/commerce-report/naver-shopping/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_KEYWORDS_PER_REQUEST = 10;
const DELAY_BETWEEN_CALLS_MS = 300;

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

    const results: NaverShoppingPreviewSummary[] = [];
    const failedKeywords: string[] = [];
    let sharedErrorMessage: string | null = null;

    for (let i = 0; i < keywords.length; i += 1) {
      const keyword = keywords[i];
      try {
        const { total, items } = await fetchNaverShoppingItems(keyword);
        results.push(summarizeNaverShoppingItems(keyword, total, items));
      } catch (err) {
        const status = err instanceof NaverShoppingApiError ? err.status : 0;
        // 상태 코드·짧은 메시지만 기록 (원본 응답·items 배열은 절대 로그하지 않음)
        console.error('[CommerceReportNaverPreview] keyword fetch failed', { status });
        failedKeywords.push(keyword);
        sharedErrorMessage = sharedErrorMessage ?? errorMessageForStatus(status);
      }

      if (i < keywords.length - 1) {
        await sleep(DELAY_BETWEEN_CALLS_MS);
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
