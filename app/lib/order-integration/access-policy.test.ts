import { describe, expect, it } from 'vitest';
import {
  buildAuthLoginRedirectPath,
  getPostLoginPath,
  requiresMiddlewareSession,
} from '@/app/lib/auth/post-login-redirect';
import {
  isProtectedOrderIntegrationPath,
  isPublicOrderIntegrationPath,
} from '@/app/lib/order-integration/access-policy';

describe('order integration access policy', () => {
  it('keeps only the integration root public', () => {
    expect(isPublicOrderIntegrationPath('/order/integration')).toBe(true);
    expect(isPublicOrderIntegrationPath('/order/integration?from=nav')).toBe(true);
    expect(isProtectedOrderIntegrationPath('/order/integration/connect')).toBe(true);
    expect(isProtectedOrderIntegrationPath('/order/integration/fetch?days=7')).toBe(true);
    expect(isProtectedOrderIntegrationPath('/order/integration/shipments')).toBe(true);
    expect(isProtectedOrderIntegrationPath('/order/integration/coupang')).toBe(true);
  });

  it('builds login mode with a relative callbackUrl', () => {
    expect(buildAuthLoginRedirectPath('/order/integration/connect')).toBe(
      '/auth?mode=login&callbackUrl=%2Forder%2Fintegration%2Fconnect',
    );
    expect(requiresMiddlewareSession('/order/integration/connect')).toBe(true);
    expect(requiresMiddlewareSession('/order/integration')).toBe(false);
  });

  it('rejects external and protocol-relative callbackUrl values', () => {
    expect(buildAuthLoginRedirectPath('https://evil.example/path')).toBe('/auth?mode=login');
    expect(buildAuthLoginRedirectPath('//evil.example/path')).toBe('/auth?mode=login');
    expect(
      getPostLoginPath(new URLSearchParams('callbackUrl=https%3A%2F%2Fevil.example%2F')),
    ).toBe('/order-convert');
    expect(getPostLoginPath(new URLSearchParams('callbackUrl=%2F%2Fevil.example%2F'))).toBe(
      '/order-convert',
    );
  });
});
