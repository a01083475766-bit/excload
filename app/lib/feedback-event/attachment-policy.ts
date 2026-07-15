type FeedbackAttachmentLike = {
  size: number;
} | null | undefined;

const MAX_PUBLIC_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function hasFeedbackAttachment(file: FeedbackAttachmentLike | string): file is { size: number } {
  return typeof file !== 'string' && !!file && file.size > 0;
}

export function validateFeedbackAttachmentPolicy(input: {
  publicConsent: boolean;
  attachment: FeedbackAttachmentLike | string;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!hasFeedbackAttachment(input.attachment)) return { ok: true };

  if (typeof input.attachment !== 'string' && input.attachment.size > MAX_PUBLIC_ATTACHMENT_BYTES) {
    return { ok: false, status: 400, error: '첨부 파일은 5MB 이하만 가능합니다.' };
  }

  return { ok: true };
}

export { MAX_PUBLIC_ATTACHMENT_BYTES };
