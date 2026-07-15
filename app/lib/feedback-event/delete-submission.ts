import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/app/lib/prisma';
import { invalidateAnonymousStatusCache } from '@/app/lib/feedback-event/anonymous-status-cache';
import { invalidatePublicBoardCache } from '@/app/lib/feedback-event/public-board-cache';
import { invalidatePublicPostDetailCache } from '@/app/lib/feedback-event/public-post-detail-cache';
import { getPrivateFeedbackAttachmentObjectKey } from '@/app/lib/feedback-event/attachment-reference';
import { deleteFeedbackAttachmentObject } from '@/app/lib/feedback-event/attachment-storage';

/** 피드백 글·첨부 파일 삭제. 없으면 false */
export async function deleteFeedbackSubmissionById(id: string): Promise<boolean> {
  const post = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { attachmentUrl: true },
  });
  if (!post) return false;

  await prisma.feedbackSubmission.delete({ where: { id } });

  const privateObjectKey = getPrivateFeedbackAttachmentObjectKey(post.attachmentUrl);
  if (privateObjectKey) {
    try {
      await deleteFeedbackAttachmentObject(privateObjectKey);
    } catch (error) {
      console.error(
        '[FeedbackDeleteAttachmentCleanup]',
        error instanceof Error ? error.message : error,
      );
    }
  } else if (post.attachmentUrl?.startsWith('/uploads/feedback/')) {
    const filePath = path.join(process.cwd(), 'public', post.attachmentUrl);
    try {
      await fs.unlink(filePath);
    } catch {
      /* 파일 없음 등 무시 */
    }
  }

  invalidatePublicBoardCache();
  invalidatePublicPostDetailCache(id);
  invalidateAnonymousStatusCache();
  return true;
}
