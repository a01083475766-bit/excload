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
      referenceAudio: Buffer.from([1]),
      referenceFilename: 'a.wav',
      referenceMimeType: 'audio/wav',
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

  it('sends bearer secret when configured', async () => {
    process.env.VOICE_SERVICE_URL = 'https://voice.example.com';
    process.env.VOICE_SERVICE_SECRET = 'shared-secret';
    const wavHeader = Buffer.alloc(44, 1);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(wavHeader, { status: 200, headers: { 'content-type': 'audio/wav' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await callVoiceWorkerGenerate({
      referenceAudio: Buffer.from([1, 2, 3]),
      referenceFilename: 'a.wav',
      referenceMimeType: 'audio/wav',
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
        headers: expect.objectContaining({ Authorization: 'Bearer shared-secret' }),
      }),
    );
  });
});
