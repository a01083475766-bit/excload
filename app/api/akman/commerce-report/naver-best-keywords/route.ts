/**
 * GET/POST /api/akman/commerce-report/naver-best-keywords — 네이버+스토어 BEST 키워드 실시간 참고 조회 (관리자 전용, 실험 기능)
 *
 * ⚠️ 공식 API가 아니라 https://snxbest.naver.com/keyword/best 공개 페이지를 실시간으로 그대로 fetch합니다.
 * ⚠️ 순위·키워드명·카테고리·등락 라벨만 파싱해서 반환합니다 — 상품명·상품 링크·이미지·가격·리뷰수·판매자
 *   정보는 절대 파싱/응답/저장하지 않습니다.
 * ⚠️ DB 저장 없음, Prisma 모델 없음, cron 없음, 자동 주기 수집 없음 — 관리자 버튼 클릭 시에만 조회합니다.
 * ⚠️ 로그에는 원문 HTML이나 상품 데이터를 남기지 않고, 파싱 성공 개수·상태 코드·응답 시간만 남깁니다.
 * ⚠️ 페이지 구조가 바뀌면 파싱이 실패할 수 있어(실험 기능), 결과 0개는 실패로 처리합니다.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { fetchNaverBestKeywordsHtml, NaverBestKeywordsFetchError } from '@/app/lib/commerce-report/naver-best/client';
import { parseNaverBestKeywordsHtml } from '@/app/lib/commerce-report/naver-best/parse';
import { NAVER_BEST_KEYWORDS_FAILURE_MESSAGE } from '@/app/lib/commerce-report/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

async function handleRequest() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const startedAt = Date.now();
  try {
    const html = await fetchNaverBestKeywordsHtml();
    const items = parseNaverBestKeywordsHtml(html);
    const elapsedMs = Date.now() - startedAt;

    if (items.length === 0) {
      // 원문 HTML은 로그에 남기지 않음 — 파싱 실패 사실과 경과 시간만 기록
      console.error('[CommerceReportNaverBestKeywords] parsed 0 items (page structure may have changed)', {
        elapsedMs,
      });
      return NextResponse.json({ error: NAVER_BEST_KEYWORDS_FAILURE_MESSAGE }, { status: 502 });
    }

    console.log('[CommerceReportNaverBestKeywords] parsed', { count: items.length, elapsedMs });

    return NextResponse.json(
      {
        success: true,
        source: 'naver-best',
        fetchedAt: new Date().toISOString(),
        items,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const status = error instanceof NaverBestKeywordsFetchError ? error.status : 0;
    // 상태 코드·경과 시간만 기록 — 원문 HTML/상품 데이터는 절대 로그하지 않음
    console.error('[CommerceReportNaverBestKeywords] fetch failed', { status, elapsedMs });
    return NextResponse.json({ error: NAVER_BEST_KEYWORDS_FAILURE_MESSAGE }, { status: 502 });
  }
}

export async function GET() {
  return handleRequest();
}

export async function POST() {
  return handleRequest();
}
