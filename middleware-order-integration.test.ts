import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mocks.getToken,
}));

import { middleware } from './middleware';

function buildRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe('order integration page middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the public root without checking a token', async () => {
    const response = await middleware(buildRequest('/order/integration'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated request to login with a relative callbackUrl', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await middleware(buildRequest('/order/integration/connect?mall=coupang'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/auth?mode=login&callbackUrl=%2Forder%2Fintegration%2Fconnect%3Fmall%3Dcoupang',
    );
  });

  it('allows an authenticated regular user on a work page', async () => {
    mocks.getToken.mockResolvedValue({
      email: 'user@example.com',
      isAdmin: false,
    });

    const response = await middleware(buildRequest('/order/integration/fetch'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
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

  it('keeps the www request origin when redirecting to login', async () => {
    mocks.getToken.mockResolvedValue(null);
    const request = new NextRequest(
      'https://www.excload.com/order/integration/shipments?batch=batch-1',
    );

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://www.excload.com/auth?mode=login&callbackUrl=%2Forder%2Fintegration%2Fshipments%3Fbatch%3Dbatch-1',
    );
  });
});
