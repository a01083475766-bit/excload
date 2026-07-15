const LEGACY_FEEDBACK_PATH = '/feedback-event';
const BETA_FEEDBACK_PATH = '/beta-feedback';

export function getBetaFeedbackRedirectPath(pathname: string): string | null {
  if (pathname === LEGACY_FEEDBACK_PATH) return BETA_FEEDBACK_PATH;
  if (!pathname.startsWith(`${LEGACY_FEEDBACK_PATH}/`)) return null;
  return `${BETA_FEEDBACK_PATH}${pathname.slice(LEGACY_FEEDBACK_PATH.length)}`;
}

export function getBetaFeedbackPostPath(postId: string): string {
  return `${BETA_FEEDBACK_PATH}/${encodeURIComponent(postId)}`;
}
