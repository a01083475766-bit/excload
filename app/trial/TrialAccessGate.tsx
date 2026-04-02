'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TRIAL_ACCESS_MAX_PER_BROWSER,
  TRIAL_ACCESS_MAX_PER_IP,
  TRIAL_LS_BROWSER_COUNT,
  TRIAL_SS_SESSION_PASSED,
} from '@/app/lib/trial-access';

type GateState = 'loading' | 'ok' | 'blocked_browser' | 'blocked_ip';

function readBrowserCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(TRIAL_LS_BROWSER_COUNT);
  const n = parseInt(raw ?? '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function TrialAccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const browserCount = readBrowserCount();
    if (browserCount >= TRIAL_ACCESS_MAX_PER_BROWSER) {
      setState('blocked_browser');
      return;
    }

    if (sessionStorage.getItem(TRIAL_SS_SESSION_PASSED) === '1') {
      setState('ok');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/trial/allow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          degraded?: boolean;
          reason?: string;
        };

        if (cancelled) return;

        if (res.status === 403 || data.reason === 'ip_limit') {
          setState('blocked_ip');
          return;
        }

        sessionStorage.setItem(TRIAL_SS_SESSION_PASSED, '1');

        if (!data.degraded && res.ok && data.ok !== false) {
          const next = readBrowserCount() + 1;
          localStorage.setItem(TRIAL_LS_BROWSER_COUNT, String(next));
        }

        setState('ok');
      } catch {
        if (!cancelled) {
          sessionStorage.setItem(TRIAL_SS_SESSION_PASSED, '1');
          setState('ok');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-black px-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">체험 화면을 준비하는 중입니다…</p>
      </div>
    );
  }

  if (state === 'blocked_browser') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-black px-4 text-center max-w-md mx-auto py-12">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">이 브라우저에서 체험 횟수를 초과했습니다</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          체험 모드는 브라우저당 최대 {TRIAL_ACCESS_MAX_PER_BROWSER}회까지 이용할 수 있습니다. 정식 서비스는
          회원가입 후 이용해 주세요.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <Link
            href="/pricing"
            className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200"
          >
            요금제 보기
          </Link>
          <Link
            href="/auth/signup"
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
          >
            회원가입
          </Link>
        </div>
        <Link href="/excload" className="text-sm text-blue-600 hover:underline mt-2">
          랜딩으로 돌아가기
        </Link>
      </div>
    );
  }

  if (state === 'blocked_ip') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-black px-4 text-center max-w-md mx-auto py-12">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">이 네트워크에서 체험 횟수를 초과했습니다</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          동일 인터넷 연결(IP)당 체험은 최대 {TRIAL_ACCESS_MAX_PER_IP}회까지 제공됩니다. 가입 후 정식으로 이용해
          주세요.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <Link
            href="/pricing"
            className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200"
          >
            요금제 보기
          </Link>
          <Link
            href="/auth/signup"
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
          >
            회원가입
          </Link>
        </div>
        <Link href="/excload" className="text-sm text-blue-600 hover:underline mt-2">
          랜딩으로 돌아가기
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
