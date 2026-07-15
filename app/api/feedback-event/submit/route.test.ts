import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getFeedbackViewerFromRequest: vi.fn(),
  userFindUnique: vi.fn(),
  submissionFindUnique: vi.fn(),
  submissionCreate: vi.fn(),
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  invalidatePublicBoardCache: vi.fn(),
}));

vi.mock('@/app/lib/feedback-event/viewer', () => ({
  getFeedbackViewerFromRequest: mocks.getFeedbackViewerFromRequest,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    feedbackSubmission: {
      findUnique: mocks.submissionFindUnique,
      create: mocks.submissionCreate,
    },
  },
}));

vi.mock('@/app/lib/feedback-event/attachment-storage', () => ({
  uploadFeedbackAttachmentObject: mocks.uploadObject,
  deleteFeedbackAttachmentObject: mocks.deleteObject,
}));

vi.mock('@/app/lib/feedback-event/public-board-cache', () => ({
  invalidatePublicBoardCache: mocks.invalidatePublicBoardCache,
}));

vi.mock('@/app/lib/user-access-guard', () => ({
  serviceBlockedResponse: () => null,
}));

import { POST } from './route';

const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';

function buildForm(attachment?: File): FormData {
  const form = new FormData();
  form.append('submissionId', SUBMISSION_ID);
  form.append('featureUsed', 'free');
  form.append('conversionResult', 'other');
  form.append('content', '테스트 제목\n\n충분히 긴 테스트 본문입니다.');
  form.append('publicConsent', 'true');
  if (attachment) form.append('attachment', attachment);
  return form;
}

function requestWith(form: FormData) {
  return new NextRequest('http://localhost:3000/api/feedback-event/submit', {
    method: 'POST',
    body: form,
  });
}

function pngFile() {
  return new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
    '화면.png',
    { type: 'image/png' },
  );
}

describe('POST /api/feedback-event/submit private attachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeedbackViewerFromRequest.mockResolvedValue({
      userId: 'user-a',
      email: 'user@example.com',
      isAdmin: false,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-a',
      isBlocked: false,
      abuseFlag: false,
      blockReason: null,
    });
    mocks.submissionFindUnique.mockResolvedValue(null);
    mocks.submissionCreate.mockResolvedValue({ id: SUBMISSION_ID });
    mocks.uploadObject.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it('creates a post without an attachment', async () => {
    const response = await POST(requestWith(buildForm()));

    expect(response.status).toBe(200);
    expect(mocks.uploadObject).not.toHaveBeenCalled();
    expect(mocks.submissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attachmentName: null, attachmentUrl: null }),
      }),
    );
  });

  it('uploads a valid PNG privately before creating the post', async () => {
    const response = await POST(requestWith(buildForm(pngFile())));

    expect(response.status).toBe(200);
    expect(mocks.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: expect.stringMatching(
          /^feedback\/user-a\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.png$/,
        ),
        contentType: 'image/png',
      }),
    );
    const createData = mocks.submissionCreate.mock.calls[0]?.[0]?.data;
    expect(createData.attachmentUrl).toMatch(/^supabase-private:feedback\//);
    expect(createData.attachmentUrl).not.toContain('/uploads/feedback/');
    expect(mocks.uploadObject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submissionCreate.mock.invocationCallOrder[0],
    );
  });

  it('allows a private post to use the same protected attachment storage', async () => {
    const form = buildForm(pngFile());
    form.set('publicConsent', 'false');

    const response = await POST(requestWith(form));

    expect(response.status).toBe(200);
    expect(mocks.submissionCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      publicConsent: false,
      attachmentUrl: expect.stringMatching(/^supabase-private:feedback\//),
    });
  });

  it('returns 401 before parsing or uploading for an anonymous request', async () => {
    mocks.getFeedbackViewerFromRequest.mockResolvedValue({
      userId: null,
      email: null,
      isAdmin: false,
    });

    const response = await POST(requestWith(buildForm(pngFile())));

    expect(response.status).toBe(401);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.uploadObject).not.toHaveBeenCalled();
  });

  it('deletes the uploaded object when DB creation fails', async () => {
    mocks.submissionCreate.mockRejectedValueOnce(new Error('db failed'));

    const response = await POST(requestWith(buildForm(pngFile())));

    expect(response.status).toBe(500);
    const objectKey = mocks.uploadObject.mock.calls[0]?.[0]?.objectKey;
    expect(mocks.deleteObject).toHaveBeenCalledWith(objectKey);
  });

  it('does not create the post and attempts cleanup when Storage upload fails', async () => {
    mocks.uploadObject.mockRejectedValueOnce(new Error('storage failed'));

    const response = await POST(requestWith(buildForm(pngFile())));

    expect(response.status).toBe(503);
    expect(mocks.submissionCreate).not.toHaveBeenCalled();
    expect(mocks.deleteObject).toHaveBeenCalledOnce();
  });

  it('reuses an existing submission for the same idempotency id without another upload', async () => {
    mocks.submissionFindUnique.mockResolvedValueOnce({ id: SUBMISSION_ID, userId: 'user-a' });

    const response = await POST(requestWith(buildForm(pngFile())));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.submissionId).toBe(SUBMISSION_ID);
    expect(mocks.uploadObject).not.toHaveBeenCalled();
    expect(mocks.submissionCreate).not.toHaveBeenCalled();
  });
});
