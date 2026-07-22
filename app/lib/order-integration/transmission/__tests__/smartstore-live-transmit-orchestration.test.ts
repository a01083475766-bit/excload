import { describe, expect, it, vi } from 'vitest';

import type { SmartstoreLiveTransmitConfirmOrderInput } from '@/app/lib/order-integration/transmission/smartstore-live-transmit-confirm';
import {
  createSmartstoreLiveTransmitOrchestrator,
  runMockTransmitOnce,
} from '@/app/lib/order-integration/transmission/smartstore-live-transmit-orchestration';

function order(
  overrides: Partial<SmartstoreLiveTransmitConfirmOrderInput> = {},
): SmartstoreLiveTransmitConfirmOrderInput {
  return {
    matchId: 'match-1',
    provider: 'SMARTSTORE',
    mallOrderNo: '20260722-ORDER-123456',
    carrierName: 'CJ대한통운',
    carrierCode: 'CJGLS',
    trackingNumberMasked: '1234****9012',
    hasTrackingNumber: true,
    transmissionStatus: 'NONE',
    matchStatus: 'MATCHED_CONFIDENT',
    remainQuantity: 1,
    ...overrides,
  };
}

describe('SMARTSTORE-C2c live transmit orchestration', () => {
  it('does not call transmit on first real click; calls once after final confirm', async () => {
    const transmitReal = vi.fn(async () => undefined);
    const orch = createSmartstoreLiveTransmitOrchestrator({ transmitReal });

    const first = orch.onRealButtonClick({
      selectedOrders: [order()],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
    });
    expect(first.openedConfirm).toBe(true);
    expect(transmitReal).toHaveBeenCalledTimes(0);
    expect(orch.getConfirmView()?.canConfirmFinal).toBe(true);

    orch.onCancelConfirm();
    expect(orch.getConfirmView()).toBeNull();
    expect(transmitReal).toHaveBeenCalledTimes(0);

    orch.onRealButtonClick({
      selectedOrders: [order()],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
    });
    const once = await orch.onFinalConfirm();
    expect(once.executed).toBe(true);
    expect(transmitReal).toHaveBeenCalledTimes(1);

    const twice = await orch.onFinalConfirm();
    expect(twice.executed).toBe(false);
    expect(transmitReal).toHaveBeenCalledTimes(1);
  });

  it('blocks rapid final confirms while busy and disables cancel during flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transmitReal = vi.fn(async () => {
      await gate;
    });
    const orch = createSmartstoreLiveTransmitOrchestrator({ transmitReal });
    orch.onRealButtonClick({
      selectedOrders: [order()],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
    });

    const p1 = orch.onFinalConfirm();
    const p2 = orch.onFinalConfirm();
    orch.onCancelConfirm();
    expect(orch.getConfirmView()).not.toBeNull();

    release();
    await Promise.all([p1, p2]);
    expect(transmitReal).toHaveBeenCalledTimes(1);
  });

  it('blocks mixed provider selection without live transmit', async () => {
    const transmitReal = vi.fn(async () => undefined);
    const orch = createSmartstoreLiveTransmitOrchestrator({ transmitReal });
    const result = orch.onRealButtonClick({
      selectedOrders: [order(), order({ matchId: 'c1', provider: 'COUPANG' })],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
    });
    expect(result.openedConfirm).toBe(false);
    expect(result.message).toMatch(/쇼핑몰별로/);
    expect(transmitReal).toHaveBeenCalledTimes(0);
  });

  it('Mock path never opens live confirm or calls live transmit', async () => {
    const transmitReal = vi.fn(async () => undefined);
    const transmitMock = vi.fn(async () => undefined);
    const orch = createSmartstoreLiveTransmitOrchestrator({ transmitReal, transmitMock });
    expect(orch.getConfirmView()).toBeNull();
    const mock = await runMockTransmitOnce({ isBusy: false, transmitMock });
    expect(mock.executed).toBe(true);
    expect(transmitMock).toHaveBeenCalledTimes(1);
    expect(transmitReal).toHaveBeenCalledTimes(0);
  });

  it('does not auto-retry after UNKNOWN outcome', async () => {
    const transmitReal = vi.fn(async () => {
      /* UNKNOWN result handled by caller — orchestrator does not retry */
    });
    const orch = createSmartstoreLiveTransmitOrchestrator({ transmitReal });
    orch.onRealButtonClick({
      selectedOrders: [order()],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
    });
    await orch.onFinalConfirm();
    expect(transmitReal).toHaveBeenCalledTimes(1);
  });
});
