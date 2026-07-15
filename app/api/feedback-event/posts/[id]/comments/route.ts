import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import {
  canCreateFeedbackComment,
  mapFeedbackComment,
  validateFeedbackCommentContent,
} from '@/app/lib/feedback-event/comments';
import { canViewFeedbackPost } from '@/app/lib/feedback-event/permissions';
import { invalidatePublicBoardCache } from '@/app/lib/feedback-event/public-board-cache';
import {
  getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId,
} from '@/app/lib/feedback-event/viewer';

type RouteCtx = { params: Promise<{ id: string }> };

const COMMENT_SELECT = {
  id: true,
  userId: true,
  content: true,
  isAdminComment: true,
  createdAt: true,
} as const;

async function getAuthenticatedViewer(request: NextRequest) {
  const viewer = await getFeedbackViewerFromRequest(request);
  const userId = await resolveFeedbackViewerUserId(viewer);
  if ((!viewer.email && !viewer.userId) || !userId) return null;
  return { viewer, userId };
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await getAuthenticatedViewer(request);
    if (!auth) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const post = await prisma.feedbackSubmission.findUnique({
      where: { id },
      select: { id: true, userId: true, publicConsent: true },
    });

    if (!post || !canViewFeedbackPost(post, auth.userId, auth.viewer.isAdmin)) {
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const comments = await prisma.feedbackComment.findMany({
      where: {
        submissionId: post.id,
        ...(!post.publicConsent && !auth.viewer.isAdmin
          ? { isAdminComment: true }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: COMMENT_SELECT,
    });

    return NextResponse.json({
      success: true,
      comments: comments.map((comment) =>
        mapFeedbackComment(
          comment,
          auth.userId,
          auth.viewer.isAdmin,
          post.publicConsent,
        ),
      ),
      canComment: canCreateFeedbackComment({
        publicConsent: post.publicConsent,
        isAdmin: auth.viewer.isAdmin,
      }),
    });
  } catch (error) {
    console.error('[FeedbackCommentsGET]', error);
    return NextResponse.json({ error: '댓글을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await getAuthenticatedViewer(request);
    if (!auth) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const post = await prisma.feedbackSubmission.findUnique({
      where: { id },
      select: { id: true, userId: true, publicConsent: true },
    });

    if (!post || !canViewFeedbackPost(post, auth.userId, auth.viewer.isAdmin)) {
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (
      !canCreateFeedbackComment({
        publicConsent: post.publicConsent,
        isAdmin: auth.viewer.isAdmin,
      })
    ) {
      return NextResponse.json(
        { error: '비공개 글에는 운영자만 답변할 수 있습니다.' },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '댓글 내용을 확인해주세요.' }, { status: 400 });
    }

    const validation = validateFeedbackCommentContent(
      body && typeof body === 'object' ? (body as { content?: unknown }).content : undefined,
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const comment = await prisma.feedbackComment.create({
      data: {
        submissionId: post.id,
        userId: auth.userId,
        content: validation.content,
        isAdminComment: auth.viewer.isAdmin,
      },
      select: COMMENT_SELECT,
    });

    invalidatePublicBoardCache();
    return NextResponse.json(
      {
        success: true,
        comment: mapFeedbackComment(
          comment,
          auth.userId,
          auth.viewer.isAdmin,
          post.publicConsent,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[FeedbackCommentsPOST]', error);
    return NextResponse.json({ error: '댓글을 등록하지 못했습니다.' }, { status: 500 });
  }
}
