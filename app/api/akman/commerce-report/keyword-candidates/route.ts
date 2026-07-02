/**
 * POST /api/akman/commerce-report/keyword-candidates — 시드 키워드로 추천 키워드 후보 추출 (관리자 전용)
 *
 * ⚠️ 네이버 쇼핑 검색 API만 호출합니다 (블로그/뉴스/쇼핑인사이트 호출 없음).
 * ⚠️ DB 저장 없음. 응답에는 후보 키워드 "문자열 배열"만 포함하고,
 *   상품명 원문·링크·이미지·brand/maker 리스트는 응답에 포함하지 않습니다.
 * ⚠️ 순차 호출(시드 사이 지연 포함) — 병렬 호출 금지.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { fetchNaverShoppingItems, NaverShoppingApiError } from '@/app/lib/commerce-report/naver-shopping/client';
import type { NaverShoppingRawItem } from '@/app/lib/commerce-report/naver-shopping/types';
import { extractKeywordCandidates } from '@/app/lib/commerce-report/keyword-candidates';
import { DEFAULT_COMMERCE_REPORT_SEED_KEYWORDS, MAX_SEED_KEYWORDS } from '@/app/lib/commerce-report/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const DELAY_BETWEEN_SEEDS_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessageForStatus(status: number): string {
  if (status === 401 || status === 403) return '네이버 API 인증에 실패했습니다. 관리자에게 문의해 주세요.';
  if (status === 429) return '오늘 네이버 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
  if (status === 400) return '요청 형식에 문제가 있습니다. 시드 키워드를 확인해 주세요.';
  if (status === 500) return '네이버 API 연동 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.';
  if (status === 0) return '네이버 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.';
  return '추천 키워드 후보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const rawSeeds = Array.isArray(body?.seedKeywords) ? body.seedKeywords : [];
    const cleanedSeeds: string[] = rawSeeds
      .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value: string) => value.trim());
    const dedupedSeeds: string[] = [...new Set(cleanedSeeds)];
    const seedKeywords: string[] = (
      dedupedSeeds.length > 0 ? dedupedSeeds : DEFAULT_COMMERCE_REPORT_SEED_KEYWORDS
    ).slice(0, MAX_SEED_KEYWORDS);

    if (seedKeywords.length === 0) {
      return NextResponse.json({ error: '시드 키워드를 입력해 주세요.' }, { status: 400 });
    }

    const itemsBySeed: NaverShoppingRawItem[][] = [];
    const usedSeedKeywords: string[] = [];
    const failedSeedKeywords: string[] = [];
    let sharedErrorMessage: string | null = null;

    for (let i = 0; i < seedKeywords.length; i += 1) {
      const seed = seedKeywords[i];
      try {
        const { items } = await fetchNaverShoppingItems(seed);
        itemsBySeed.push(items);
        usedSeedKeywords.push(seed);
      } catch (err) {
        const status = err instanceof NaverShoppingApiError ? err.status : 0;
        // 상태 코드만 기록 (원본 응답·items 배열은 절대 로그하지 않음)
        console.error('[CommerceReportKeywordCandidates] seed fetch failed', { status });
        failedSeedKeywords.push(seed);
        sharedErrorMessage = sharedErrorMessage ?? errorMessageForStatus(status);
      }

      if (i < seedKeywords.length - 1) {
        await sleep(DELAY_BETWEEN_SEEDS_MS);
      }
    }

    if (usedSeedKeywords.length === 0) {
      return NextResponse.json(
        { error: sharedErrorMessage ?? '추천 키워드 후보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 502 },
      );
    }

    const candidates = extractKeywordCandidates(seedKeywords, itemsBySeed);

    return NextResponse.json(
      {
        success: true,
        candidates,
        usedSeedKeywords,
        failedSeedKeywords,
        ...(sharedErrorMessage ? { error: sharedErrorMessage } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[CommerceReportKeywordCandidatesPOST]',
      error instanceof Error ? error.message : 'unknown error',
    );
    return NextResponse.json(
      { error: '추천 키워드 후보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 },
    );
  }
}
