import {
  getFeedbackFeatureLabel,
  getFeedbackResultLabel,
  maskFeedbackAuthor,
} from '@/app/lib/feedback-event/labels';
import type { PublicBoardRow } from '@/app/lib/feedback-event/public-board-cache';

export type BoardPostDto = {
  id: string;
  title: string;
  authorLabel: string;
  isMine: boolean;
  featureLabel: string;
  categoryLabel: string;
  resultLabel: string;
  publicConsent: boolean;
  excerpt: string | null;
  canOpen: boolean;
  canDelete: boolean;
  isPrivatePlaceholder: boolean;
  hasAdminReply: boolean;
  hasSystemReply: boolean;
  commentCount: number;
  createdAt: string;
};

export function serializeFeedbackContent(input: { title: string; body: string }): string {
  const title = input.title.trim();
  const body = input.body.trim();
  return body ? `${title}\n\n${body}` : title;
}

export function parseFeedbackContent(content: string): { title: string; body: string } {
  const lines = content.split(/\r?\n/);
  const firstContentLineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentLineIndex < 0) {
    return { title: '제목 없음', body: '' };
  }

  const title = lines[firstContentLineIndex].trim() || '제목 없음';
  const body = lines
    .filter((_, index) => index !== firstContentLineIndex)
    .join('\n')
    .trim();

  return { title, body };
}

export function feedbackTitle(content: string, max = 72): string {
  const { title } = parseFeedbackContent(content);
  return title.length > max ? `${title.slice(0, max)}…` : title;
}

function feedbackExcerpt(content: string, max = 120): string {
  const { body } = parseFeedbackContent(content);
  const normalized = (body || content).replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

export function visibleFeedbackReply(reply: string | null): string | null {
  if (!reply) return null;
  const legacyBenefitTerms = ['PRO 체험', '체험권', '추가 혜택', '혜택 제공', '사용량'];
  if (legacyBenefitTerms.some((term) => reply.includes(term))) return null;
  return reply;
}

export function mapBoardPost(
  p: PublicBoardRow,
  myUserId: string | null,
  isAdmin: boolean,
): BoardPostDto {
  const isMine = !!myUserId && myUserId === p.userId;
  const canViewContent = p.publicConsent || isMine || isAdmin;
  const reply = visibleFeedbackReply(p.systemReply);
  const hasAdminReply = !!reply || p.comments.length > 0;

  const categoryLabel = getFeedbackFeatureLabel(p.featureUsed);
  const safeCategoryLabel = canViewContent ? categoryLabel : '비공개';

  return {
    id: p.id,
    title: canViewContent ? feedbackTitle(p.content) : '비공개 글입니다',
    authorLabel: canViewContent ? maskFeedbackAuthor(p.userId) : '비공개',
    isMine,
    featureLabel: safeCategoryLabel,
    categoryLabel: safeCategoryLabel,
    resultLabel: canViewContent ? getFeedbackResultLabel(p.conversionResult) : '비공개',
    publicConsent: p.publicConsent,
    excerpt: canViewContent ? feedbackExcerpt(p.content) : null,
    canOpen: canViewContent,
    canDelete: isAdmin,
    isPrivatePlaceholder: !canViewContent,
    hasAdminReply,
    hasSystemReply: hasAdminReply,
    commentCount: canViewContent ? p._count.comments : 0,
    createdAt: p.createdAt.toISOString(),
  };
}
