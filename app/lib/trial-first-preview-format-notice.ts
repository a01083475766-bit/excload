export type TrialFirstPreviewFormatNoticeScope = 'courier' | 'logistics';

const STORAGE_KEY_PREFIX = 'trial_first_preview_format_notice_shown_v1';

function storageKey(scope: TrialFirstPreviewFormatNoticeScope): string {
  return `${STORAGE_KEY_PREFIX}:${scope}`;
}

export function hasTrialFirstPreviewFormatNoticeBeenShown(
  scope: TrialFirstPreviewFormatNoticeScope,
): boolean {
  if (typeof sessionStorage === 'undefined') return true;
  return sessionStorage.getItem(storageKey(scope)) === '1';
}

export function markTrialFirstPreviewFormatNoticeShown(
  scope: TrialFirstPreviewFormatNoticeScope,
): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(storageKey(scope), '1');
}
