import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAkmanAdmin: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createVoiceSignedDownloadUrl: vi.fn(),
  createVoiceSignedUploadUrl: vi.fn(),
  voiceObjectExists: vi.fn(),
  callVoiceWorkerGenerate: vi.fn(),
  getVoiceServiceStatus: vi.fn(),
  isVoiceStorageConfigured: vi.fn(),
}));

vi.mock('@/app/lib/voucher/require-akman-admin', () => ({
  requireAkmanAdmin: mocks.requireAkmanAdmin,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    voiceProfile: { findUnique: mocks.findUnique },
    voiceGeneration: {
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

vi.mock('@/app/lib/akman-voice/storage', () => ({
  buildVoiceOutputObjectKey: (profileId: string, generationId: string) =>
    `voice/outputs/${profileId}/${generationId}.wav`,
  createVoiceSignedDownloadUrl: mocks.createVoiceSignedDownloadUrl,
  createVoiceSignedUploadUrl: mocks.createVoiceSignedUploadUrl,
  voiceObjectExists: mocks.voiceObjectExists,
  isVoiceStorageConfigured: mocks.isVoiceStorageConfigured,
}));

vi.mock('@/app/lib/akman-voice/voice-service', () => ({
  callVoiceWorkerGenerate: mocks.callVoiceWorkerGenerate,
  getVoiceServiceStatus: mocks.getVoiceServiceStatus,
}));

import { POST } from './route';

describe('POST /api/akman/voice/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAkmanAdmin.mockResolvedValue({
      ok: true,
      email: 'admin@example.com',
      userId: 'u1',
    });
    mocks.isVoiceStorageConfigured.mockReturnValue(true);
    mocks.getVoiceServiceStatus.mockReturnValue({ configured: false, url: null });
  });

  it('returns 503 when voice worker is not configured', async () => {
    const res = await POST(
      new Request('http://localhost/api/akman/voice/generate', {
        method: 'POST',
        body: JSON.stringify({
          voiceProfileId: 'p1',
          text: '독백',
          speed: 1,
        }),
      }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/설정되지 않았습니다/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects non-admin', async () => {
    mocks.requireAkmanAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: '관리자 권한이 필요합니다.' }), {
        status: 403,
      }),
    });
    const res = await POST(
      new Request('http://localhost/api/akman/voice/generate', {
        method: 'POST',
        body: JSON.stringify({ voiceProfileId: 'p1', text: '독백' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('marks generation FAILED when worker returns an error', async () => {
    mocks.getVoiceServiceStatus.mockReturnValue({
      configured: true,
      url: 'https://voice.example.com',
    });
    mocks.findUnique.mockResolvedValue({
      id: 'p1',
      referenceStoragePath: 'voice/refs/p1/reference.wav',
      referenceOriginalName: 'a.wav',
      referenceMimeType: 'audio/wav',
      promptText: '프롬프트',
    });
    mocks.create.mockResolvedValue({
      id: 'g1',
      voiceProfileId: 'p1',
      text: '독백',
      instruction: null,
      speed: 1,
      status: 'PROCESSING',
      errorMessage: null,
      outputStoragePath: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      voiceProfile: { name: '여성 독백 A' },
    });
    mocks.createVoiceSignedDownloadUrl.mockResolvedValue({
      objectKey: 'voice/refs/p1/reference.wav',
      signedDownloadUrl: 'https://project.supabase.co/storage/v1/object/sign/ref',
      expiresInSeconds: 1800,
    });
    mocks.createVoiceSignedUploadUrl.mockResolvedValue({
      objectKey: 'voice/outputs/p1/g1.wav',
      signedUploadUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/out',
      token: 'tok',
    });
    mocks.callVoiceWorkerGenerate.mockResolvedValue({
      ok: false,
      error: '음성 생성 중 오류가 발생했습니다.',
      status: 500,
    });
    mocks.update.mockResolvedValue({});

    const res = await POST(
      new Request('http://localhost/api/akman/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceProfileId: 'p1', text: '독백', speed: 1 }),
      }),
    );

    expect(res.status).toBe(500);
    expect(mocks.callVoiceWorkerGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceDownloadUrl: expect.stringContaining('object/sign'),
        outputUploadUrl: expect.stringContaining('object/upload/sign'),
        outputObjectKey: 'voice/outputs/p1/g1.wav',
      }),
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: {
        status: 'FAILED',
        errorMessage: '음성 생성 중 오류가 발생했습니다.',
      },
    });
    expect(mocks.voiceObjectExists).not.toHaveBeenCalled();
  });
});
