import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callVoiceWorkerGenerate, getVoiceServiceStatus } from '@/app/lib/akman-voice/voice-service';

const envSnapshot = {
  VOICE_SERVICE_URL: process.env.VOICE_SERVICE_URL,
  VOICE_SERVICE_SECRET: process.env.VOICE_SERVICE_SECRET,
};

describe('voice-service client', () => {
  beforeEach(() => {
    delete process.env.VOICE_SERVICE_URL;
    delete process.env.VOICE_SERVICE_SECRET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('reports unconfigured when env missing', () => {
    expect(getVoiceServiceStatus().configured).toBe(false);
  });

  it('returns Korean disabled error without calling network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await callVoiceWorkerGenerate({
      referenceDownloadUrl: 'https://project.supabase.co/storage/v1/object/sign/x',
      referenceFilename: 'a.wav',
      outputUploadUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/y',
      outputObjectKey: 'voice/outputs/p/g.wav',
      promptText: '프롬프트',
      text: '독백',
      speed: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/설정되지 않았습니다/);
      expect(result.status).toBe(503);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends JSON + bearer secret when configured (no audio binary)', async () => {
    process.env.VOICE_SERVICE_URL = 'https://voice.example.com';
    process.env.VOICE_SERVICE_SECRET = 'shared-secret';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, output_storage_path: 'voice/outputs/p/g.wav' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await callVoiceWorkerGenerate({
      referenceDownloadUrl: 'https://project.supabase.co/storage/v1/object/sign/ref',
      referenceFilename: 'a.wav',
      outputUploadUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/out',
      outputObjectKey: 'voice/outputs/p/g.wav',
      promptText: '프롬프트',
      text: '독백',
      instruction: '천천히',
      speed: 0.9,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://voice.example.com/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer shared-secret',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.reference_download_url).toContain('object/sign');
    expect(body.output_upload_url).toContain('object/upload/sign');
    expect(body.output_object_key).toBe('voice/outputs/p/g.wav');
    expect(body).not.toHaveProperty('reference_audio');
  });
});
