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

function publicPost(attachmentUrl: string) {
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
});
