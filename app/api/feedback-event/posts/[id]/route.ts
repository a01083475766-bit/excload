import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { deleteFeedbackSubmissionById } from '@/app/lib/feedback-event/delete-submission';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const post = await prisma.feedbackSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        featureUsed: true,
        conversionResult: true,
        content: true,
        publicConsent: true,
        attachmentName: true,
        attachmentUrl: true,
        trialGranted: true,
        systemReply: true,
        createdAt: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    let myUserId: string | null = null;
    if (session?.user?.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      myUserId = u?.id ?? null;
    }

    const isMine = myUserId === post.userId;
    const isAdmin = isAdminEmail(session?.user?.email);
    if (!post.publicConsent && !isMine && !isAdmin) {
      return NextResponse.json({ error: '비공개 글입니다.' }, { status: 403 });
    }

    const canViewStaffFields = isMine || isAdmin;

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        isMine,
        isAdminViewer: isAdmin && !isMine,
        canDelete: isAdmin,
        authorLabel: isMine ? '나' : maskFeedbackAuthor(post.userId),
        featureLabel: getFeedbackFeatureLabel(post.featureUsed),
        resultLabel: getFeedbackResultLabel(post.conversionResult),
        content: post.content,
        publicConsent: post.publicConsent,
        attachmentName: canViewStaffFields ? post.attachmentName : null,
        attachmentUrl: canViewStaffFields ? post.attachmentUrl : null,
        trialGranted: canViewStaffFields ? post.trialGranted : false,
        systemReply: canViewStaffFields ? post.systemReply : null,
        createdAt: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[FeedbackEventPostDetail]', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = await ctx.params;
    const deleted = await deleteFeedbackSubmissionById(id);
    if (!deleted) {
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FeedbackEventPostDELETE]', error);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
