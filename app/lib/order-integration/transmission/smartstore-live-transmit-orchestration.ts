/**
 * SMARTSTORE 실제 전송 버튼 ↔ 확인창 ↔ transmit 콜백 연결.
 * DOM 없이 호출 횟수·차단을 검증할 수 있다.
 */

import {
  decideRealTransmitClick,
  shouldExecuteLiveTransmitAfterConfirm,
  type SmartstoreLiveTransmitConfirmOrderInput,
  type SmartstoreLiveTransmitConfirmView,
} from '@/app/lib/order-integration/transmission/smartstore-live-transmit-confirm';

export type SmartstoreLiveTransmitOrchestratorInput = {
  selectedOrders: SmartstoreLiveTransmitConfirmOrderInput[];
  batchProvider: string | null;
  integrationAccountId: string | null;
  accountDisplayName?: string | null;
};

export type SmartstoreLiveTransmitOrchestrator = {
  /** 실제 전송 버튼 첫 클릭 */
  onRealButtonClick: (input: SmartstoreLiveTransmitOrchestratorInput) => {
    openedConfirm: boolean;
    message: string | null;
  };
  onCancelConfirm: () => void;
  /** 최종 승인. transmitReal은 live POST만 담당 */
  onFinalConfirm: () => Promise<{ executed: boolean }>;
  getConfirmView: () => SmartstoreLiveTransmitConfirmView | null;
  isBusy: () => boolean;
};

export function createSmartstoreLiveTransmitOrchestrator(deps: {
  transmitReal: () => Promise<void>;
  /** Mock 경로 — live confirm/transmit과 분리 */
  transmitMock?: () => Promise<void>;
}): SmartstoreLiveTransmitOrchestrator {
  let confirmView: SmartstoreLiveTransmitConfirmView | null = null;
  let busy = false;
  let inFlight = false;

  return {
    onRealButtonClick(input) {
      if (busy || inFlight) {
        return { openedConfirm: false, message: null };
      }
      const decision = decideRealTransmitClick({
        selectedOrders: input.selectedOrders,
        batchProvider: input.batchProvider,
        integrationAccountId: input.integrationAccountId,
        accountDisplayName: input.accountDisplayName ?? null,
        isMockMode: false,
      });
      if (decision.action === 'noop') {
        confirmView = null;
        return { openedConfirm: false, message: decision.reason };
      }
      if (decision.action === 'transmit-direct') {
        confirmView = null;
        // 직접 전송은 호출자가 transmitReal을 await하도록 동기 플래그만 반환하지 않고
        // 여기서 실행하면 테스트에서 횟수 검증이 쉬움
        void (async () => {
          if (busy || inFlight) return;
          inFlight = true;
          busy = true;
          try {
            await deps.transmitReal();
          } finally {
            inFlight = false;
            busy = false;
          }
        })();
        return { openedConfirm: false, message: null };
      }
      confirmView = decision.view;
      return { openedConfirm: true, message: null };
    },

    onCancelConfirm() {
      if (busy || inFlight) return;
      confirmView = null;
    },

    async onFinalConfirm() {
      if (!confirmView) return { executed: false };
      if (
        !shouldExecuteLiveTransmitAfterConfirm({
          canConfirmFinal: confirmView.canConfirmFinal,
          isMockMode: false,
          isTransmitting: busy || inFlight,
        })
      ) {
        return { executed: false };
      }
      inFlight = true;
      busy = true;
      try {
        await deps.transmitReal();
        confirmView = null;
        return { executed: true };
      } finally {
        inFlight = false;
        busy = false;
      }
    },

    getConfirmView() {
      return confirmView;
    },

    isBusy() {
      return busy || inFlight;
    },
  };
}

/**
 * Mock 테스트 전송 — live confirm/orchestrator를 거치지 않음.
 */
export async function runMockTransmitOnce(input: {
  isBusy: boolean;
  transmitMock: () => Promise<void>;
}): Promise<{ executed: boolean }> {
  if (input.isBusy) return { executed: false };
  await input.transmitMock();
  return { executed: true };
}
