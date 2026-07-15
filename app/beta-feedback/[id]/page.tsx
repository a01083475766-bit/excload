import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FeedbackDeleteButton } from '@/app/components/feedback-event/FeedbackDeleteButton';
import { FeedbackComments } from '@/app/components/feedback-event/FeedbackComments';
import { buildAuthLoginRedirectPath } from '@/app/lib/auth/post-login-redirect';
import { prisma } from '@/app/lib/prisma';
import {
  getFeedbackFeatureLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';
import {
  parseFeedbackContent,
  visibleFeedbackReply,
} from '@/app/lib/feedback-event/map-board-post';
import { canViewFeedbackPost } from '@/app/lib/feedback-event/permissions';
import {
  canCreateFeedbackComment,
  mapFeedbackComment,
} from '@/app/lib/feedback-event/comments';
import { buildFeedbackAttachmentDownloadPath } from '@/app/lib/feedback-event/attachment-reference';
import {
  getFeedbackViewerFromCookies,
  resolveFeedbackViewerUserId,
} from '@/app/lib/feedback-event/viewer';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '베타 피드백 상세',
  robots: { index: false, follow: false },
};

export default async function BetaFeedbackDetailPage({ params }: PageProps) {
  const { id } = await params;
  const viewer = await getFeedbackViewerFromCookies();
  if (!viewer.email && !viewer.userId) {
    redirect(buildAuthLoginRedirectPath(`/beta-feedback/${id}`));
  }

  const [post, myUserId] = await Promise.all([
    prisma.feedbackSubmission.findUnique({
      where: { id },
      select: {
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
        comments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            userId: true,
            content: true,
            isAdminComment: true,
            createdAt: true,
          },
        },
      },
    }),
    resolveFeedbackViewerUserId(viewer),
  ]);

  if (!post) notFound();

  const isMine = !!myUserId && myUserId === post.userId;
  if (!canViewFeedbackPost(post, myUserId, viewer.isAdmin)) notFound();

  const dateLabel = post.createdAt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const { title, body } = parseFeedbackContent(post.content);
  const reply = visibleFeedbackReply(post.systemReply);
  const hasAdminReply = !!reply || post.comments.some((comment) => comment.isAdminComment);
  const visibleComments =
    !post.publicConsent && !viewer.isAdmin
      ? post.comments.filter((comment) => comment.isAdminComment)
      : post.comments;
  const commentDtos = visibleComments.map((comment) =>
    mapFeedbackComment(comment, myUserId, viewer.isAdmin, post.publicConsent),
  );
  const attachmentDownloadUrl = buildFeedbackAttachmentDownloadPath(post.id, post.attachmentUrl);
  const isImageAttachment =
    attachmentDownloadUrl &&
    post.attachmentName &&
    /\.(png|jpe?g|webp)$/i.test(post.attachmentName);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/beta-feedback" className="mb-4 inline-flex text-sm text-zinc-600 hover:text-blue-700">
          목록으로
        </Link>

        <article className="border border-zinc-200 bg-white">
          <header className="border-b border-zinc-200 px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="rounded border border-zinc-200 px-2 py-0.5">
                {post.publicConsent ? '공개' : '비공개'}
              </span>
              <span>{getFeedbackFeatureLabel(post.featureUsed)}</span>
              <span>{hasAdminReply ? '답변 완료' : '확인 대기'}</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="break-words text-xl font-bold leading-8 text-zinc-950">{title}</h1>
                <p className="mt-2 text-sm text-zinc-500">
                  {isMine ? '나' : maskFeedbackAuthor(post.userId)} · {dateLabel}
                  {viewer.isAdmin && post.user?.email ? ` · ${post.user.email}` : ''}
                </p>
              </div>
              {viewer.isAdmin ? <FeedbackDeleteButton postId={post.id} /> : null}
            </div>
          </header>

          <section className="px-5 py-5">
            <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-800">
              {body || post.content}
            </div>
          </section>

          {attachmentDownloadUrl && post.attachmentName ? (
            <section className="border-t border-zinc-200 px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">첨부파일</h2>
              {isImageAttachment ? (
                <a href={attachmentDownloadUrl} target="_blank" rel="noopener noreferrer" className="mb-3 block max-w-xs">
                  <img src={attachmentDownloadUrl} alt="" className="max-h-40 border border-zinc-200 object-contain" />
                </a>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2 text-sm">
                <span className="min-w-0 truncate text-zinc-700">{post.attachmentName}</span>
                <a
                  href={attachmentDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm font-medium text-zinc-700 underline"
                >
                  열기
                </a>
              </div>
            </section>
          ) : null}

          {reply ? (
            <section className="border-t border-zinc-200 px-5 py-4">
              <div className="border-l-2 border-zinc-400 bg-zinc-50 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-900">운영자 답변</h2>
                <p className="mt-1 text-xs text-zinc-500">{dateLabel}</p>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                  {reply}
                </div>
              </div>
            </section>
          ) : null}

          <FeedbackComments
            postId={post.id}
            initialComments={commentDtos}
            publicConsent={post.publicConsent}
            viewerIsAdmin={viewer.isAdmin}
            canComment={canCreateFeedbackComment({
              publicConsent: post.publicConsent,
              isAdmin: viewer.isAdmin,
            })}
          />
        </article>
      </div>
    </main>
  );
}
