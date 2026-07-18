export type SessionUiStatus = 'authenticated' | 'loading' | 'unauthenticated';

export function shouldRenderAuthForm(status: SessionUiStatus): boolean {
  return status === 'unauthenticated';
}

export function getNavAuthVisibility(
  status: SessionUiStatus,
): { showLoginLink: boolean; showAccountLink: boolean } {
  return {
    showLoginLink: status === 'unauthenticated',
    showAccountLink: status === 'authenticated',
  };
}
