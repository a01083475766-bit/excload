import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteVoiceObject,
  downloadVoiceObject,
  uploadVoiceObject,
} from '@/app/lib/akman-voice/storage';

const envSnapshot = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  VOICE_STORAGE_BUCKET: process.env.VOICE_STORAGE_BUCKET,
};

describe('voice private Supabase Storage adapter', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.VOICE_STORAGE_BUCKET = 'voice-private';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uploads under voice/ prefix without public URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadVoiceObject({
      objectKey: 'voice/refs/abc/reference.wav',
      bytes: Buffer.from([1]),
      contentType: 'audio/wav',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/voice-private/voice/refs/abc/reference.wav',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-upsert': 'false' }),
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('/object/public/');
  });

  it('downloads via authenticated endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadVoiceObject('voice/outputs/abc/gen.wav');
    expect(result).not.toBeNull();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/object/authenticated/');
  });

  it('rejects non-voice object keys', async () => {
    await expect(
      uploadVoiceObject({
        objectKey: 'feedback/x',
        bytes: Buffer.from([1]),
        contentType: 'audio/wav',
      }),
    ).rejects.toThrow(/object key/);
  });

  it('deletes by prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteVoiceObject('voice/refs/abc/reference.wav');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/voice-private',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ prefixes: ['voice/refs/abc/reference.wav'] }),
      }),
    );
  });
});
