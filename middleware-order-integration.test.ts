import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  isAdminEmail: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mocks.getToken,
}));

vi.mock('@/app/lib/admin-auth', () => ({
  isAdminEmail: mocks.isAdminEmail,
}));

import { middleware } from './middleware';

function buildRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe('order integration page middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminEmail.mockReturnValue(false);
  });

  it('redirects an unauthenticated request to login with a relative callbackUrl', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await middleware(buildRequest('/order/integration/connect?mall=coupang'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/auth?mode=login&callbackUrl=%2Forder%2Fintegration%2Fconnect%3Fmall%3Dcoupang',
    );
  });

  it('redirects an authenticated non-admin away from the page', async () => {
    mocks.getToken.mockResolvedValue({
      email: 'user@example.com',
      isAdmin: false,
    });

    const response = await middleware(buildRequest('/order/integration'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/excload');
  });

  it('allows token.isAdmin administrators', async () => {
    mocks.getToken.mockResolvedValue({
      email: 'admin@example.com',
      isAdmin: true,
    });

    const response = await middleware(buildRequest('/order/integration/shipments'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('allows administrators recognized by the existing email rule', async () => {
    mocks.getToken.mockResolvedValue({
      email: 'admin@example.com',
      isAdmin: false,
    });
    mocks.isAdminEmail.mockReturnValue(true);

    const response = await middleware(buildRequest('/order/integration/fetch'));

    expect(response.status).toBe(200);
    expect(mocks.isAdminEmail).toHaveBeenCalledWith('admin@example.com');
  });
});
