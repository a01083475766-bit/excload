import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { canDeleteFeedbackComment } from '@/app/lib/feedback-event/comments';
import { canViewFeedbackPost } from '@/app/lib/feedback-event/permissions';
import { invalidatePublicBoardCache } from '@/app/lib/feedback-event/public-board-cache';
import {
  getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId,
} from '@/app/lib/feedback-event/viewer';

type RouteCtx = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  try {
    const viewer = await getFeedbackViewerFromRequest(request);
    const userId = await resolveFeedbackViewerUserId(viewer);
    if ((!viewer.email && !viewer.userId) || !userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { id, commentId } = await ctx.params;
    const post = await prisma.feedbackSubmission.findUnique({
      where: { id },
      select: { id: true, userId: true, publicConsent: true },
    });
    if (!post || !canViewFeedbackPost(post, userId, viewer.isAdmin)) {
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const comment = await prisma.feedbackComment.findFirst({
      where: { id: commentId, submissionId: post.id },
      select: { id: true, userId: true },
    });
    if (!comment) {
      return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (
      !canDeleteFeedbackComment({
        publicConsent: post.publicConsent,
        commentUserId: comment.userId,
        viewerUserId: userId,
        isAdmin: viewer.isAdmin,
      })
    ) {
      return NextResponse.json({ error: '댓글을 삭제할 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.feedbackComment.delete({ where: { id: comment.id } });
    invalidatePublicBoardCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FeedbackCommentDELETE]', error);
    return NextResponse.json({ error: '댓글을 삭제하지 못했습니다.' }, { status: 500 });
  }
}
