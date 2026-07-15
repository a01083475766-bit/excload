import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getFeedbackViewerFromRequest: vi.fn(),
  resolveFeedbackViewerUserId: vi.fn(),
  getPublicBoardRows: vi.fn(),
}));

vi.mock('@/app/lib/feedback-event/viewer', () => ({
  getFeedbackViewerFromRequest: mocks.getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId: mocks.resolveFeedbackViewerUserId,
}));
vi.mock('@/app/lib/feedback-event/public-board-cache', () => ({
  getPublicBoardRows: mocks.getPublicBoardRows,
}));
vi.mock('@/app/lib/feedback-event/perf-log', () => ({
  createFeedbackPerfLogger: () => ({ mark: vi.fn(), flush: vi.fn() }),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: {} }));

import { GET } from './route';

const request = new NextRequest('http://localhost:3000/api/feedback-event/posts?scope=public');
const privateRow = {
  id: 'private-post',
  userId: 'secret-author-id',
  featureUsed: 'question',
  conversionResult: 'success',
  content: '비밀 제목\n\n비밀 본문',
  publicConsent: false,
  systemReply: null,
  createdAt: new Date('2026-07-16T00:00:00.000Z'),
  comments: [{ id: 'admin-comment' }],
  _count: { comments: 2 },
};

describe('GET feedback board posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeedbackViewerFromRequest.mockResolvedValue({
      email: 'viewer@example.com',
      userId: 'viewer-id',
      isAdmin: false,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValue('viewer-id');
    mocks.getPublicBoardRows.mockResolvedValue([privateRow]);
  });

  it('includes another user private row but sends placeholders only', async () => {
    const response = await GET(request);
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.boardPosts).toHaveLength(1);
    expect(json.boardPosts[0]).toMatchObject({
      title: '비공개 글입니다',
      authorLabel: '비공개',
      excerpt: null,
      canOpen: false,
      hasAdminReply: true,
      commentCount: 0,
    });
    expect(serialized).not.toContain('비밀 제목');
    expect(serialized).not.toContain('비밀 본문');
    expect(serialized).not.toContain('secret-author-id');
  });

  it('returns the real private title to its author and an administrator', async () => {
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('secret-author-id');
    const authorJson = await (await GET(request)).json();
    expect(authorJson.boardPosts[0].title).toBe('비밀 제목');

    mocks.getFeedbackViewerFromRequest.mockResolvedValueOnce({
      email: 'admin@example.com',
      userId: 'admin-id',
      isAdmin: true,
    });
    mocks.resolveFeedbackViewerUserId.mockResolvedValueOnce('admin-id');
    const adminJson = await (await GET(request)).json();
    expect(adminJson.boardPosts[0].title).toBe('비밀 제목');
  });
});
