/**
 * 토스 /api/toss/charge 응답 이후 클라이언트 처리 (구독 페이지·테스트 공용)
 */

export type TossChargeClientResult =
  | { kind: 'success' }
  | { kind: 'billing_missing' }
  | { kind: 'already_subscribed'; message: string }
  | { kind: 'plan_change_available'; message: string }
  | { kind: 'error'; message: string };

export async function runAfterTossChargeResponse(
  res: Pick<Response, 'ok'>,
  data: { error?: string; code?: string },
  deps: {
    fetchUser: () => Promise<void>;
    onSuccessNavigate: () => void;
  }
): Promise<TossChargeClientResult> {
  if (!res.ok) {
    if (data?.error === 'billingKey 없음' || data?.code === 'BILLING_KEY_MISSING') {
      return { kind: 'billing_missing' };
    }
    if (data?.code === 'ALREADY_SUBSCRIBED') {
      return {
        kind: 'plan_change_available',
        message:
          typeof data?.error === 'string'
            ? data.error
            : '이미 구독 중입니다. 플랜 변경 예약을 이용해 주세요.',
      };
    }
    if (typeof data?.error === 'string' && data.error.includes('이미 이용 중인 구독')) {
      return { kind: 'already_subscribed', message: data.error };
    }
    return {
      kind: 'error',
      message: typeof data?.error === 'string' ? data.error : '결제 승인에 실패했습니다.',
    };
  }

  await deps.fetchUser();
  deps.onSuccessNavigate();
  return { kind: 'success' };
}
