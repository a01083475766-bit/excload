import crypto from 'crypto';

const PRIVATE_ATTACHMENT_PREFIX = 'supabase-private:';
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function buildPrivateFeedbackAttachmentReference(objectKey: string): string {
  return `${PRIVATE_ATTACHMENT_PREFIX}${objectKey}`;
}

export function getPrivateFeedbackAttachmentObjectKey(reference: string | null): string | null {
  if (!reference?.startsWith(PRIVATE_ATTACHMENT_PREFIX)) return null;
  const objectKey = reference.slice(PRIVATE_ATTACHMENT_PREFIX.length);
  return objectKey.startsWith('feedback/') && !objectKey.includes('..') ? objectKey : null;
}

export function buildFeedbackAttachmentDownloadPath(
  postId: string,
  attachmentReference: string | null,
): string | null {
  if (!attachmentReference) return null;
  if (getPrivateFeedbackAttachmentObjectKey(attachmentReference)) {
    return `/api/feedback-event/posts/${encodeURIComponent(postId)}/attachment`;
  }
  return attachmentReference.startsWith('/uploads/feedback/') ? attachmentReference : null;
}

export function buildFeedbackAttachmentObjectKey(input: {
  userId: string;
  submissionId: string;
  extension: '.png' | '.jpg' | '.webp';
}): string {
  if (!SAFE_SEGMENT.test(input.userId) || !SAFE_SEGMENT.test(input.submissionId)) {
    throw new Error('첨부파일 저장 경로를 만들 수 없습니다.');
  }

  return `feedback/${input.userId}/${input.submissionId}/${crypto.randomUUID()}${input.extension}`;
}

export function isValidFeedbackSubmissionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
