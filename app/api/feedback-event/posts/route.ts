import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  getCachedAnonymousPublicPayload,
  getPublicBoardRows,
  invalidatePublicBoardCache,
  PUBLIC_BOARD_CACHE_SECONDS,
  setCachedAnonymousPublicPayload,
  type PublicBoardRow,
} from '@/app/lib/feedback-event/public-board-cache';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';
import { createFeedbackPerfLogger } from '@/app/lib/feedback-event/perf-log';

function feedbackExcerpt(content: string, max = 120): string {
  return content.length > max ? `${content.slice(0, max)}…` : content;
}

function mapBoardPost(
  p: PublicBoardRow,
  myUserId: string | null,
  isAdmin: boolean,
) {
  const isMine = myUserId === p.userId;
  const canViewContent = p.publicConsent || isMine || isAdmin;

  return {
    id: p.id,
    authorLabel: maskFeedbackAuthor(p.userId),
    isMine,
    featureLabel: getFeedbackFeatureLabel(p.featureUsed),
    resultLabel: getFeedbackResultLabel(p.conversionResult),
    publicConsent: p.publicConsent,
    excerpt: canViewContent ? feedbackExcerpt(p.content) : null,
    canOpen: canViewContent,
    canDelete: isAdmin,
    createdAt: p.createdAt.toISOString(),
  };
}

function mapMyPost(p: {
  id: string;
  featureUsed: string;
  conversionResult: string;
  content: string;
  publicConsent: boolean;
  trialGranted: boolean;
  systemReply: string | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    featureLabel: getFeedbackFeatureLabel(p.featureUsed),
    resultLabel: getFeedbackResultLabel(p.conversionResult),
    excerpt: p.content.length > 80 ? `${p.content.slice(0, 80)}…` : p.content,
    publicConsent: p.publicConsent,
    trialGranted: p.trialGranted,
    hasSystemReply: !!p.systemReply,
    createdAt: p.createdAt.toISOString(),
  };
}

const ANON_POSTS_CACHE_HEADERS = {
  'Cache-Control': `public, s-maxage=${PUBLIC_BOARD_CACHE_SECONDS}, stale-while-revalidate=120`,
};

export async function GET(request: NextRequest) {
  const perf = createFeedbackPerfLogger('posts');
  try {
    const scope = request.nextUrl.searchParams.get('scope') ?? 'public';

    if (scope === 'mine') {
      const session = await getServerSession(authOptions);
      perf.mark('session');
      if (!session?.user?.email) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
      }

      const [config, user] = await Promise.all([
        getFeedbackEventConfig(),
        prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        }),
      ]);
      perf.mark('config+user');

      if (!user) {
        return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
      }

      const mine = await prisma.feedbackSubmission.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          featureUsed: true,
          conversionResult: true,
          content: true,
          publicConsent: true,
          trialGranted: true,
          systemReply: true,
          createdAt: true,
        },
      });
      perf.mark('mine-query');
      perf.flush({ scope: 'mine' });

      return NextResponse.json({
        success: true,
        eventActive: config.isActive,
        myPosts: mine.map(mapMyPost),
      });
    }

    const [config, session, boardRows] = await Promise.all([
      getFeedbackEventConfig(),
      getServerSession(authOptions),
      getPublicBoardRows(),
    ]);
    perf.mark('config+session+boardRows');

    const isAdmin = isAdminEmail(session?.user?.email);
    const myUserId = session?.user?.id ?? null;
    const isAnonymousViewer = !session?.user?.email && !myUserId;

    if (isAnonymousViewer) {
      const cached = getCachedAnonymousPublicPayload();
      if (cached) {
        perf.mark('anon-payload-cache-hit');
        perf.flush({ scope: 'public', cached: true });
        return NextResponse.json(cached, { headers: ANON_POSTS_CACHE_HEADERS });
      }
    }

    const endsAtLabel = config.endsAt.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const payload = {
      success: true,
      eventActive: config.isActive,
      endsAtLabel,
      viewerIsAdmin: isAdmin,
      boardPosts: boardRows.map((p) => mapBoardPost(p, myUserId, isAdmin)),
    };

    if (isAnonymousViewer) {
      setCachedAnonymousPublicPayload(payload);
      perf.mark('anon-payload-cache-miss');
    }

    perf.flush({ scope: 'public', cached: false, rows: boardRows.length });
    return NextResponse.json(
      payload,
      isAnonymousViewer ? { headers: ANON_POSTS_CACHE_HEADERS } : undefined,
    );
  } catch (error) {
    console.error('[FeedbackEventPosts]', error);
    perf.flush({ error: true });
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
