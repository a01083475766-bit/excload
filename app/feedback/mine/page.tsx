import type { Metadata } from 'next';
import FeedbackMinePage from '@/app/feedback-event/mine/page';

export const metadata: Metadata = {
  title: '내가 작성한 의견',
  robots: { index: false, follow: false },
};

export default FeedbackMinePage;
