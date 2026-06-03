import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';

export async function GET() {
  try {
    const config = await getFeedbackEventConfig();
    const session = await getServerSession(authOptions);
    let myUserId: string | null = null;

    if (session?.user?.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      myUserId = u?.id ?? null;
    }

    const publicPosts = await prisma.feedbackSubmission.findMany({
      where: { publicConsent: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        featureUsed: true,
        conversionResult: true,
        content: true,
        createdAt: true,
      },
    });

    const mine =
      myUserId ?
        await prisma.feedbackSubmission.findMany({
          where: { userId: myUserId },
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
        })
      : [];

    return NextResponse.json({
      success: true,
      eventActive: config.isActive,
      endsAtLabel: config.endsAt.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      publicPosts: publicPosts.map((p) => ({
        id: p.id,
        authorLabel: maskFeedbackAuthor(p.userId),
        isMine: myUserId === p.userId,
        featureLabel: getFeedbackFeatureLabel(p.featureUsed),
        resultLabel: getFeedbackResultLabel(p.conversionResult),
        excerpt: p.content.length > 120 ? `${p.content.slice(0, 120)}…` : p.content,
        createdAt: p.createdAt.toISOString(),
      })),
      myPosts: mine.map((p) => ({
        id: p.id,
        featureLabel: getFeedbackFeatureLabel(p.featureUsed),
        resultLabel: getFeedbackResultLabel(p.conversionResult),
        excerpt: p.content.length > 80 ? `${p.content.slice(0, 80)}…` : p.content,
        publicConsent: p.publicConsent,
        trialGranted: p.trialGranted,
        hasSystemReply: !!p.systemReply,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[FeedbackEventPosts]', error);
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
