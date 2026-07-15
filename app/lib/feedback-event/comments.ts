import { maskFeedbackAuthor } from '@/app/lib/feedback-event/labels';

export const FEEDBACK_COMMENT_MIN_LENGTH = 2;
export const FEEDBACK_COMMENT_MAX_LENGTH = 2_000;

export type FeedbackCommentDto = {
  id: string;
  content: string;
  authorLabel: string;
  isMine: boolean;
  isAdminComment: boolean;
  canDelete: boolean;
  createdAt: string;
};

type FeedbackCommentRow = {
  id: string;
  userId: string;
  content: string;
  isAdminComment: boolean;
  createdAt: Date;
};

export function validateFeedbackCommentContent(
  value: unknown,
): { ok: true; content: string } | { ok: false; error: string } {
  if (typeof value !== 'string') {
    return { ok: false, error: '댓글 내용을 입력해주세요.' };
  }

  const content = value.trim();
  if (content.length < FEEDBACK_COMMENT_MIN_LENGTH) {
    return { ok: false, error: '댓글은 2자 이상 입력해주세요.' };
  }
  if (content.length > FEEDBACK_COMMENT_MAX_LENGTH) {
    return { ok: false, error: '댓글은 2,000자 이하로 입력해주세요.' };
  }

  return { ok: true, content };
}

export function canCreateFeedbackComment(input: {
  publicConsent: boolean;
  isAdmin: boolean;
}): boolean {
  return input.publicConsent || input.isAdmin;
}

export function canDeleteFeedbackComment(input: {
  publicConsent: boolean;
  commentUserId: string;
  viewerUserId: string | null;
  isAdmin: boolean;
}): boolean {
  if (input.isAdmin) return true;
  return (
    input.publicConsent &&
    !!input.viewerUserId &&
    input.commentUserId === input.viewerUserId
  );
}

export function mapFeedbackComment(
  comment: FeedbackCommentRow,
  viewerUserId: string | null,
  isAdmin: boolean,
  publicConsent: boolean,
): FeedbackCommentDto {
  const isMine = !!viewerUserId && comment.userId === viewerUserId;

  return {
    id: comment.id,
    content: comment.content,
    authorLabel: comment.isAdminComment
      ? '운영자'
      : isMine
        ? '나'
        : maskFeedbackAuthor(comment.userId),
    isMine,
    isAdminComment: comment.isAdminComment,
    canDelete: canDeleteFeedbackComment({
      publicConsent,
      commentUserId: comment.userId,
      viewerUserId,
      isAdmin,
    }),
    createdAt: comment.createdAt.toISOString(),
  };
}
