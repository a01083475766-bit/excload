import { describe, expect, it } from 'vitest';

import {
  evaluateShipmentTransmissionEligibility,
  resolveTransmissionCourier,
  resolveTransmissionTrackingNumber,
} from '@/app/lib/order-integration/transmission/eligibility';
import type {
  EvaluateShipmentTransmissionEligibilityInput,
  TransmissionEligibilityBatchInput,
  TransmissionEligibilityMatchInput,
  TransmissionEligibilityOrderInput,
} from '@/app/lib/order-integration/transmission/eligibility';

const BATCH: TransmissionEligibilityBatchInput = {
  id: 'batch-1',
  userId: 'user-a',
  status: 'READY',
  provider: 'COUPANG',
  integrationAccountId: 'acc-1',
};

const ORDER: TransmissionEligibilityOrderInput = {
  id: 'order-1',
  userId: 'user-a',
  provider: 'COUPANG',
  integrationAccountId: 'acc-1',
  mallOrderNo: 'MALL-1001',
  excloadOrderNo: 'EXC-20260710-000001',
  mallLineItemIds: ['PO-1', 'PO-2'],
};

function buildMatch(
  overrides: Partial<TransmissionEligibilityMatchInput> = {},
): TransmissionEligibilityMatchInput {
  return {
    id: 'match-1',
    userId: 'user-a',
    uploadBatchId: 'batch-1',
    orderSyncOrderId: 'order-1',
    provider: 'COUPANG',
    integrationAccountId: 'acc-1',
    userConfirmationStatus: 'CONFIRMED',
    transmissionStatus: 'NONE',
    finalTrackingNumber: null,
    finalCarrierCode: null,
    finalCarrierName: null,
    uploadRow: {
      trackingNumber: '012345678901',
      carrierCode: 'CJ',
      carrierName: 'CJ대한통운',
    },
    ...overrides,
  };
}

function evaluate(
  overrides: Partial<EvaluateShipmentTransmissionEligibilityInput> = {},
) {
  return evaluateShipmentTransmissionEligibility({
    batch: BATCH,
    match: buildMatch(),
    order: ORDER,
    ...overrides,
  });
}

