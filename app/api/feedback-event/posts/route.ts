import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getPublicBoardRows } from '@/app/lib/feedback-event/public-board-cache';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
} from '@/app/lib/feedback-event/labels';
import { mapBoardPost, visibleFeedbackReply } from '@/app/lib/feedback-event/map-board-post';
import { filterVisibleFeedbackPosts } from '@/app/lib/feedback-event/permissions';
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
  systemReply: string | null;
  createdAt: Date;
  comments: { id: string }[];
  _count: { comments: number };
}) {
  const categoryLabel = getFeedbackFeatureLabel(p.featureUsed);

  return {
    id: p.id,
    featureLabel: categoryLabel,
    categoryLabel,
    resultLabel: getFeedbackResultLabel(p.conversionResult),
    excerpt: p.content.length > 80 ? `${p.content.slice(0, 80)}…` : p.content,
    publicConsent: p.publicConsent,
    hasSystemReply: !!visibleFeedbackReply(p.systemReply) || p.comments.length > 0,
    commentCount: p._count.comments,
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

      const user = viewer.userId
        ? await prisma.user.findUnique({
            where: { id: viewer.userId },
            select: { id: true },
          })
        : await prisma.user.findUnique({
            where: { email: viewer.email! },
            select: { id: true },
          });
      perf.mark('user');

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
          systemReply: true,
          createdAt: true,
          comments: {
            where: { isAdminComment: true },
            take: 1,
            select: { id: true },
          },
          _count: { select: { comments: true } },
        },
      });
      perf.mark('mine-query');
      perf.flush({ scope: 'mine' });

      return NextResponse.json({
        success: true,
        myPosts: mine.map(mapMyPost),
      });
    }

    const [viewer, boardRows] = await Promise.all([
      getFeedbackViewerFromRequest(request),
      getPublicBoardRows(),
    ]);
    perf.mark('viewer+boardRows');

    const isAdmin = viewer.isAdmin;
    const myUserId = await resolveFeedbackViewerUserId(viewer);
    const isAnonymousViewer = !viewer.email && !myUserId;
    if (isAnonymousViewer) {
      perf.flush({ scope: 'public', unauthorized: true });
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const visibleRows = filterVisibleFeedbackPosts(boardRows, myUserId, isAdmin);
    perf.mark('viewer-user+filter');

    const payload = {
      success: true,
      viewerIsAdmin: isAdmin,
      boardPosts: visibleRows.map((p) => mapBoardPost(p, myUserId, isAdmin)),
    };

    perf.flush({ scope: 'public', cached: false, rows: visibleRows.length });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[FeedbackPosts]', error);
    perf.flush({ error: true });
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
