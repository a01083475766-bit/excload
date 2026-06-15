import { describe, expect, it } from 'vitest';
import {
  isTrackingNumberUploadHeader,
  sanitizeTrackingNumberForUpload,
} from '@/app/lib/sanitize-tracking-number-for-upload';

describe('sanitizeTrackingNumberForUpload', () => {
  it('removes hyphens and spaces', () => {
    expect(sanitizeTrackingNumberForUpload('1234-5678-9012')).toBe('123456789012');
    expect(sanitizeTrackingNumberForUpload(' 123 456 ')).toBe('123456');
    expect(sanitizeTrackingNumberForUpload('')).toBe('');
  });
});

describe('isTrackingNumberUploadHeader', () => {
  it('matches 송장번호·운송장번호', () => {
    expect(isTrackingNumberUploadHeader('송장번호')).toBe(true);
    expect(isTrackingNumberUploadHeader('운송장번호')).toBe(true);
    expect(isTrackingNumberUploadHeader('상품주문번호')).toBe(false);
  });
});
