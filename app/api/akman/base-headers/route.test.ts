import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/app/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/lib/admin-auth', () => ({
  isAdminEmail: mocks.isAdminEmail,
}));

import { GET } from './route';

describe('/api/akman/base-headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.isAdminEmail.mockReturnValue(true);
  });

  it('관리자가 아니면 접근할 수 없다', async () => {
    mocks.isAdminEmail.mockReturnValue(false);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('관리자 권한 필요');
  });

  it('관리자는 BASE_HEADERS 목록을 기존 순서대로 조회할 수 있다', async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([...BASE_HEADERS]);
    expect(json.data.length).toBeGreaterThan(0);
  });

  it('count는 목록 길이와 일치한다', async () => {
    const res = await GET();
    const json = await res.json();

    expect(json.count).toBe(json.data.length);
    expect(json.count).toBe(BASE_HEADERS.length);
  });

  it('원본 rows/file/sample 관련 필드를 응답하지 않는다', async () => {
    const res = await GET();
    const json = await res.json();

    expect(json.rows).toBeUndefined();
    expect(json.file).toBeUndefined();
    expect(json.fileName).toBeUndefined();
    expect(json.samples).toBeUndefined();
    expect(json.maskedSamples).toBeUndefined();
  });
});
