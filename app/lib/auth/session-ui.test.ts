import { describe, expect, it } from 'vitest';
import { getNavAuthVisibility, shouldRenderAuthForm } from '@/app/lib/auth/session-ui';

describe('session-dependent auth UI', () => {
  it.each([
    ['loading', false],
    ['authenticated', false],
    ['unauthenticated', true],
  ] as const)('renders the auth form for %s sessions: %s', (status, expected) => {
    expect(shouldRenderAuthForm(status)).toBe(expected);
  });

  it('hides both navigation auth links while the session is loading', () => {
    expect(getNavAuthVisibility('loading')).toEqual({
      showLoginLink: false,
      showAccountLink: false,
    });
  });

  it('shows only the login link after an unauthenticated session is confirmed', () => {
    expect(getNavAuthVisibility('unauthenticated')).toEqual({
      showLoginLink: true,
      showAccountLink: false,
    });
  });

  it('shows only the account link for an authenticated session', () => {
    expect(getNavAuthVisibility('authenticated')).toEqual({
      showLoginLink: false,
      showAccountLink: true,
    });
  });
});
