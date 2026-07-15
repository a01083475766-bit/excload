import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getFeedbackViewerFromRequest: vi.fn(),
  resolveFeedbackViewerUserId: vi.fn(),
  submissionFindUnique: vi.fn(),
  commentFindMany: vi.fn(),
  commentCreate: vi.fn(),
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
      findMany: mocks.commentFindMany,
      create: mocks.commentCreate,
    },
  },
}));
vi.mock('@/app/lib/feedback-event/public-board-cache', () => ({
  invalidatePublicBoardCache: mocks.invalidatePublicBoardCache,
}));

import { GET, POST } from './route';

const ctx = { params: Promise.resolve({ id: 'post-1' }) };
const publicPost = { id: 'post-1', userId: 'author-id', publicConsent: true };
const privatePost = { ...publicPost, publicConsent: false };

function postRequest(content = '정상 댓글') {
  return new NextRequest('http://localhost:3000/api/feedback-event/posts/post-1/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, userId: 'forged-user-id' }),
  });
}

const getRequest = new NextRequest(
  'http://localhost:3000/api/feedback-event/posts/post-1/comments',
);

describe('feedback comment GET and POST permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeedbackViewerFromRequest.mockResolvedValue({
      email: 'viewer@example.com',
      userId: 'viewer-id',
      isAdmin: false,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValue('viewer-id');
    mocks.submissionFindUnique.mockResolvedValue(publicPost);
    mocks.commentFindMany.mockResolvedValue([]);
    mocks.commentCreate.mockImplementation(async ({ data }) => ({
      id: 'comment-1',
      userId: data.userId,
      content: data.content,
      isAdminComment: data.isAdminComment,
      createdAt: new Date('2026-07-16T00:00:00.000Z'),
    }));
  });

  it('allows a normal user to comment on a public post using the session user id', async () => {
    const response = await POST(postRequest(), ctx);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.comment.isAdminComment).toBe(false);
    expect(mocks.commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'viewer-id', isAdminComment: false }),
      }),
    );
    expect(JSON.stringify(mocks.commentCreate.mock.calls[0][0])).not.toContain('forged-user-id');
  });

  it('marks an administrator comment and allows it on a private post', async () => {
    mocks.getFeedbackViewerFromRequest.mockResolvedValueOnce({
      email: 'admin@example.com',
      userId: 'admin-id',
      isAdmin: true,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('admin-id');
    mocks.submissionFindUnique.mockResolvedValueOnce(privatePost);

    const response = await POST(postRequest('운영자 답변'), ctx);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.comment.isAdminComment).toBe(true);
  });

  it('returns 403 when a private-post author tries to comment', async () => {
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('author-id');
    mocks.submissionFindUnique.mockResolvedValueOnce(privatePost);

    const response = await POST(postRequest(), ctx);

    expect(response.status).toBe(403);
    expect(mocks.commentCreate).not.toHaveBeenCalled();
  });

  it('returns 404 for another user reading or commenting on a private post', async () => {
    mocks.submissionFindUnique.mockResolvedValue(privatePost);

    expect((await GET(getRequest, ctx)).status).toBe(404);
    expect((await POST(postRequest(), ctx)).status).toBe(404);
    expect(mocks.commentFindMany).not.toHaveBeenCalled();
    expect(mocks.commentCreate).not.toHaveBeenCalled();
  });

  it('returns 401 for an anonymous comment request', async () => {
    mocks.getFeedbackViewerFromRequest.mockResolvedValueOnce({
      email: null,
      userId: null,
      isAdmin: false,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce(null);

    const response = await POST(postRequest(), ctx);

    expect(response.status).toBe(401);
    expect(mocks.submissionFindUnique).not.toHaveBeenCalled();
  });

  it('returns only admin comments to the private-post author', async () => {
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('author-id');
    mocks.submissionFindUnique.mockResolvedValueOnce(privatePost);

    const response = await GET(getRequest, ctx);

    expect(response.status).toBe(200);
    expect(mocks.commentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { submissionId: 'post-1', isAdminComment: true },
      }),
    );
  });

  it('rejects too-short and over-limit comments', async () => {
    expect((await POST(postRequest('한'), ctx)).status).toBe(400);
    expect((await POST(postRequest('가'.repeat(2_001)), ctx)).status).toBe(400);
    expect(mocks.commentCreate).not.toHaveBeenCalled();
  });
});
