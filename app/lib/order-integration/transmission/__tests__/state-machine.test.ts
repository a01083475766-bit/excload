import { describe, expect, it } from 'vitest';

import {
  evaluateShipmentTransmissionTransition,
  isShipmentTransmissionTransitionAllowed,
} from '@/app/lib/order-integration/transmission/state-machine';
import type { ShipmentMatchTransmissionStatus } from '@/app/lib/order-integration/transmission/types';

const ALL: ShipmentMatchTransmissionStatus[] = [
  'NONE',
  'READY',
  'SENT',
  'FAILED',
  'SKIPPED',
];

describe('evaluateShipmentTransmissionTransition', () => {
  it('allows NONE → READY', () => {
    const result = evaluateShipmentTransmissionTransition('NONE', 'READY');
    expect(result.ok).toBe(true);
  });

  it('allows READY → SENT', () => {
    expect(evaluateShipmentTransmissionTransition('READY', 'SENT').ok).toBe(true);
  });

  it('allows READY → FAILED', () => {
    expect(evaluateShipmentTransmissionTransition('READY', 'FAILED').ok).toBe(true);
  });

  it('allows FAILED → READY only with retryRequested', () => {
    expect(evaluateShipmentTransmissionTransition('FAILED', 'READY').ok).toBe(false);
    expect(
      evaluateShipmentTransmissionTransition('FAILED', 'READY', {
        retryRequested: true,
      }).ok,
    ).toBe(true);
  });

  it('allows READY → SKIPPED only with policySkip', () => {
    expect(evaluateShipmentTransmissionTransition('READY', 'SKIPPED').ok).toBe(false);
    expect(
      evaluateShipmentTransmissionTransition('READY', 'SKIPPED', {
        policySkip: true,
      }).ok,
    ).toBe(true);
  });

  it('blocks all forbidden transitions from SENT', () => {
    for (const to of ALL) {
      if (to === 'SENT') {
        expect(evaluateShipmentTransmissionTransition('SENT', 'SENT').ok).toBe(false);
        continue;
      }
      const result = evaluateShipmentTransmissionTransition('SENT', to);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reasonCode).toBe('TRANSITION_NOT_ALLOWED');
    }
  });

  it('blocks SKIPPED → READY and other exits', () => {
    for (const to of ALL.filter((s) => s !== 'SKIPPED')) {
      expect(evaluateShipmentTransmissionTransition('SKIPPED', to).ok).toBe(false);
    }
  });

  it('blocks NONE → SENT and NONE → FAILED', () => {
    expect(evaluateShipmentTransmissionTransition('NONE', 'SENT').ok).toBe(false);
    expect(evaluateShipmentTransmissionTransition('NONE', 'FAILED').ok).toBe(false);
  });

  it('blocks SENT → SENT re-run', () => {
    const result = evaluateShipmentTransmissionTransition('SENT', 'SENT');
    expect(result.ok).toBe(false);
  });

  it('isShipmentTransmissionTransitionAllowed mirrors evaluate', () => {
    expect(isShipmentTransmissionTransitionAllowed('NONE', 'READY')).toBe(true);
    expect(isShipmentTransmissionTransitionAllowed('SENT', 'READY')).toBe(false);
  });

  it('enumerates denied matrix for documentation safety', () => {
    const allowed = new Set([
      'NONE>READY',
      'READY>SENT',
      'READY>FAILED',
      'READY>SKIPPED@policy',
      'FAILED>READY@retry',
    ]);

    for (const from of ALL) {
      for (const to of ALL) {
        const key = `${from}>${to}`;
        if (from === to) {
          expect(evaluateShipmentTransmissionTransition(from, to).ok).toBe(false);
          continue;
        }
        if (allowed.has(key)) {
          expect(evaluateShipmentTransmissionTransition(from, to).ok).toBe(true);
          continue;
        }
        if (key === 'READY>SKIPPED') {
          expect(evaluateShipmentTransmissionTransition(from, to).ok).toBe(false);
          expect(
            evaluateShipmentTransmissionTransition(from, to, { policySkip: true }).ok,
          ).toBe(true);
          continue;
        }
        if (key === 'FAILED>READY') {
          expect(evaluateShipmentTransmissionTransition(from, to).ok).toBe(false);
          expect(
            evaluateShipmentTransmissionTransition(from, to, {
              retryRequested: true,
            }).ok,
          ).toBe(true);
          continue;
        }
        expect(
          evaluateShipmentTransmissionTransition(from, to).ok,
          `${key} should be denied`,
        ).toBe(false);
      }
    }
  });
});
