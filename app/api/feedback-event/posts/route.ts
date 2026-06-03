import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';

function feedbackExcerpt(content: string, max = 120): string {
  return content.length > max ? `${content.slice(0, max)}…` : content;
}

function mapBoardPost(
  p: {
    id: string;
    userId: string;
    featureUsed: string;
    conversionResult: string;
    content: string;
    publicConsent: boolean;
    createdAt: Date;
  },
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

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope') ?? 'public';
    const config = await getFeedbackEventConfig();

    if (scope === 'mine') {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
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

      return NextResponse.json({
        success: true,
        eventActive: config.isActive,
        myPosts: mine.map(mapMyPost),
      });
    }

    const session = await getServerSession(authOptions);
    const isAdmin = isAdminEmail(session?.user?.email);
    let myUserId: string | null = null;
    if (session?.user?.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      myUserId = u?.id ?? null;
    }

    const boardPosts = await prisma.feedbackSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        featureUsed: true,
        conversionResult: true,
        content: true,
        publicConsent: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      eventActive: config.isActive,
      endsAtLabel: config.endsAt.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      viewerIsAdmin: isAdmin,
      boardPosts: boardPosts.map((p) => mapBoardPost(p, myUserId, isAdmin)),
    });
  } catch (error) {
    console.error('[FeedbackEventPosts]', error);
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
