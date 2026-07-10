import type {
  ShipmentMatchTransmissionStatus,
  ShipmentTransmissionTransitionOptions,
  ShipmentTransmissionTransitionResult,
} from '@/app/lib/order-integration/transmission/types';

function deny(
  from: ShipmentMatchTransmissionStatus,
  to: ShipmentMatchTransmissionStatus,
  reasonCode: 'TRANSITION_NOT_ALLOWED' | 'RETRY_NOT_REQUESTED' | 'POLICY_SKIP_NOT_REQUESTED',
  reasonMessage: string,
): ShipmentTransmissionTransitionResult {
  return {
    ok: false,
    from,
    to,
    reasonCode,
    reasonMessage,
  };
}

function allow(
  from: ShipmentMatchTransmissionStatus,
  to: ShipmentMatchTransmissionStatus,
): ShipmentTransmissionTransitionResult {
  return {
    ok: true,
    from,
    to,
    reasonCode: null,
    reasonMessage: null,
  };
}

/**
 * ShipmentMatch.transmissionStatus 전이 규칙 (순수 함수).
 * OrderSyncOrder.transmissionStatus 전이는 별도 동기화 단계에서 다룸.
 */
export function evaluateShipmentTransmissionTransition(
  from: ShipmentMatchTransmissionStatus,
  to: ShipmentMatchTransmissionStatus,
  options: ShipmentTransmissionTransitionOptions = {},
): ShipmentTransmissionTransitionResult {
  if (from === to) {
    return deny(
      from,
      to,
      'TRANSITION_NOT_ALLOWED',
      `동일 상태(${from})로의 전이는 허용되지 않습니다.`,
    );
  }

  if (from === 'SENT') {
    return deny(
      from,
      to,
      'TRANSITION_NOT_ALLOWED',
      'SENT 상태에서는 더 이상 상태를 변경할 수 없습니다.',
    );
  }

  if (from === 'SKIPPED') {
    return deny(
      from,
      to,
      'TRANSITION_NOT_ALLOWED',
      'SKIPPED 상태에서는 READY로 되돌릴 수 없습니다.',
    );
  }

  if (from === 'NONE') {
    if (to === 'READY') return allow(from, to);
    return deny(
      from,
      to,
      'TRANSITION_NOT_ALLOWED',
      'NONE에서는 READY로만 승격할 수 있습니다.',
    );
  }

  if (from === 'READY') {
    if (to === 'SENT' || to === 'FAILED') return allow(from, to);
    if (to === 'SKIPPED') {
      if (options.policySkip === true) return allow(from, to);
      return deny(
        from,
        to,
        'POLICY_SKIP_NOT_REQUESTED',
        'READY → SKIPPED 는 policySkip 옵션이 있을 때만 허용됩니다.',
      );
    }
    return deny(
      from,
      to,
      'TRANSITION_NOT_ALLOWED',
      'READY에서는 SENT, FAILED, 또는 정책 SKIPPED만 허용됩니다.',
    );
  }

  if (from === 'FAILED') {
    if (to === 'READY') {
      if (options.retryRequested === true) return allow(from, to);
      return deny(
        from,
        to,
        'RETRY_NOT_REQUESTED',
        'FAILED → READY 는 retryRequested 옵션이 있을 때만 허용됩니다.',
      );
    }
    return deny(
      from,
      to,
      'TRANSITION_NOT_ALLOWED',
      'FAILED에서는 재시도 시 READY로만 돌아갈 수 있습니다.',
    );
  }

  return deny(
    from,
    to,
    'TRANSITION_NOT_ALLOWED',
    `허용되지 않는 전이: ${from} → ${to}`,
  );
}

export function isShipmentTransmissionTransitionAllowed(
  from: ShipmentMatchTransmissionStatus,
  to: ShipmentMatchTransmissionStatus,
  options?: ShipmentTransmissionTransitionOptions,
): boolean {
  return evaluateShipmentTransmissionTransition(from, to, options).ok;
}
