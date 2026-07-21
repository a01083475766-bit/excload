import { describe, expect, it } from 'vitest';

import {
  isOrderFullyTransmittedForPiiClear,
  summarizeOrderSyncTransmissionStatus,
} from '@/app/lib/order-integration/transmission/order-status-summary';

describe('summarizeOrderSyncTransmissionStatus', () => {
  it('returns NONE for empty', () => {
    expect(summarizeOrderSyncTransmissionStatus([])).toBe('NONE');
  });

  it('prioritizes UNKNOWN then PROCESSING then FAILED then READY', () => {
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'PROCESSING'])).toBe('PROCESSING');
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'FAILED'])).toBe('FAILED');
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'READY'])).toBe('READY');
  });

  it('treats partial SENT+NONE as incomplete', () => {
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'NONE'])).toBe('NONE');
  });

  it('SENT + SKIPPED → SENT; all SKIPPED → SKIPPED; all SENT → SENT', () => {
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'SKIPPED'])).toBe('SENT');
    expect(summarizeOrderSyncTransmissionStatus(['SKIPPED', 'SKIPPED'])).toBe('SKIPPED');
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'SENT'])).toBe('SENT');
  });

  it('all NONE → NONE', () => {
    expect(summarizeOrderSyncTransmissionStatus(['NONE'])).toBe('NONE');
  });
});

describe('isOrderFullyTransmittedForPiiClear', () => {
  it('requires every match SENT or SKIPPED', () => {
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'SKIPPED'])).toBe(true);
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'NONE'])).toBe(false);
    expect(isOrderFullyTransmittedForPiiClear([])).toBe(false);
  });

  it('treats empty matches as incomplete (never clear PII)', () => {
    expect(isOrderFullyTransmittedForPiiClear([])).toBe(false);
  });

  it('rejects when any of multiple batch matches is NONE', () => {
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'SENT', 'NONE'])).toBe(false);
    expect(isOrderFullyTransmittedForPiiClear(['SKIPPED', 'NONE'])).toBe(false);
  });
});
