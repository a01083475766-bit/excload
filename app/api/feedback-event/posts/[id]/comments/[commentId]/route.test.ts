import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getFeedbackViewerFromRequest: vi.fn(),
  resolveFeedbackViewerUserId: vi.fn(),
  submissionFindUnique: vi.fn(),
  commentFindFirst: vi.fn(),
  commentDelete: vi.fn(),
  invalidatePublicBoardCache: vi.fn(),
}));

vi.mock('@/app/lib/feedback-event/viewer', () => ({
  getFeedbackViewerFromRequest: mocks.getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId: mocks.resolveFeedbackViewerUserId,
}));
vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    feedbackSubmission: { findUnique: mocks.submissionFindUnique },
    feedbackComment: {
      findFirst: mocks.commentFindFirst,
      delete: mocks.commentDelete,
    },
  },
}));
vi.mock('@/app/lib/feedback-event/public-board-cache', () => ({
  invalidatePublicBoardCache: mocks.invalidatePublicBoardCache,
}));

import { DELETE } from './route';

const request = new NextRequest(
  'http://localhost:3000/api/feedback-event/posts/post-1/comments/comment-1',
  { method: 'DELETE' },
);
const ctx = { params: Promise.resolve({ id: 'post-1', commentId: 'comment-1' }) };
const publicPost = { id: 'post-1', userId: 'post-author', publicConsent: true };

describe('feedback comment DELETE permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeedbackViewerFromRequest.mockResolvedValue({
      email: 'viewer@example.com',
      userId: 'viewer-id',
      isAdmin: false,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValue('viewer-id');
    mocks.submissionFindUnique.mockResolvedValue(publicPost);
    mocks.commentFindFirst.mockResolvedValue({ id: 'comment-1', userId: 'viewer-id' });
    mocks.commentDelete.mockResolvedValue({ id: 'comment-1' });
  });

  it('allows a user to delete their own public-post comment', async () => {
    const response = await DELETE(request, ctx);

    expect(response.status).toBe(200);
    expect(mocks.commentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comment-1', submissionId: 'post-1' },
      }),
    );
    expect(mocks.commentDelete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
  });

  it('allows an administrator to delete another user comment', async () => {
    mocks.getFeedbackViewerFromRequest.mockResolvedValueOnce({
      email: 'admin@example.com',
      userId: 'admin-id',
      isAdmin: true,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('admin-id');
    mocks.commentFindFirst.mockResolvedValueOnce({ id: 'comment-1', userId: 'other-user' });

    expect((await DELETE(request, ctx)).status).toBe(200);
  });

  it('returns 403 when a user tries to delete another user comment', async () => {
    mocks.commentFindFirst.mockResolvedValueOnce({ id: 'comment-1', userId: 'other-user' });

    const response = await DELETE(request, ctx);

    expect(response.status).toBe(403);
    expect(mocks.commentDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the comment id belongs to another submission', async () => {
    mocks.commentFindFirst.mockResolvedValueOnce(null);

    const response = await DELETE(request, ctx);

    expect(response.status).toBe(404);
    expect(mocks.commentDelete).not.toHaveBeenCalled();
  });

  it('does not let a private-post author delete comments', async () => {
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('post-author');
    mocks.submissionFindUnique.mockResolvedValueOnce({ ...publicPost, publicConsent: false });
    mocks.commentFindFirst.mockResolvedValueOnce({ id: 'comment-1', userId: 'post-author' });

    const response = await DELETE(request, ctx);

    expect(response.status).toBe(403);
  });
});
