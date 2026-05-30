import { describe, it, expect } from 'vitest';
import {
  Normalize29Error,
  resolveNormalizeQualityNotice,
} from '@/app/lib/normalize-29/normalize29-error';

describe('resolveNormalizeQualityNotice', () => {
  const isNetwork = (error: unknown) =>
    error instanceof Error && /failed to fetch/i.test(error.message);

  it('maps AI_TIMEOUT to timeout', () => {
    expect(
      resolveNormalizeQualityNotice(
        new Normalize29Error('AI_TIMEOUT', 'timeout'),
        isNetwork,
      ),
    ).toBe('timeout');
  });

  it('maps parse/empty failures to convert_failed', () => {
    expect(
      resolveNormalizeQualityNotice(
        new Normalize29Error('AI_PARSE_FAILED', 'parse'),
        isNetwork,
      ),
    ).toBe('convert_failed');
    expect(
      resolveNormalizeQualityNotice(
        new Normalize29Error('AI_EMPTY_ORDERS', 'empty'),
        isNetwork,
      ),
    ).toBe('convert_failed');
  });

  it('maps client network errors', () => {
    expect(
      resolveNormalizeQualityNotice(new Error('Failed to fetch'), isNetwork),
    ).toBe('network');
  });
});
