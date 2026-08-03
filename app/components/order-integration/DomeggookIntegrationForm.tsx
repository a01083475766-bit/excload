'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { SecretInput } from '@/app/components/order-integration/SecretInput';

type DomeggookAccountResponse = {
  id: string;
  accountName: string;
  memberId: string;
  apiKeyMasked: string;
  passwordMasked: string;
  hasApiKey: boolean;
  hasPassword: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function CollapsibleGuide({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {open ? (
        <div className="border-t border-zinc-200 px-3 py-2 text-sm leading-relaxed text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function statusBannerClass(kind: 'success' | 'error' | 'info'): string {
  if (kind === 'success') {
    return 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100';
  }
  if (kind === 'error') {
    return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100';
  }
  return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100';
}

export function DomeggookIntegrationForm({
  embedded = false,
  onConnectionChange,
}: { embedded?: boolean; onConnectionChange?: () => void } = {}) {
  const outboundIp = getExcloadOutboundIp();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<DomeggookAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [transportInfo, setTransportInfo] = useState<{
    mode: 'direct' | 'proxy';
    notes?: string;
  } | null>(null);

  const inputClass =
    'h-9 w-full rounded border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const loadSavedAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/order/integration/domeggook');
      const data = (await res.json()) as { account?: DomeggookAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setMemberId(account.memberId);
        setPassword('');
        setApiKey('');
      }
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '연동 정보를 불러오지 못했습니다.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedAccount();
  }, [loadSavedAccount]);

  useEffect(() => {
    async function loadTransport() {
      try {
        const res = await fetch('/api/order/integration/domeggook/transport');
        const data = (await res.json()) as {
          transport?: { mode: 'direct' | 'proxy' };
          notes?: string;
        };
        if (res.ok && data.transport) {
          setTransportInfo({ mode: data.transport.mode, notes: data.notes });
        }
      } catch {
        // transport 정보는 부가 안내용
      }
    }
    void loadTransport();
  }, []);

  async function handleSave() {
    setBusyAction('save');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/domeggook/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          memberId,
          password: password || undefined,
          apiKey: apiKey || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: DomeggookAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setPassword('');
      setApiKey('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '도매꾹 연동 정보가 저장되었습니다.',
      });
      onConnectionChange?.();
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '저장에 실패했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTest() {
    setBusyAction('test');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/domeggook/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '도매꾹 API 연결이 정상 확인되었습니다.',
      });
      await loadSavedAccount();
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '연결 테스트에 실패했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('저장된 도매꾹 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/domeggook', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setMemberId('');
      setPassword('');
      setApiKey('');
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '도매꾹 연동이 해제되었습니다.',
      });
      onConnectionChange?.();
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '연동 해제에 실패했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className={embedded ? 'w-full' : 'mx-auto max-w-3xl px-4 py-6 pb-10 sm:px-6'}>
      {!embedded ? (
        <Link
          href="/order/integration/connect"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          주문연동 목록
        </Link>
      ) : null}

      {!embedded ? (
        <div className="mb-2 flex items-center gap-2">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">도매꾹 연동</h1>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            베타
          </span>
        </div>
      ) : (
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">연동 정보 입력</h2>
      )}
      {!embedded ? (
        <p className="mb-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          도매꾹 회원 ID·비밀번호·API Key를 저장한 뒤 연결 테스트를 진행합니다. 연결 테스트는 로그인(setLogin) 후
          판매 주문 목록(getOrderList) 조회까지 성공해야 완료됩니다. 발주확인·배송처리 등 상태 변경은 포함하지 않습니다.
        </p>
      ) : (
        <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          도매꾹에서 발급한 값을 입력한 뒤 저장·연결 테스트를 진행합니다.
        </p>
      )}

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      {transportInfo ? (
        <p className={`mb-4 rounded border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.mode === 'proxy' ? (
            <span className="mt-1 block text-xs opacity-90">
              로그인 요청의 ip 파라미터에는 엑클로드 고정 IP({outboundIp || '환경변수 설정 필요'})를 사용합니다.
            </span>
          ) : (
            <span className="mt-1 block text-xs opacity-90">
              도매꾹 API 서버 연결 준비가 완료되지 않았습니다. 관리자에게 문의해 주세요.
            </span>
          )}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          최근 오류: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      {!embedded ? (
        <section className="mb-5 rounded border border-blue-200 bg-blue-50/80 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <h2 className="mb-2 text-sm font-bold text-blue-900 dark:text-blue-100">엑클로드 정보</h2>
          <dl className="space-y-2">
            <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
            <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
            <CopyableInfoRow
              label="고정 IP (로그인 ip 파라미터)"
              value={outboundIp}
              placeholder="NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP 환경변수 설정 필요"
            />
          </dl>
        </section>
      ) : null}

      {!embedded ? (
        <CollapsibleGuide title="API 발급·승인 안내 (도매꾹)">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>도매꾹 Open API Key를 발급합니다.</li>
            <li>Private API 판매용 권한(판매관리·로그인·반품교환) 승인을 완료합니다.</li>
            <li>아래 회원 ID·비밀번호·API Key를 입력한 뒤 저장 → 연결 테스트를 진행합니다.</li>
            <li>비밀번호와 API Key는 암호화 저장되며, 조회 시 원문이 노출되지 않습니다.</li>
          </ol>
        </CollapsibleGuide>
      ) : null}

      <form className="mt-5 space-y-3" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="domeggook-accountName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            계정명
          </label>
          <input
            id="domeggook-accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="예: 본사 도매꾹"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="domeggook-memberId" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            도매꾹 회원 ID
          </label>
          <input
            id="domeggook-memberId"
            type="text"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            placeholder="도매꾹 로그인 아이디"
            className={inputClass}
            autoComplete="username"
          />
        </div>

        <SecretInput
          id="domeggook-password"
          label="도매꾹 비밀번호"
          confirmLabel="비밀번호"
          value={password}
          onChange={setPassword}
          hasSaved={Boolean(savedAccount?.hasPassword)}
          savedMasked={savedAccount?.passwordMasked}
          newPlaceholder="도매꾹 비밀번호 입력 (저장 후 전체 노출되지 않습니다)"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <SecretInput
          id="domeggook-apiKey"
          label="도매꾹 API Key"
          confirmLabel="API Key"
          value={apiKey}
          onChange={setApiKey}
          hasSaved={Boolean(savedAccount?.hasApiKey)}
          savedMasked={savedAccount?.apiKeyMasked}
          newPlaceholder="도매꾹 API Key 입력 (저장 후 전체 노출되지 않습니다)"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        {statusMessage ? (
          <p className={`rounded border px-3 py-2 text-sm ${statusBannerClass(statusMessage.kind)}`}>
            {statusMessage.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleSave()}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-transparent bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busyAction === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            저장
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleTest()}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-transparent bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busyAction === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            연결 테스트
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleDisconnect()}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'disconnect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            연동 해제
          </button>
        </div>
      </form>

      {savedAccount ? (
        <section className="mt-5 rounded border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/40">
          <p className="text-sm font-semibold text-green-900 dark:text-green-100">도매꾹 연동 정보가 저장되었습니다.</p>
          <p className="mt-1 text-sm leading-relaxed text-green-800 dark:text-green-200">
            현재 단계는 연결 테스트와 판매 주문 목록 읽기 전용입니다. 수취인·주소 상세·발주확인·송장 전송은 아직
            포함되지 않습니다.
          </p>
          <Link
            href="/order/integration"
            className="mt-2 inline-flex h-8 items-center rounded border border-transparent bg-green-600 px-3 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            주문연동으로 이동
          </Link>
        </section>
      ) : null}
    </div>
  );
}
