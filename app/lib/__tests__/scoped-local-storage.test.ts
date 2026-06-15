import { describe, expect, it } from 'vitest';
import { storageKeyForUser } from '@/app/lib/scoped-local-storage';

describe('storageKeyForUser', () => {
  it('계정별로 서로 다른 localStorage 키를 만든다', () => {
    const baseKey = 'onc_courier_template_v1';
    const keyA = storageKeyForUser(baseKey, 'user-a');
    const keyB = storageKeyForUser(baseKey, 'user-b');

    expect(keyA).toBe(`${baseKey}:user-a`);
    expect(keyB).toBe(`${baseKey}:user-b`);
    expect(keyA).not.toBe(keyB);
  });

  it('비로그인(게스트)은 레거시 baseKey를 그대로 쓴다', () => {
    const baseKey = 'onc_courier_template_v1';
    expect(storageKeyForUser(baseKey, null)).toBe(baseKey);
    expect(storageKeyForUser(baseKey, undefined)).toBe(baseKey);
  });
});
