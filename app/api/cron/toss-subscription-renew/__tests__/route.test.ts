import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { authorizeCron, GET, POST } from '../route';

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    subscription: { findFirst: vi.fn() },
  },
}));

describe('toss-subscription-renew cron route', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.TOSS_SECRET_KEY = 'test-toss-secret';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
    vi.clearAllMocks();
  });

  it('authorizeCron accepts Bearer CRON_SECRET', () => {
    const req = new NextRequest('http://localhost/api/cron/toss-subscription-renew', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    expect(authorizeCron(req)).toBe(true);
  });

  it('authorizeCron rejects missing or wrong secret', () => {
    expect(
      authorizeCron(new NextRequest('http://localhost/api/cron/toss-subscription-renew'))
    ).toBe(false);
    expect(
      authorizeCron(
        new NextRequest('http://localhost/api/cron/toss-subscription-renew', {
          headers: { authorization: 'Bearer wrong' },
        })
      )
    ).toBe(false);
  });

  it('GET returns 401 without authorization', async () => {
    const res = await GET(new NextRequest('http://localhost/api/cron/toss-subscription-renew'));
    expect(res.status).toBe(401);
  });

  it('POST returns 401 without authorization', async () => {
    const res = await POST(new NextRequest('http://localhost/api/cron/toss-subscription-renew'));
    expect(res.status).toBe(401);
  });

  it('GET returns 200 with valid Bearer (empty candidate list)', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/cron/toss-subscription-renew', {
        headers: { authorization: 'Bearer test-cron-secret' },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(0);
  });
});
