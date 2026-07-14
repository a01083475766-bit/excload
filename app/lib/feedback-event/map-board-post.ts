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
  resultLabel: string;
  publicConsent: boolean;
  excerpt: string | null;
  canOpen: boolean;
  canDelete: boolean;
  hasSystemReply: boolean;
  createdAt: string;
};

export function feedbackTitle(content: string, max = 72): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const title = firstLine || '제목 없음';
  return title.length > max ? `${title.slice(0, max)}…` : title;
}

function feedbackExcerpt(content: string, max = 120): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

export function mapBoardPost(
  p: PublicBoardRow,
  myUserId: string | null,
  isAdmin: boolean,
): BoardPostDto {
  const isMine = !!myUserId && myUserId === p.userId;
  const canViewContent = p.publicConsent || isMine || isAdmin;

  return {
    id: p.id,
    title: canViewContent ? feedbackTitle(p.content) : '비공개 글',
    authorLabel: maskFeedbackAuthor(p.userId),
    isMine,
    featureLabel: getFeedbackFeatureLabel(p.featureUsed),
    resultLabel: getFeedbackResultLabel(p.conversionResult),
    publicConsent: p.publicConsent,
    excerpt: canViewContent ? feedbackExcerpt(p.content) : null,
    canOpen: canViewContent,
    canDelete: isAdmin,
    hasSystemReply: !!p.systemReply,
    createdAt: p.createdAt.toISOString(),
  };
}
