import { describe, expect, it } from 'vitest';

import { summarizeOrderSyncTransmissionStatus } from '@/app/lib/order-integration/transmission/order-status-summary';

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

  it('SENT + SKIPPED → SENT; all SKIPPED → SKIPPED; all SENT → SENT', () => {
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'SKIPPED'])).toBe('SENT');
    expect(summarizeOrderSyncTransmissionStatus(['SKIPPED', 'SKIPPED'])).toBe('SKIPPED');
    expect(summarizeOrderSyncTransmissionStatus(['SENT', 'SENT'])).toBe('SENT');
  });

  it('all NONE → NONE', () => {
    expect(summarizeOrderSyncTransmissionStatus(['NONE'])).toBe('NONE');
  });
});
