import type { Metadata } from 'next';
import FeedbackWritePage from '@/app/feedback-event/write/page';

export const metadata: Metadata = {
  title: '베타 피드백 작성',
  robots: { index: false, follow: false },
};

export default FeedbackWritePage;
