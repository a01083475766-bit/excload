import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  submissionFindUnique: vi.fn(),
  submissionDelete: vi.fn(),
  deleteObject: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    feedbackSubmission: {
      findUnique: mocks.submissionFindUnique,
      delete: mocks.submissionDelete,
    },
  },
}));

vi.mock('@/app/lib/feedback-event/attachment-storage', () => ({
  deleteFeedbackAttachmentObject: mocks.deleteObject,
}));

vi.mock('fs/promises', () => ({ default: { unlink: mocks.unlink } }));

vi.mock('@/app/lib/feedback-event/anonymous-status-cache', () => ({
  invalidateAnonymousStatusCache: vi.fn(),
}));
vi.mock('@/app/lib/feedback-event/public-board-cache', () => ({
  invalidatePublicBoardCache: vi.fn(),
}));
vi.mock('@/app/lib/feedback-event/public-post-detail-cache', () => ({
  invalidatePublicPostDetailCache: vi.fn(),
}));

import { deleteFeedbackSubmissionById } from '@/app/lib/feedback-event/delete-submission';

describe('deleteFeedbackSubmissionById attachment cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submissionDelete.mockResolvedValue({ id: 'post-1' });
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it('deletes a private object after deleting its post', async () => {
    mocks.submissionFindUnique.mockResolvedValue({
      attachmentUrl: 'supabase-private:feedback/user-a/post-1/object.png',
    });

    await expect(deleteFeedbackSubmissionById('post-1')).resolves.toBe(true);

    expect(mocks.submissionDelete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
    expect(mocks.deleteObject).toHaveBeenCalledWith('feedback/user-a/post-1/object.png');
  });

  it('does not treat a legacy public attachment as a private object', async () => {
    mocks.submissionFindUnique.mockResolvedValue({
      attachmentUrl: '/uploads/feedback/legacy.png',
    });
    mocks.unlink.mockResolvedValue(undefined);

    await expect(deleteFeedbackSubmissionById('post-1')).resolves.toBe(true);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.unlink).toHaveBeenCalledOnce();
  });
});
