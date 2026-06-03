import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
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
    if (!post.publicConsent && !isMine) {
      return NextResponse.json({ error: '비공개 글입니다.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        isMine,
        authorLabel: isMine ? '나' : maskFeedbackAuthor(post.userId),
        featureLabel: getFeedbackFeatureLabel(post.featureUsed),
        resultLabel: getFeedbackResultLabel(post.conversionResult),
        content: post.content,
        publicConsent: post.publicConsent,
        attachmentName: isMine ? post.attachmentName : null,
        attachmentUrl: isMine ? post.attachmentUrl : null,
        trialGranted: isMine ? post.trialGranted : false,
        systemReply: isMine ? post.systemReply : null,
        createdAt: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[FeedbackEventPostDetail]', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}
