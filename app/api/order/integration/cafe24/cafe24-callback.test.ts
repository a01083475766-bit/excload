import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireOrderIntegrationUser: vi.fn(),
  verifyCafe24OAuthState: vi.fn(),
  getCafe24AccountById: vi.fn(),
  toCafe24Credentials: vi.fn(),
  exchangeCafe24AuthorizationCode: vi.fn(),
  saveCafe24OAuthTokens: vi.fn(),
}));

vi.mock('@/app/lib/order-integration/user-api-auth', () => ({
  requireOrderIntegrationUser: mocks.requireOrderIntegrationUser,
  isOrderIntegrationUserAuthFailure: (auth: { response?: Response }) => Boolean(auth.response),
}));

vi.mock('@/app/lib/cafe24/oauth-state', () => ({
  verifyCafe24OAuthState: mocks.verifyCafe24OAuthState,
}));

vi.mock('@/app/lib/cafe24/client', () => ({
  exchangeCafe24AuthorizationCode: mocks.exchangeCafe24AuthorizationCode,
}));

vi.mock('@/app/lib/order-integration/cafe24-account', () => ({
  getCafe24AccountById: mocks.getCafe24AccountById,
  toCafe24Credentials: mocks.toCafe24Credentials,
  saveCafe24OAuthTokens: mocks.saveCafe24OAuthTokens,
}));

import { GET } from '@/app/api/order/integration/cafe24/callback/route';

function buildRequest() {
  return new NextRequest(
    'https://www.excload.com/api/order/integration/cafe24/callback?code=auth-code&state=signed-state',
  );
}

describe('Cafe24 OAuth callback user ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrderIntegrationUser.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
    });
    mocks.verifyCafe24OAuthState.mockReturnValue({
      userId: 'user-1',
      accountId: 'account-1',
      mallId: 'myshop',
    });
    mocks.getCafe24AccountById.mockResolvedValue({
      id: 'account-1',
      userId: 'user-1',
      vendorId: 'myshop',
    });
    mocks.toCafe24Credentials.mockReturnValue({ mallId: 'myshop' });
    mocks.exchangeCafe24AuthorizationCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    mocks.saveCafe24OAuthTokens.mockResolvedValue(undefined);
  });

  it('allows a regular user and saves tokens only to that user account', async () => {
    const response = await GET(buildRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('oauth=success');
    expect(mocks.getCafe24AccountById).toHaveBeenCalledWith({
      userId: 'user-1',
      accountId: 'account-1',
    });
    expect(mocks.saveCafe24OAuthTokens).toHaveBeenCalledWith({
      accountId: 'account-1',
      tokens: expect.objectContaining({ accessToken: 'access-token' }),
    });
  });

  it('rejects another user state before loading or saving an account', async () => {
    mocks.verifyCafe24OAuthState.mockReturnValue({
      userId: 'user-2',
      accountId: 'account-2',
      mallId: 'other-shop',
    });

    const response = await GET(buildRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('oauth=error');
    expect(mocks.getCafe24AccountById).not.toHaveBeenCalled();
    expect(mocks.exchangeCafe24AuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.saveCafe24OAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects a callback without a logged-in user', async () => {
    mocks.requireOrderIntegrationUser.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    });

    const response = await GET(buildRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('oauth=error');
    expect(mocks.getCafe24AccountById).not.toHaveBeenCalled();
  });
});
