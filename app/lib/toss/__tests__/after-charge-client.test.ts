import { describe, it, expect, vi } from 'vitest';
import { runAfterTossChargeResponse } from '../after-charge-client';

describe('runAfterTossChargeResponse', () => {
  it('성공 시 fetchUser 후 navigate를 호출한다 (플랜 갱신 순서)', async () => {
    const fetchUser = vi.fn().mockResolvedValue(undefined);
    const onSuccessNavigate = vi.fn();
    const order: string[] = [];
    fetchUser.mockImplementation(async () => {
      order.push('fetchUser');
    });
    onSuccessNavigate.mockImplementation(() => {
      order.push('navigate');
    });

    const result = await runAfterTossChargeResponse(
      { ok: true },
      {},
      { fetchUser, onSuccessNavigate },
    );

    expect(result.kind).toBe('success');
    expect(fetchUser).toHaveBeenCalledOnce();
    expect(onSuccessNavigate).toHaveBeenCalledOnce();
    expect(order).toEqual(['fetchUser', 'navigate']);
  });

  it('billingKey 없음이면 fetchUser를 호출하지 않는다', async () => {
    const fetchUser = vi.fn();
    const onSuccessNavigate = vi.fn();

    const result = await runAfterTossChargeResponse(
      { ok: false },
      { error: 'billingKey 없음' },
      { fetchUser, onSuccessNavigate },
    );

    expect(result.kind).toBe('billing_missing');
    expect(fetchUser).not.toHaveBeenCalled();
    expect(onSuccessNavigate).not.toHaveBeenCalled();
  });
});
