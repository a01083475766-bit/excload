import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  hasTrialFirstPreviewFormatNoticeBeenShown,
  markTrialFirstPreviewFormatNoticeShown,
} from './trial-first-preview-format-notice';

describe('trial-first-preview-format-notice', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null;
      },
      setItem(key: string, value: string) {
        this.store[key] = value;
      },
      removeItem(key: string) {
        delete this.store[key];
      },
      clear() {
        this.store = {};
      },
    });
  });

  it('scope별로 세션 표시 여부를 기록한다', () => {
    expect(hasTrialFirstPreviewFormatNoticeBeenShown('logistics')).toBe(false);
    markTrialFirstPreviewFormatNoticeShown('logistics');
    expect(hasTrialFirstPreviewFormatNoticeBeenShown('logistics')).toBe(true);
    expect(hasTrialFirstPreviewFormatNoticeBeenShown('courier')).toBe(false);
  });
});
