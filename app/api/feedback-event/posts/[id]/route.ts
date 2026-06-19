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
import { createFeedbackPerfLogger } from '@/app/lib/feedback-event/perf-log';
import {
  getCachedPublicPostDetail,
  setCachedPublicPostDetail,
} from '@/app/lib/feedback-event/public-post-detail-cache';

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
  trialGranted: true,
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
  trialGranted: boolean;
  systemReply: string | null;
  createdAt: Date;
};

function mapPostDetail(post: PostRow, myUserId: string | null, isAdmin: boolean) {
  const isMine = myUserId === post.userId;
  const canViewStaffFields = isMine || isAdmin;

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
    trialGranted: canViewStaffFields ? post.trialGranted : false,
    systemReply: canViewStaffFields ? post.systemReply : null,
    createdAt: post.createdAt.toISOString(),
  };
}

const ANON_DETAIL_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

export async function GET(_request: Request, ctx: RouteCtx) {
  const perf = createFeedbackPerfLogger('post-detail');
  try {
    const { id } = await ctx.params;

    const [post, session] = await Promise.all([
      prisma.feedbackSubmission.findUnique({
        where: { id },
        select: POST_SELECT,
      }),
      getServerSession(authOptions),
    ]);
    perf.mark('post+session');

    if (!post) {
      perf.flush({ found: false });
      return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
    }

    const isAdmin = isAdminEmail(session?.user?.email);
    let myUserId = session?.user?.id ?? null;
    if (!myUserId && session?.user?.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      myUserId = u?.id ?? null;
      perf.mark('user-by-email');
    }
    const isAnonymous = !session?.user?.email && !myUserId;

    if (post.publicConsent && isAnonymous && !isAdmin) {
      const cached = getCachedPublicPostDetail(id);
      if (cached) {
        perf.mark('anon-detail-cache-hit');
        perf.flush({ cached: true, public: true });
        return NextResponse.json(cached, { headers: ANON_DETAIL_CACHE_HEADERS });
      }
    }

    if (!post.publicConsent && myUserId !== post.userId && !isAdmin) {
      perf.flush({ forbidden: true });
      return NextResponse.json({ error: '비공개 글입니다.' }, { status: 403 });
    }

    const detail = mapPostDetail(post, myUserId, isAdmin);
    const body = { success: true, post: detail };

    if (post.publicConsent && isAnonymous && !isAdmin) {
      setCachedPublicPostDetail(id, body);
      perf.mark('anon-detail-cache-miss');
      perf.flush({ cached: false, public: true });
      return NextResponse.json(body, { headers: ANON_DETAIL_CACHE_HEADERS });
    }

    perf.flush({ loggedIn: !isAnonymous, isMine: detail.isMine });
    return NextResponse.json(body);
  } catch (error) {
    console.error('[FeedbackEventPostDetail]', error);
    perf.flush({ error: true });
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
