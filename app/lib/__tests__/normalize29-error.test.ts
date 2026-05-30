import { describe, it, expect } from 'vitest';
import {
  Normalize29Error,
  resolveNormalizeQualityNotice,
} from '@/app/lib/normalize-29/normalize29-error';

describe('resolveNormalizeQualityNotice', () => {
  const isNetwork = (error: unknown) =>
    error instanceof Error && /failed to fetch/i.test(error.message);

  it('maps AI_UNAVAILABLE and AI_API_ERROR to network', () => {
    expect(
      resolveNormalizeQualityNotice(
        new Normalize29Error('AI_UNAVAILABLE', 'unavailable'),
        isNetwork,
      ),
    ).toBe('network');
    expect(
      resolveNormalizeQualityNotice(
        new Normalize29Error('AI_API_ERROR', 'api'),
        isNetwork,
      ),
    ).toBe('network');
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
