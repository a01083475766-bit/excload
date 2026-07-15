import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteFeedbackAttachmentObject,
  downloadFeedbackAttachmentObject,
  uploadFeedbackAttachmentObject,
} from '@/app/lib/feedback-event/attachment-storage';

const envSnapshot = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FEEDBACK_STORAGE_BUCKET: process.env.FEEDBACK_STORAGE_BUCKET,
};

describe('feedback private Supabase Storage adapter', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.FEEDBACK_STORAGE_BUCKET = 'feedback-private';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uploads to a private object endpoint without upsert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadFeedbackAttachmentObject({
      objectKey: 'feedback/user-a/post-a/object.png',
      bytes: Buffer.from([1]),
      contentType: 'image/png',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/feedback-private/feedback/user-a/post-a/object.png',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-upsert': 'false', 'Content-Type': 'image/png' }),
      }),
    );
  });

  it('downloads only through the authenticated object endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadFeedbackAttachmentObject(
      'feedback/user-a/post-a/object.png',
    );

    expect(result).not.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/storage/v1/object/authenticated/');
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('/object/public/');
  });

  it('deletes objects through the Storage API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteFeedbackAttachmentObject('feedback/user-a/post-a/object.png');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/feedback-private',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ prefixes: ['feedback/user-a/post-a/object.png'] }),
      }),
    );
  });

  it('fails closed when server-only storage settings are missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadFeedbackAttachmentObject({
        objectKey: 'feedback/user-a/post-a/object.png',
        bytes: Buffer.from([1]),
        contentType: 'image/png',
      }),
    ).rejects.toThrow('설정되지 않았습니다');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
