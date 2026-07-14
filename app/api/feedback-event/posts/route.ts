import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  getPublicBoardRows,
} from '@/app/lib/feedback-event/public-board-cache';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
} from '@/app/lib/feedback-event/labels';
import { mapBoardPost } from '@/app/lib/feedback-event/map-board-post';
import { createFeedbackPerfLogger } from '@/app/lib/feedback-event/perf-log';
import {
  getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId,
} from '@/app/lib/feedback-event/viewer';

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

export async function GET(request: NextRequest) {
  const perf = createFeedbackPerfLogger('posts');
  try {
    const scope = request.nextUrl.searchParams.get('scope') ?? 'public';

    if (scope === 'mine') {
      const viewer = await getFeedbackViewerFromRequest(request);
      perf.mark('viewer');
      if (!viewer.email && !viewer.userId) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
      }

      const [config, user] = await Promise.all([
        getFeedbackEventConfig(),
        viewer.userId
          ? prisma.user.findUnique({
              where: { id: viewer.userId },
              select: { id: true },
            })
          : prisma.user.findUnique({
              where: { email: viewer.email! },
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

    const [config, viewer, boardRows] = await Promise.all([
      getFeedbackEventConfig(),
      getFeedbackViewerFromRequest(request),
      getPublicBoardRows(),
    ]);
    perf.mark('config+viewer+boardRows');

    const isAdmin = viewer.isAdmin;
    const myUserId = await resolveFeedbackViewerUserId(viewer);
    const isAnonymousViewer = !viewer.email && !myUserId;
    if (isAnonymousViewer) {
      perf.flush({ scope: 'public', unauthorized: true });
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const visibleRows = boardRows.filter(
      (p) => p.publicConsent || isAdmin || (!!myUserId && p.userId === myUserId),
    );
    perf.mark('viewer-user+filter');

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
      boardPosts: visibleRows.map((p) => mapBoardPost(p, myUserId, isAdmin)),
    };

    perf.flush({ scope: 'public', cached: false, rows: visibleRows.length });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[FeedbackEventPosts]', error);
    perf.flush({ error: true });
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
