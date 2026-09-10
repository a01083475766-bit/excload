import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVoiceSignedDownloadUrl,
  createVoiceSignedUploadUrl,
  deleteVoiceObject,
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

  it('creates signed upload URLs without exposing service role in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: '/object/upload/sign/voice-private/voice/refs/abc/reference.wav?token=abc.token',
          token: 'abc.token',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createVoiceSignedUploadUrl('voice/refs/abc/reference.wav');
    expect(result.signedUploadUrl).toContain('/object/upload/sign/');
    expect(result.signedUploadUrl).toContain('token=abc.token');
    expect(result.signedUploadUrl).not.toContain('test-service-role-key');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/object/upload/sign/');
  });

  it('creates signed download URLs for private objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          signedURL: '/object/sign/voice-private/voice/outputs/a/b.wav?token=dl.token',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createVoiceSignedDownloadUrl('voice/outputs/a/b.wav', 300);
    expect(result.signedDownloadUrl).toContain('/object/sign/');
    expect(result.signedDownloadUrl).not.toContain('/object/public/');
    expect(result.signedDownloadUrl).not.toContain('test-service-role-key');
  });

  it('rejects non-voice object keys', async () => {
    await expect(createVoiceSignedUploadUrl('feedback/x')).rejects.toThrow(/object key/);
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
