import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FeedbackDeleteButton } from '@/app/components/feedback-event/FeedbackDeleteButton';
import { prisma } from '@/app/lib/prisma';
import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';
import { feedbackTitle } from '@/app/lib/feedback-event/map-board-post';
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
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/beta-feedback/${id}`)}`);
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
        trialGranted: true,
        systemReply: true,
        createdAt: true,
      },
    }),
    resolveFeedbackViewerUserId(viewer),
  ]);

  if (!post) notFound();

  const isMine = !!myUserId && myUserId === post.userId;
  const canViewPrivate = post.publicConsent || isMine || viewer.isAdmin;
  if (!canViewPrivate) notFound();

  const canViewStaffFields = isMine || viewer.isAdmin;
  const dateLabel = post.createdAt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const title = feedbackTitle(post.content, 120);
  const contentLines = post.content.split(/\r?\n/);
  const firstContentLineIndex = contentLines.findIndex((line) => line.trim().length > 0);
  const body =
    firstContentLineIndex >= 0
      ? contentLines
          .filter((_, index) => index !== firstContentLineIndex)
          .join('\n')
          .trim()
      : post.content;
  const isImageAttachment =
    canViewStaffFields &&
    post.attachmentUrl &&
    /\.(png|jpe?g|webp)$/i.test(post.attachmentUrl);

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
              <span>{getFeedbackResultLabel(post.conversionResult)}</span>
              <span>{post.systemReply ? '답변 있음' : '확인 대기'}</span>
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

          {canViewStaffFields && post.attachmentUrl && post.attachmentName ? (
            <section className="border-t border-zinc-200 px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">첨부파일</h2>
              {isImageAttachment ? (
                <a href={post.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mb-3 block max-w-xs">
                  <img src={post.attachmentUrl} alt="" className="max-h-40 border border-zinc-200 object-contain" />
                </a>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2 text-sm">
                <span className="min-w-0 truncate text-zinc-700">{post.attachmentName}</span>
                <a
                  href={post.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm font-medium text-zinc-700 underline"
                >
                  열기
                </a>
              </div>
            </section>
          ) : null}

          {canViewStaffFields && post.systemReply ? (
            <section className="border-t border-zinc-200 px-5 py-4">
              <div className="border-l-2 border-zinc-400 bg-zinc-50 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-900">운영자 답변</h2>
                <p className="mt-1 text-xs text-zinc-500">{dateLabel}</p>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                  {post.systemReply}
                </div>
              </div>
            </section>
          ) : null}
        </article>
      </div>
    </main>
  );
}
