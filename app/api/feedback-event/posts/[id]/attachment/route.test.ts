import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getFeedbackViewerFromRequest: vi.fn(),
  resolveFeedbackViewerUserId: vi.fn(),
  submissionFindUnique: vi.fn(),
  downloadObject: vi.fn(),
}));

vi.mock('@/app/lib/feedback-event/viewer', () => ({
  getFeedbackViewerFromRequest: mocks.getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId: mocks.resolveFeedbackViewerUserId,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    feedbackSubmission: { findUnique: mocks.submissionFindUnique },
  },
}));

vi.mock('@/app/lib/feedback-event/attachment-storage', () => ({
  downloadFeedbackAttachmentObject: mocks.downloadObject,
}));

import { GET } from './route';

const ctx = { params: Promise.resolve({ id: 'post-1' }) };
const request = new NextRequest('http://localhost:3000/api/feedback-event/posts/post-1/attachment');

function post(publicConsent: boolean, userId = 'author-a') {
  return {
    id: 'post-1',
    userId,
    publicConsent,
    attachmentName: '화면.png',
    attachmentUrl: 'supabase-private:feedback/author-a/post-1/object.png',
  };
}

describe('GET feedback private attachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeedbackViewerFromRequest.mockResolvedValue({
      email: 'viewer@example.com',
      userId: 'viewer-b',
      isAdmin: false,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValue('viewer-b');
    mocks.submissionFindUnique.mockResolvedValue(post(true));
    mocks.downloadObject.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      contentLength: '3',
    });
  });

  it('returns 401 for an anonymous request', async () => {
    mocks.getFeedbackViewerFromRequest.mockResolvedValueOnce({
      email: null,
      userId: null,
      isAdmin: false,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce(null);

    const response = await GET(request, ctx);

    expect(response.status).toBe(401);
    expect(mocks.submissionFindUnique).not.toHaveBeenCalled();
  });

  it('streams a public post attachment to a logged-in user', async () => {
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(mocks.downloadObject).toHaveBeenCalledOnce();
  });

  it('allows the author to read a private post attachment', async () => {
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('author-a');
    mocks.submissionFindUnique.mockResolvedValueOnce(post(false));

    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
  });

  it('allows an administrator to read a private post attachment', async () => {
    mocks.getFeedbackViewerFromRequest.mockResolvedValueOnce({
      email: 'admin@example.com',
      userId: 'admin-id',
      isAdmin: true,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('admin-id');
    mocks.submissionFindUnique.mockResolvedValueOnce(post(false));

    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
  });

  it('returns 404 without reading storage for another private-post user', async () => {
    mocks.submissionFindUnique.mockResolvedValueOnce(post(false));

    const response = await GET(request, ctx);

    expect(response.status).toBe(404);
    expect(mocks.downloadObject).not.toHaveBeenCalled();
  });

  it('returns 404 when the private object no longer exists', async () => {
    mocks.downloadObject.mockResolvedValueOnce(null);

    const response = await GET(request, ctx);

    expect(response.status).toBe(404);
  });
});
