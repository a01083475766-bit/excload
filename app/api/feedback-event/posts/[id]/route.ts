import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { deleteFeedbackSubmissionById } from '@/app/lib/feedback-event/delete-submission';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';
import { visibleFeedbackReply } from '@/app/lib/feedback-event/map-board-post';
import { createFeedbackPerfLogger } from '@/app/lib/feedback-event/perf-log';
import {
  getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId,
} from '@/app/lib/feedback-event/viewer';
import { canViewFeedbackPost } from '@/app/lib/feedback-event/permissions';

type RouteCtx = { params: Promise<{ id: string }> };

const POST_SELECT = {
  id: true,
  userId: true,
  user: { select: { email: true } },
  featureUsed: true,
  conversionResult: true,
  content: true,
  publicConsent: true,
  attachmentName: true,
  attachmentUrl: true,
  systemReply: true,
  createdAt: true,
} as const;

type PostRow = {
  id: string;
  userId: string;
  user: { email: string };
  featureUsed: string;
  conversionResult: string;
  content: string;
  publicConsent: boolean;
  attachmentName: string | null;
  attachmentUrl: string | null;
  systemReply: string | null;
  createdAt: Date;
};

function mapPostDetail(post: PostRow, myUserId: string | null, isAdmin: boolean) {
  const isMine = myUserId === post.userId;
  const canViewStaffFields = isMine || isAdmin;
  const reply = visibleFeedbackReply(post.systemReply);

  return {
    id: post.id,
    isMine,
    isAdminViewer: isAdmin && !isMine,
    canDelete: isAdmin,
    authorLabel: isMine ? '나' : maskFeedbackAuthor(post.userId),
    authorEmail: isAdmin ? post.user.email : null,
    featureLabel: getFeedbackFeatureLabel(post.featureUsed),
    resultLabel: getFeedbackResultLabel(post.conversionResult),
    content: post.content,
    publicConsent: post.publicConsent,
    attachmentName: canViewStaffFields ? post.attachmentName : null,
    attachmentUrl: canViewStaffFields ? post.attachmentUrl : null,
    systemReply: canViewStaffFields ? reply : null,
    createdAt: post.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const perf = createFeedbackPerfLogger('post-detail');
  try {
    const { id } = await ctx.params;

    const [post, viewer] = await Promise.all([
      prisma.feedbackSubmission.findUnique({
        where: { id },
        select: POST_SELECT,
      }),
      getFeedbackViewerFromRequest(request),
    ]);
    perf.mark('post+viewer');

    const isAdmin = viewer.isAdmin;
    const myUserId = await resolveFeedbackViewerUserId(viewer);
    perf.mark('viewer-user');
    const isAnonymous = !viewer.email && !myUserId;

    if (isAnonymous) {
      perf.flush({ unauthorized: true });
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!post) {
      perf.flush({ found: false });
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!canViewFeedbackPost(post, myUserId, isAdmin)) {
      perf.flush({ forbidden: true });
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const detail = mapPostDetail(post, myUserId, isAdmin);
    const body = { success: true, post: detail };

    perf.flush({ loggedIn: !isAnonymous, isMine: detail.isMine });
    return NextResponse.json(body);
  } catch (error) {
    console.error('[FeedbackPostDetail]', error);
    perf.flush({ error: true });
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  try {
    const viewer = await getFeedbackViewerFromRequest(request);
    if (!viewer.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = await ctx.params;
    const deleted = await deleteFeedbackSubmissionById(id);
    if (!deleted) {
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FeedbackPostDELETE]', error);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
