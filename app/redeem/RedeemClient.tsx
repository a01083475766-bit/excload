'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { buildAuthLoginRedirectPath } from '@/app/lib/auth/post-login-redirect';
import { useUserStore } from '@/app/store/userStore';
import { ENTITLEMENT_LIFECYCLE } from '@/app/lib/voucher/constants';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  if (local.length <= 2) return `${local[0] ?? '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

type Props = {
  campaignSlug?: string | null;
  campaignTitle?: string | null;
  redeemBlockedMessage?: string | null;
  /** wadiz slug only — optional neutral campaign hint */
  showCampaignHint?: boolean;
};

export function RedeemClient({
  campaignSlug,
  campaignTitle,
  redeemBlockedMessage,
  showCampaignHint,
}: Props) {
  const { status, data: session } = useSession();
  const router = useRouter();
  const fetchUser = useUserStore((s) => s.fetchUser);
  const [code, setCode] = useState('');
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{
    lifecycleStatus: string;
    startsAt: string | null;
    endsAt: string | null;
    durationMonths: number;
  } | null>(null);

  const email = session?.user?.email ?? '';
  const masked = useMemo(() => (email ? maskEmail(email) : ''), [email]);

  const loginHref = buildAuthLoginRedirectPath(
    campaignSlug ? `/redeem/${campaignSlug}` : '/redeem',
  );

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-sm text-zinc-600">불러오는 중…</div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-xl font-semibold text-zinc-900">이용권 등록</h1>
        <p className="mt-3 text-sm text-zinc-600">
          이용권을 등록하려면 먼저 로그인하거나 회원가입해 주세요.
        </p>
        <Link
          href={loginHref}
          className="mt-6 inline-flex h-9 items-center rounded border border-blue-600 bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          로그인 / 회원가입
        </Link>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (redeemBlockedMessage) {
      setError(redeemBlockedMessage);
      return;
    }
    if (!confirmAccount) {
      setError('등록할 계정을 확인해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code,
          campaignSlug: campaignSlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '등록에 실패했습니다.');
        return;
      }
      setSuccess(data.entitlement);
      setCode('');
      void fetchUser();
    } catch {
      setError('등록 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const formatKst = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold text-zinc-900">이용권 등록</h1>
      {showCampaignHint && campaignTitle && (
        <p className="mt-1 text-sm text-zinc-500">{campaignTitle}</p>
      )}
      <p className="mt-3 text-sm text-zinc-600">
        외부에서 받으신 이용권 코드를 등록하면 현재 로그인 계정에 PRO 이용기간이 적용됩니다.
      </p>

      {redeemBlockedMessage && (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {redeemBlockedMessage}
        </p>
      )}

      {success ? (
        <div className="mt-6 rounded border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
          <p className="font-medium">등록이 완료되었습니다.</p>
          {success.lifecycleStatus === ENTITLEMENT_LIFECYCLE.READY && (
            <p className="mt-2">
              PRO 이용권 · {success.durationMonths}개월
              <br />
              시작: {formatKst(success.startsAt)}
              <br />
              종료: {formatKst(success.endsAt)} (해당 시각 미포함)
            </p>
          )}
          {success.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END && (
            <p className="mt-2">
              PRO 이용권이 등록되었습니다. 정기결제가 종료된 뒤 {success.durationMonths}개월
              이용이 시작됩니다. (자동 해지되지 않습니다.)
            </p>
          )}
          {success.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER && (
            <p className="mt-2">
              PRO 이용권이 등록되었습니다. 이전 이용권 종료 후 이어서 {success.durationMonths}개월이
              시작됩니다.
            </p>
          )}
          <button
            type="button"
            className="mt-4 h-8 rounded border border-zinc-300 bg-white px-3 text-sm hover:bg-zinc-50"
            onClick={() => router.push('/mypage')}
          >
            마이페이지로 이동
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="rounded border border-zinc-200 bg-white px-3 py-3 text-sm">
            <p className="font-medium text-zinc-900">현재 로그인한 계정에 이용권이 등록됩니다.</p>
            <p className="mt-1 text-zinc-600">등록 계정: {masked}</p>
            <label className="mt-3 flex items-start gap-2 text-zinc-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmAccount}
                onChange={(e) => setConfirmAccount(e.target.checked)}
              />
              <span>위 계정이 맞는지 확인했습니다.</span>
            </label>
          </div>

          <div>
            <label htmlFor="voucher-code" className="block text-sm font-medium text-zinc-800">
              이용권 코드
            </label>
            <input
              id="voucher-code"
              type="text"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 h-9 w-full rounded border border-zinc-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="코드 입력"
              disabled={Boolean(redeemBlockedMessage) || loading}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || Boolean(redeemBlockedMessage)}
            className="h-9 rounded border border-blue-600 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '등록 중…' : '이용권 등록'}
          </button>
        </form>
      )}
    </div>
  );
}
