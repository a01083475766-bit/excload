const LEGACY_FEEDBACK_PATHS = ['/feedback-event', '/beta-feedback'] as const;
export const FEEDBACK_BOARD_PATH = '/feedback';

export function isFeedbackBoardPath(pathname: string): boolean {
  return pathname === FEEDBACK_BOARD_PATH || pathname.startsWith(`${FEEDBACK_BOARD_PATH}/`);
}

export function getBetaFeedbackRedirectPath(pathname: string): string | null {
  for (const legacyPath of LEGACY_FEEDBACK_PATHS) {
    if (pathname === legacyPath) return FEEDBACK_BOARD_PATH;
    if (pathname.startsWith(`${legacyPath}/`)) {
      return `${FEEDBACK_BOARD_PATH}${pathname.slice(legacyPath.length)}`;
    }
  }
  return null;
}

export function getBetaFeedbackPostPath(postId: string): string {
  return `${FEEDBACK_BOARD_PATH}/${encodeURIComponent(postId)}`;
}
