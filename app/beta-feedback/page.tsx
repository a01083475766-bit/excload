import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FeedbackBoardClient } from '@/app/components/feedback-event/FeedbackBoardClient';
import { mapBoardPost } from '@/app/lib/feedback-event/map-board-post';
import { getPublicBoardRows } from '@/app/lib/feedback-event/public-board-cache';
import {
  getFeedbackViewerFromCookies,
  resolveFeedbackViewerUserId,
} from '@/app/lib/feedback-event/viewer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '베타 피드백',
  robots: { index: false, follow: false },
};

function FeedbackPageShell() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-zinc-950">베타 피드백</h1>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          엑클로드를 사용하며 발견한 오류와 필요한 기능을 알려주세요.
        </p>
      </div>
    </div>
  );
}

async function FeedbackBoardServer() {
  const [rows, viewer] = await Promise.all([
    getPublicBoardRows(),
    getFeedbackViewerFromCookies(),
  ]);

  const myUserId = await resolveFeedbackViewerUserId(viewer);
  const visibleRows = rows.filter(
    (p) => p.publicConsent || viewer.isAdmin || (!!myUserId && p.userId === myUserId),
  );
  const initialPosts = visibleRows.map((p) => mapBoardPost(p, myUserId, viewer.isAdmin));

  return (
    <FeedbackBoardClient
      initialPosts={initialPosts}
      initialViewerIsAdmin={viewer.isAdmin}
    />
  );
}

export default function BetaFeedbackPage() {
  return (
    <Suspense fallback={<FeedbackPageShell />}>
      <FeedbackBoardServer />
    </Suspense>
  );
}