describe('evaluateShipmentTransmissionEligibility', () => {
  it('allows CONFIRMED with complete data (NONE → READY candidate)', () => {
    const result = evaluate();
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.candidate.provider).toBe('COUPANG');
    expect(result.candidate.integrationAccountId).toBe('acc-1');
    expect(result.candidate.matchId).toBe('match-1');
    expect(result.candidate.orderSyncOrderId).toBe('order-1');
    expect(result.candidate.mallOrderNo).toBe('MALL-1001');
    expect(result.candidate.trackingNumber).toBe('012345678901');
    expect(result.candidate.courierCode).toBe('CJ');
    expect(result.candidate.mallLineItemIds).toEqual(['PO-1', 'PO-2']);
  });

  it('allows MANUALLY_LINKED', () => {
    const result = evaluate({
      match: buildMatch({ userConfirmationStatus: 'MANUALLY_LINKED' }),
    });
    expect(result.eligible).toBe(true);
  });

  it('allows EDITED', () => {
    const result = evaluate({
      match: buildMatch({ userConfirmationStatus: 'EDITED' }),
    });
    expect(result.eligible).toBe(true);
  });

  it('rejects EXCLUDED', () => {
    const result = evaluate({
      match: buildMatch({ userConfirmationStatus: 'EXCLUDED' }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('CONFIRMATION_NOT_ELIGIBLE');
  });

  it('rejects UNCONFIRMED', () => {
    const result = evaluate({
      match: buildMatch({ userConfirmationStatus: 'UNCONFIRMED' }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('CONFIRMATION_NOT_ELIGIBLE');
  });

  it('rejects batch not READY', () => {
    const result = evaluate({
      batch: { ...BATCH, status: 'MATCHED' },
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('BATCH_NOT_READY');
  });

  it('rejects missing orderSyncOrderId', () => {
    const result = evaluate({
      match: buildMatch({ orderSyncOrderId: null }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('ORDER_NOT_LINKED');
  });

  it('rejects missing order data', () => {
    const result = evaluate({ order: null });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('ORDER_NOT_FOUND');
  });

  it('rejects provider mismatch', () => {
    const result = evaluate({
      match: buildMatch({ provider: 'SMARTSTORE' }),
      order: { ...ORDER, provider: 'SMARTSTORE' },
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('PROVIDER_MISMATCH');
  });

  it('rejects integrationAccountId mismatch', () => {
    const result = evaluate({
      match: buildMatch({ integrationAccountId: 'acc-other' }),
      order: { ...ORDER, integrationAccountId: 'acc-other' },
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('INTEGRATION_ACCOUNT_MISMATCH');
  });

  it('rejects missing mallOrderNo', () => {
    const result = evaluate({
      order: { ...ORDER, mallOrderNo: '  ' },
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('MALL_ORDER_NO_MISSING');
  });

  it('rejects missing excloadOrderNo', () => {
    const result = evaluate({
      order: { ...ORDER, excloadOrderNo: '   ' },
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('EXCLOAD_ORDER_NO_MISSING');
  });

  it('rejects missing trackingNumber', () => {
    const result = evaluate({
      match: buildMatch({
        finalTrackingNumber: null,
        uploadRow: { trackingNumber: '', carrierCode: 'CJ', carrierName: 'CJ' },
      }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('TRACKING_NUMBER_MISSING');
  });

  it('rejects missing courier', () => {
    const result = evaluate({
      match: buildMatch({
        uploadRow: {
          trackingNumber: '123',
          carrierCode: null,
          carrierName: null,
        },
      }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('COURIER_MISSING');
  });

  it('rejects unsupported Coupang courier', () => {
    const result = evaluate({
      match: buildMatch({
        uploadRow: {
          trackingNumber: '012345678901',
          carrierCode: 'UNKNOWN',
          carrierName: '알수없는택배',
        },
      }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('COURIER_UNSUPPORTED');
  });

  it('allows supported Coupang courier via resolveProviderCourierCode', () => {
    const result = evaluate({
      match: buildMatch({
        uploadRow: {
          trackingNumber: '012345678901',
          carrierCode: 'LOTTE',
          carrierName: '롯데택배',
        },
      }),
    });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.candidate.courierCode).toBe('LOTTE');
  });

  it('re-validates courier after user edit via finalCarrier fields', () => {
    const unsupported = evaluate({
      match: buildMatch({
        finalCarrierCode: 'UNKNOWN',
        finalCarrierName: '미지원택배',
        uploadRow: {
          trackingNumber: '012345678901',
          carrierCode: 'CJ',
          carrierName: 'CJ대한통운',
        },
      }),
    });
    expect(unsupported.eligible).toBe(false);
    if (unsupported.eligible) return;
    expect(unsupported.reasonCode).toBe('COURIER_UNSUPPORTED');

    const supported = evaluate({
      match: buildMatch({
        finalCarrierCode: 'HANJIN',
        finalCarrierName: '한진택배',
        uploadRow: {
          trackingNumber: '012345678901',
          carrierCode: 'UNKNOWN',
          carrierName: '미지원택배',
        },
      }),
    });
    expect(supported.eligible).toBe(true);
  });

  it('does not apply Coupang courier validation to SMARTSTORE', () => {
    const result = evaluate({
      batch: { ...BATCH, provider: 'SMARTSTORE' },
      match: buildMatch({
        provider: 'SMARTSTORE',
        uploadRow: {
          trackingNumber: '012345678901',
          carrierCode: 'UNKNOWN',
          carrierName: '알수없는택배',
        },
      }),
      order: { ...ORDER, provider: 'SMARTSTORE' },
    });
    expect(result.eligible).toBe(true);
  });

  it('prefers finalTrackingNumber over upload row', () => {
    const result = evaluate({
      match: buildMatch({
        finalTrackingNumber: '999888777',
        uploadRow: {
          trackingNumber: '012345678901',
          carrierCode: 'CJ',
          carrierName: 'CJ대한통운',
        },
      }),
    });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.candidate.trackingNumber).toBe('999888777');
  });

  it('prefers finalCarrier over upload row', () => {
    const result = evaluate({
      match: buildMatch({
        finalCarrierCode: 'HANJIN',
        finalCarrierName: '한진택배',
        uploadRow: {
          trackingNumber: '012345678901',
          carrierCode: 'CJ',
          carrierName: 'CJ대한통운',
        },
      }),
    });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.candidate.courierCode).toBe('HANJIN');
    expect(result.candidate.courierName).toBe('한진택배');
  });

  it('falls back to upload row tracking and courier', () => {
    expect(
      resolveTransmissionTrackingNumber({
        finalTrackingNumber: null,
        uploadRow: { trackingNumber: '  fall-back  ' },
      }),
    ).toBe('fall-back');

    expect(
      resolveTransmissionCourier({
        finalCarrierCode: null,
        finalCarrierName: null,
        uploadRow: { carrierCode: 'LOGEN', carrierName: '로젠' },
      }),
    ).toEqual({ courierCode: 'LOGEN', courierName: '로젠' });
  });

  it('allows READY transmission status', () => {
    const result = evaluate({
      match: buildMatch({ transmissionStatus: 'READY' }),
    });
    expect(result.eligible).toBe(true);
  });

  it('blocks FAILED without retryFailed', () => {
    const result = evaluate({
      match: buildMatch({ transmissionStatus: 'FAILED' }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('RETRY_NOT_REQUESTED');
  });

  it('allows FAILED when retryFailed=true', () => {
    const result = evaluate({
      match: buildMatch({ transmissionStatus: 'FAILED' }),
      options: { retryFailed: true },
    });
    expect(result.eligible).toBe(true);
  });

  it('blocks PROCESSING and UNKNOWN without retry', () => {
    expect(
      evaluate({
        match: buildMatch({ transmissionStatus: 'PROCESSING' }),
      }).eligible,
    ).toBe(false);
    expect(
      evaluate({
        match: buildMatch({ transmissionStatus: 'UNKNOWN' }),
      }).eligible,
    ).toBe(false);
  });

  it('blocks SENT retransmission', () => {
    const result = evaluate({
      match: buildMatch({ transmissionStatus: 'SENT' }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('ALREADY_SENT');
  });

  it('blocks SKIPPED', () => {
    const result = evaluate({
      match: buildMatch({ transmissionStatus: 'SKIPPED' }),
    });
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasonCode).toBe('TRANSMISSION_SKIPPED');
  });

  it('candidate DTO has no PII or credential fields', () => {
    const result = evaluate();
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;

    const keys = Object.keys(result.candidate).sort();
    expect(keys).toEqual(
      [
        'courierCode',
        'courierName',
        'excloadOrderNo',
        'integrationAccountId',
        'mallLineItemIds',
        'mallOrderNo',
        'matchId',
        'orderSyncOrderId',
        'provider',
        'trackingNumber',
        'uploadBatchId',
      ].sort(),
    );

    const serialized = JSON.stringify(result.candidate);
    expect(serialized).not.toMatch(/receiver|phone|address|secret|credential|accessKey/i);
    expect(result.candidate).not.toHaveProperty('receiverName');
    expect(result.candidate).not.toHaveProperty('receiverPhone');
    expect(result.candidate).not.toHaveProperty('receiverAddress');
    expect(result.candidate).not.toHaveProperty('accessKey');
    expect(result.candidate).not.toHaveProperty('secretKey');
    expect(result.candidate).not.toHaveProperty('normalizedPayloadJson');
  });
});
