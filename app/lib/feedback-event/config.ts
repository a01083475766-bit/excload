import { prisma } from '@/app/lib/prisma';
import { DEFAULT_FEEDBACK_EVENT_ENDS_AT } from './constants';

export type FeedbackEventConfig = {
  isEnabled: boolean;
  endsAt: Date;
  /** 접수·팝업·네비 노출 가능 여부 */
  isActive: boolean;
};

export async function getFeedbackEventConfig(): Promise<FeedbackEventConfig> {
  let row = await prisma.feedbackEventSettings.findUnique({
    where: { id: 'default' },
  });

  if (!row) {
    row = await prisma.feedbackEventSettings.create({
      data: {
        id: 'default',
        endsAt: DEFAULT_FEEDBACK_EVENT_ENDS_AT,
        isEnabled: true,
      },
    });
  }

  const now = Date.now();
  const isActive = row.isEnabled && row.endsAt.getTime() > now;

  return {
    isEnabled: row.isEnabled,
    endsAt: row.endsAt,
    isActive,
  };
}

export function formatFeedbackEventEndLabel(endsAt: Date): string {
  return endsAt.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
