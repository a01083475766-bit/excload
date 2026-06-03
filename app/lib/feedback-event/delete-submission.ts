import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/app/lib/prisma';

/** 피드백 글·첨부 파일 삭제. 없으면 false */
export async function deleteFeedbackSubmissionById(id: string): Promise<boolean> {
  const post = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { attachmentUrl: true },
  });
  if (!post) return false;

  if (post.attachmentUrl?.startsWith('/uploads/feedback/')) {
    const filePath = path.join(process.cwd(), 'public', post.attachmentUrl);
    try {
      await fs.unlink(filePath);
    } catch {
      /* 파일 없음 등 무시 */
    }
  }

  await prisma.feedbackSubmission.delete({ where: { id } });
  return true;
}
