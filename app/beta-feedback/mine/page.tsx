import type { Metadata } from 'next';
import FeedbackMinePage from '@/app/feedback-event/mine/page';

export const metadata: Metadata = {
  title: '내 베타 피드백',
  robots: { index: false, follow: false },
};

export default FeedbackMinePage;
