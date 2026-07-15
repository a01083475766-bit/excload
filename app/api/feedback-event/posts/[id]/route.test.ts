import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getFeedbackViewerFromRequest: vi.fn(),
  resolveFeedbackViewerUserId: vi.fn(),
  submissionFindUnique: vi.fn(),
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

vi.mock('@/app/lib/feedback-event/delete-submission', () => ({
  deleteFeedbackSubmissionById: vi.fn(),
}));

vi.mock('@/app/lib/feedback-event/perf-log', () => ({
  createFeedbackPerfLogger: () => ({ mark: vi.fn(), flush: vi.fn() }),
}));

import { GET } from './route';

const request = new NextRequest('http://localhost:3000/api/feedback-event/posts/post-1');
const ctx = { params: Promise.resolve({ id: 'post-1' }) };

function publicPost(attachmentUrl: string | null) {
  return {
    id: 'post-1',
    userId: 'author-a',
    user: { email: 'author@example.com' },
    featureUsed: 'free',
    conversionResult: 'other',
    content: '제목\n\n본문입니다.',
    publicConsent: true,
    attachmentName: '화면.png',
    attachmentUrl,
    systemReply: null,
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
    comments: [],
    _count: { comments: 0 },
  };
}

describe('GET feedback post attachment response compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeedbackViewerFromRequest.mockResolvedValue({
      email: 'viewer@example.com',
      userId: 'viewer-b',
      isAdmin: false,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValue('viewer-b');
  });

  it('exposes only the protected API path for a new private object', async () => {
    mocks.submissionFindUnique.mockResolvedValue(
      publicPost('supabase-private:feedback/author-a/post-1/private-object.png'),
    );

    const response = await GET(request, ctx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.post.attachmentUrl).toBe('/api/feedback-event/posts/post-1/attachment');
    expect(JSON.stringify(json)).not.toContain('private-object.png');
  });

  it('keeps an existing public upload URL unchanged', async () => {
    mocks.submissionFindUnique.mockResolvedValue(publicPost('/uploads/feedback/legacy.png'));

    const response = await GET(request, ctx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.post.attachmentUrl).toBe('/uploads/feedback/legacy.png');
  });

  it('allows the author and admin to read a private post but returns 404 to another user', async () => {
    const privatePost = { ...publicPost(null), publicConsent: false };
    mocks.submissionFindUnique.mockResolvedValue(privatePost);

    const denied = await GET(request, ctx);
    expect(denied.status).toBe(404);

    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('author-a');
    const authorResponse = await GET(request, ctx);
    expect(authorResponse.status).toBe(200);

    mocks.getFeedbackViewerFromRequest.mockResolvedValueOnce({
      email: 'admin@example.com',
      userId: 'admin-id',
      isAdmin: true,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('admin-id');
    const adminResponse = await GET(request, ctx);
    expect(adminResponse.status).toBe(200);
  });

  it('keeps normal legacy replies visible and hides benefit auto replies', async () => {
    mocks.submissionFindUnique.mockResolvedValue({
      ...publicPost('/uploads/feedback/legacy.png'),
      systemReply: '확인 후 수정했습니다.',
    });
    const visibleJson = await (await GET(request, ctx)).json();
    expect(visibleJson.post.systemReply).toBe('확인 후 수정했습니다.');
    expect(visibleJson.post.hasAdminReply).toBe(true);

    mocks.submissionFindUnique.mockResolvedValue({
      ...publicPost('/uploads/feedback/legacy.png'),
      systemReply: 'PRO 체험 혜택 제공 안내',
    });
    const hiddenJson = await (await GET(request, ctx)).json();
    expect(hiddenJson.post.systemReply).toBeNull();
    expect(hiddenJson.post.hasAdminReply).toBe(false);
  });
});
