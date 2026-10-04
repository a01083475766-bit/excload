import type { Metadata } from 'next';
import FeedbackWritePage from '@/app/feedback-event/write/page';

export const metadata: Metadata = {
  title: '의견 작성',
  robots: { index: false, follow: false },
};

export default FeedbackWritePage;
