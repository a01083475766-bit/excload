'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { CAFE24_OAUTH_REDIRECT_URI, CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';
import { IntegrationConnectedNotice } from '@/app/components/order-integration/IntegrationConnectedNotice';
import { SecretInput } from '@/app/components/order-integration/SecretInput';

type Cafe24AccountResponse = {
  id: string;
  accountName: string;
  mallId: string;
  clientId: string;
  clientIdMasked: string;
  clientSecretMasked: string;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasOAuthTokens: boolean;
  tokenExpiresAt: string | null;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
  hasRequiredScopes?: boolean;
  missingScopes?: string[];
  needsReauthForScopes?: boolean;
  reauthMessage?: string | null;
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

function statusBannerClass(kind: 'success' | 'error' | 'info' | 'warning'): string {
  if (kind === 'success') {
    return 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100';
  }
  if (kind === 'error') {
    return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100';
  }
  if (kind === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
  }
  return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100';
}

export function Cafe24IntegrationForm({
  embedded = false,
  onConnectionChange,
}: { embedded?: boolean; onConnectionChange?: () => void } = {}) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<Cafe24AccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [mallId, setMallId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );

  const inputClass =
    'w-full rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const needsReauth = Boolean(savedAccount?.needsReauthForScopes);
  const needsReregister = Boolean(savedAccount?.reauthMessage) && !savedAccount?.hasOAuthTokens;
  const oauthButtonLabel = needsReauth ? '권한 추가 재연동' : '카페24 연동 시작';

  const loadSavedAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/order/integration/cafe24');
      const data = (await res.json()) as { account?: Cafe24AccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setMallId(account.mallId);
        setClientId(account.clientId || '');
        setClientSecret('');
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
    const oauth = searchParams?.get('oauth');
    const message = searchParams?.get('message');
    if (oauth === 'success') {
      setStatusMessage({ kind: 'success', text: '카페24 OAuth 연동이 완료되었습니다. 연결 테스트를 진행해 주세요.' });
      void loadSavedAccount();
    } else if (oauth === 'error') {
      setStatusMessage({
        kind: 'error',
        text: message ?? '카페24 OAuth 연동에 실패했습니다.',
      });
    }
  }, [searchParams, loadSavedAccount]);

  async function handleSave() {
    setBusyAction('save');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/cafe24/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          mallId,
          clientId,
          clientSecret: clientSecret || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: Cafe24AccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setClientSecret('');
      if (data.account?.clientId) setClientId(data.account.clientId);
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '카페24 연동 정보가 저장되었습니다.',
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

  function handleStartOAuth() {
    window.location.href = '/api/order/integration/cafe24/authorize';
  }

  async function handleTest() {
    setBusyAction('test');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/cafe24/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '카페24 API 연결이 정상 확인되었습니다.',
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
    if (!window.confirm('저장된 카페24 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/cafe24', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setMallId('');
      setClientId('');
      setClientSecret('');
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '카페24 연동이 해제되었습니다.',
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">카페24 개인 API 연동</h1>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            베타
          </span>
        </div>
      ) : (
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">카페24 개인 API 연동</h2>
      )}
      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        카페24 앱스토어에서 엑클로드 앱을 설치하는 방식이 아닙니다. 본인의 카페24 Developers에서 연동용 앱을
        만든 뒤, 발급받은 API 정보를 엑클로드에 등록하여 본인 쇼핑몰을 연결합니다.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      <p className={`mb-3 rounded border px-2.5 py-1.5 text-sm ${statusBannerClass('info')}`}>
        인증 방식: <strong>카페24 OAuth 2.0</strong>
        <span className="mt-1 block text-xs opacity-90">
          Scope: {CAFE24_OAUTH_SCOPES} (주문 읽기·쓰기, 배송 읽기)
        </span>
      </p>

      {needsReauth || needsReregister ? (
        <p className={`mb-3 rounded border px-2.5 py-1.5 text-sm ${statusBannerClass('warning')}`}>
          {savedAccount?.reauthMessage?.trim() ||
            '카페24 주문 쓰기권한이 필요합니다. 다시 연동해 주세요'}
          {savedAccount?.missingScopes?.length && needsReauth ? (
            <span className="mt-1 block text-xs opacity-90">
              부족 scope: {savedAccount.missingScopes.join(', ')}
            </span>
          ) : null}
        </p>
      ) : null}

      {savedAccount?.hasOAuthTokens ? (
        <p className={`mb-3 rounded border px-2.5 py-1.5 text-sm ${statusBannerClass('success')}`}>
          OAuth 연결됨
          {savedAccount.tokenExpiresAt
            ? ` · access_token 만료: ${new Date(savedAccount.tokenExpiresAt).toLocaleString('ko-KR')}`
            : null}
        </p>
      ) : savedAccount ? (
        <p className={`mb-3 rounded border px-2.5 py-1.5 text-sm ${statusBannerClass('info')}`}>
          OAuth 미연결 — 계정 저장 후 「{oauthButtonLabel}」을 눌러 권한 동의를 완료해 주세요.
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-3 rounded border px-2.5 py-1.5 text-sm ${statusBannerClass('error')}`}>
          최근 오류: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      {!embedded ? (
        <section className="mb-4 rounded border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
          <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            카페24 Developers 앱 등록 정보
          </h2>
          <dl className="space-y-2">
            <CopyableInfoRow label="App URL" value={EXCLOAD_INTEGRATION_INFO.url} />
            <CopyableInfoRow label="Redirect URI" value={CAFE24_OAUTH_REDIRECT_URI} />
            <CopyableInfoRow label="Scope" value={CAFE24_OAUTH_SCOPES} />
          </dl>
        </section>
      ) : null}

      {!embedded ? (
        <CollapsibleGuide title="연동 방법 보기 (카페24)">
          <ol className="list-decimal space-y-2 pl-5">
            <li>카페24 Developers에 로그인한 뒤 Apps → App 관리에서 연동용 앱을 생성합니다.</li>
            <li>
              App URL·Redirect URI·Scope를 위 등록 정보대로 입력하고, 발급된 Client ID/Secret을 확인합니다.
            </li>
            <li>엑클로드에 쇼핑몰 ID·Client ID·Client Secret을 입력·저장합니다.</li>
            <li>
              「{oauthButtonLabel}」으로 관리자 로그인·권한 동의 후 「연결 테스트」를 진행합니다.
            </li>
          </ol>
        </CollapsibleGuide>
      ) : null}

      <form className="mt-4 space-y-3" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="accountName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            계정명
          </label>
          <input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="예: 본사 카페24"
            className={inputClass}
          />
        </div>

        <SecretInput
          id="mallId"
          label="카페24 쇼핑몰 ID (mallId)"
          confirmLabel="쇼핑몰 ID"
          secret={false}
          value={mallId}
          onChange={setMallId}
          hasSaved={Boolean(savedAccount?.mallId)}
          savedMasked={savedAccount?.mallId}
          newPlaceholder="예: sample (sample.cafe24.com → sample)"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <SecretInput
          id="clientId"
          label="Client ID"
          confirmLabel="Client ID"
          secret={false}
          value={clientId}
          onChange={setClientId}
          hasSaved={Boolean(savedAccount?.hasClientId && savedAccount.clientId)}
          savedMasked={savedAccount?.clientId}
          newPlaceholder="카페24 Developers에서 발급"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <SecretInput
          id="clientSecret"
          label="Client Secret"
          confirmLabel="Client Secret"
          value={clientSecret}
          onChange={setClientSecret}
          hasSaved={Boolean(savedAccount?.hasClientSecret)}
          savedMasked="********"
          newPlaceholder="카페24 Developers에서 발급"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        {statusMessage ? (
          <p className={`rounded border px-2.5 py-1.5 text-sm ${statusBannerClass(statusMessage.kind)}`}>
            {statusMessage.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleSave()}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            저장
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount?.hasClientId || !savedAccount?.hasClientSecret}
            onClick={handleStartOAuth}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-blue-600 px-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {oauthButtonLabel}
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount?.hasOAuthTokens}
            onClick={() => void handleTest()}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            연결 테스트
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleDisconnect()}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            연동 해제
          </button>
        </div>
      </form>

      {savedAccount?.hasOAuthTokens ? <IntegrationConnectedNotice mallName="카페24" /> : null}
    </div>
  );
}
