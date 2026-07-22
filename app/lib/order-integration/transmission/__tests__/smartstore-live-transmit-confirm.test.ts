import { describe, expect, it } from 'vitest';

import type { SmartstoreLiveTransmitConfirmOrderInput } from '@/app/lib/order-integration/transmission/smartstore-live-transmit-confirm';
import {
  LIVE_TRANSMIT_BUTTON_LABEL,
  LIVE_TRANSMIT_FINAL_CONFIRM_LABEL,
  LIVE_TRANSMIT_IN_PROGRESS_LABEL,
  MIXED_PROVIDER_TRANSMIT_BLOCK_MESSAGE,
  MOCK_TRANSMIT_BUTTON_LABEL,
  SMARTSTORE_LIVE_TRANSMIT_CONFIRM_FORBIDDEN_DISPLAY_KEYS,
  buildSmartstoreLiveTransmitConfirmView,
  decideRealTransmitClick,
  maskIntegrationAccountIdForConfirm,
  maskMallOrderNoForConfirm,
  resolveRemainQuantityUiStatus,
  shouldExecuteLiveTransmitAfterConfirm,
} from '@/app/lib/order-integration/transmission/smartstore-live-transmit-confirm';

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

describe('SMARTSTORE-C2b/C2c live transmit confirm', () => {
  it('distinguishes Mock and live button labels', () => {
    expect(MOCK_TRANSMIT_BUTTON_LABEL).toMatch(/Mock|테스트/);
    expect(LIVE_TRANSMIT_BUTTON_LABEL).toContain('실제 전송');
    expect(LIVE_TRANSMIT_FINAL_CONFIRM_LABEL).toContain('실제 전송');
    expect(LIVE_TRANSMIT_BUTTON_LABEL).not.toEqual(MOCK_TRANSMIT_BUTTON_LABEL);
    expect(LIVE_TRANSMIT_IN_PROGRESS_LABEL).toBe('전송 중…');
  });

  it('first real click for SMARTSTORE opens confirm and does not mean transmit', () => {
    const decision = decideRealTransmitClick({
      selectedOrders: [order()],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
    });
    expect(decision.action).toBe('open-confirm');
    if (decision.action === 'open-confirm') {
      expect(decision.view.canConfirmFinal).toBe(true);
    }
  });

  it('final confirm executes only when canConfirmFinal and not transmitting', () => {
    expect(
      shouldExecuteLiveTransmitAfterConfirm({
        canConfirmFinal: true,
        isMockMode: false,
        isTransmitting: false,
      }),
    ).toBe(true);

    let calls = 0;
    const runOnce = () => {
      if (
        !shouldExecuteLiveTransmitAfterConfirm({
          canConfirmFinal: true,
          isMockMode: false,
          isTransmitting: calls > 0,
        })
      ) {
        return;
      }
      calls += 1;
    };
    runOnce();
    runOnce();
    runOnce();
    expect(calls).toBe(1);
  });

  it('Mock mode does not open live confirm and does not execute live transmit', () => {
    const decision = decideRealTransmitClick({
      selectedOrders: [order()],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
      isMockMode: true,
    });
    expect(decision.action).toBe('noop');
    expect(
      shouldExecuteLiveTransmitAfterConfirm({
        canConfirmFinal: true,
        isMockMode: true,
        isTransmitting: false,
      }),
    ).toBe(false);
  });

  it('blocks final transmit without integrationAccountId', () => {
    const view = buildSmartstoreLiveTransmitConfirmView({
      batchProvider: 'SMARTSTORE',
      integrationAccountId: null,
      accountDisplayName: null,
      orders: [order()],
      isMockMode: false,
    });
    expect(view.canConfirmFinal).toBe(false);
    expect(view.blockReasons.some((r) => /integrationAccountId/.test(r))).toBe(true);
  });

  it('allows remainQuantity=1 with snapshot wording', () => {
    const view = buildSmartstoreLiveTransmitConfirmView({
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
      accountDisplayName: null,
      orders: [order({ remainQuantity: 1 })],
      isMockMode: false,
    });
    expect(view.canConfirmFinal).toBe(true);
    expect(view.orders[0]?.remainQuantity.label).toBe('주문조회·저장 기준 남은 발송 수량: 1');
  });

  it('blocks remainQuantity=0', () => {
    expect(resolveRemainQuantityUiStatus(0).kind).toBe('zero');
    const view = buildSmartstoreLiveTransmitConfirmView({
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
      accountDisplayName: null,
      orders: [order({ remainQuantity: 0 })],
      isMockMode: false,
    });
    expect(view.canConfirmFinal).toBe(false);
  });

  it('blocks remainQuantity=null without estimating 1', () => {
    expect(resolveRemainQuantityUiStatus(null).kind).toBe('unclear');
    const view = buildSmartstoreLiveTransmitConfirmView({
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
      accountDisplayName: null,
      orders: [order({ remainQuantity: null })],
      isMockMode: false,
    });
    expect(view.canConfirmFinal).toBe(false);
  });

  it('blocks when hasTrackingNumber=false', () => {
    const view = buildSmartstoreLiveTransmitConfirmView({
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
      accountDisplayName: null,
      orders: [order({ hasTrackingNumber: false, trackingNumberMasked: null })],
      isMockMode: false,
    });
    expect(view.canConfirmFinal).toBe(false);
  });

  it('blocks SENT and duplicate/conflict matches', () => {
    expect(
      buildSmartstoreLiveTransmitConfirmView({
        batchProvider: 'SMARTSTORE',
        integrationAccountId: 'acc-1234567890',
        accountDisplayName: null,
        orders: [order({ transmissionStatus: 'SENT' })],
        isMockMode: false,
      }).canConfirmFinal,
    ).toBe(false);
    expect(
      buildSmartstoreLiveTransmitConfirmView({
        batchProvider: 'SMARTSTORE',
        integrationAccountId: 'acc-1234567890',
        accountDisplayName: null,
        orders: [order({ matchStatus: 'DUPLICATE_TRACKING_NUMBER' })],
        isMockMode: false,
      }).orders[0]?.duplicatePrecheck.label,
    ).toMatch(/화면 기준 사전 확인/);
  });

  it('masks order/account without exposing full original for short and long values', () => {
    for (const original of ['A', 'AB', 'ABC', 'ABCD', 'ABCDE', 'ABCDEF', 'ABCDEFG', 'ABCDEFGH']) {
      const masked = maskMallOrderNoForConfirm(original);
      expect(masked).not.toBe(original);
      expect(masked.includes(original)).toBe(false);
      expect(masked.startsWith(`····${original}`)).toBe(false);
    }

    const longA = maskMallOrderNoForConfirm('20260722-ORDER-123456');
    const longB = maskMallOrderNoForConfirm('20260722-ORDER-999999');
    expect(longA).not.toBe('20260722-ORDER-123456');
    expect(longA.includes('20260722-ORDER-123456')).toBe(false);
    expect(longA).not.toEqual(longB);
    expect(longA.slice(-4)).toBe('3456');
    expect(longB.slice(-4)).toBe('9999');

    expect(maskMallOrderNoForConfirm(null)).toBe('확인 불가');
    expect(maskMallOrderNoForConfirm('')).toBe('확인 불가');

    for (const original of ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'abcdefgh']) {
      const masked = maskIntegrationAccountIdForConfirm(original);
      expect(masked).not.toBe(original);
      expect(masked.includes(original)).toBe(false);
    }
    const account = maskIntegrationAccountIdForConfirm('acc-abcdef123456');
    expect(account).toBe('acc-····3456');
    expect(account.includes('acc-abcdef123456')).toBe(false);
    expect(maskIntegrationAccountIdForConfirm(null)).toBe('확인 불가');
  });

  it('does not include PII, secrets, tokens, or raw response fields in confirm view', () => {
    const view = buildSmartstoreLiveTransmitConfirmView({
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
      accountDisplayName: '내스토어',
      orders: [order()],
      isMockMode: false,
    });
    const serialized = JSON.stringify(view);
    for (const key of SMARTSTORE_LIVE_TRANSMIT_CONFIRM_FORBIDDEN_DISPLAY_KEYS) {
      expect(serialized).not.toContain(key);
    }
    expect(serialized).not.toMatch(/Bearer /i);
    expect(serialized).not.toContain('홍길동');
    expect(serialized).not.toContain('010-');
    expect(view.serverRecheckNotice).toMatch(/서버가 전송 직전 다시 검사/);
  });

  it('keeps COUPANG on direct transmit and blocks mixed providers', () => {
    expect(
      decideRealTransmitClick({
        selectedOrders: [order({ provider: 'COUPANG', matchId: 'c-1' })],
        batchProvider: 'COUPANG',
        integrationAccountId: 'acc-coupang',
      }).action,
    ).toBe('transmit-direct');

    const mixed = decideRealTransmitClick({
      selectedOrders: [order(), order({ matchId: 'c-1', provider: 'COUPANG' })],
      batchProvider: 'SMARTSTORE',
      integrationAccountId: 'acc-1234567890',
    });
    expect(mixed.action).toBe('noop');
    if (mixed.action === 'noop') {
      expect(mixed.reason).toBe(MIXED_PROVIDER_TRANSMIT_BLOCK_MESSAGE);
    }
  });
});
