import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAkmanAdmin: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/app/lib/voucher/require-akman-admin', () => ({
  requireAkmanAdmin: mocks.requireAkmanAdmin,
}));

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    voiceProfile: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock('@/app/lib/akman-voice/storage', () => ({
  isVoiceStorageConfigured: () => true,
}));

import { GET } from './route';

describe('GET /api/akman/voice/profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VOICE_SERVICE_URL;
    delete process.env.VOICE_SERVICE_SECRET;
    mocks.findMany.mockResolvedValue([]);
  });

  it('rejects non-admin', async () => {
    mocks.requireAkmanAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: '관리자 권한이 필요합니다.' }), {
        status: 403,
      }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('returns profiles and disabled voice service status for admin', async () => {
    mocks.requireAkmanAdmin.mockResolvedValue({
      ok: true,
      email: 'admin@example.com',
      userId: 'u1',
    });
    mocks.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: '여성 독백 A',
        referenceOriginalName: 'a.wav',
        referenceMimeType: 'audio/wav',
        referenceDurationSeconds: 5,
        promptText: '대사',
        defaultInstruction: null,
        defaultSpeed: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.profiles).toHaveLength(1);
    expect(json.profiles[0].name).toBe('여성 독백 A');
    expect(json.voiceService.configured).toBe(false);
  });
});
