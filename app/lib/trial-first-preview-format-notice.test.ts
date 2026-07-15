import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  hasTrialFirstPreviewFormatNoticeBeenShown,
  markTrialFirstPreviewFormatNoticeShown,
} from './trial-first-preview-format-notice';

describe('trial-first-preview-format-notice', () => {
  beforeEach(() => {
    const storage = {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return storage.store[key] ?? null;
      },
      setItem(key: string, value: string) {
        storage.store[key] = value;
      },
      removeItem(key: string) {
        delete storage.store[key];
      },
      clear() {
        storage.store = {};
      },
    };
    vi.stubGlobal('sessionStorage', storage);
  });

  it('scope별로 세션 표시 여부를 기록한다', () => {
    expect(hasTrialFirstPreviewFormatNoticeBeenShown('logistics')).toBe(false);
    markTrialFirstPreviewFormatNoticeShown('logistics');
    expect(hasTrialFirstPreviewFormatNoticeBeenShown('logistics')).toBe(true);
    expect(hasTrialFirstPreviewFormatNoticeBeenShown('courier')).toBe(false);
  });
});
