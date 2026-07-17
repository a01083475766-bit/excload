'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { IntegrationConnectedNotice } from '@/app/components/order-integration/IntegrationConnectedNotice';
import { SecretInput } from '@/app/components/order-integration/SecretInput';

type ShopbyAccountResponse = {
  id: string;
  accountName: string;
  mallDomain: string;
  mallKeyMasked: string;
  systemKeyMasked: string;
  hasMallKey: boolean;
  hasSystemKey: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
};

function CollapsibleGuide({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {open ? (
        <div className="border-t border-zinc-200 px-4 py-3 text-sm leading-relaxed text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
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

export function ShopbyIntegrationForm({
  embedded = false,
  onConnectionChange,
}: { embedded?: boolean; onConnectionChange?: () => void } = {}) {
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<ShopbyAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [mallDomain, setMallDomain] = useState('');
  const [mallKey, setMallKey] = useState('');
  const [systemKey, setSystemKey] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [transportInfo, setTransportInfo] = useState<{
    mode: 'direct' | 'proxy';
    notes?: string;
  } | null>(null);

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const loadSavedAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/order/integration/shopby');
      const data = (await res.json()) as { account?: ShopbyAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setMallDomain(account.mallDomain);
        setMallKey('');
        setSystemKey('');
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
        const res = await fetch('/api/order/integration/shopby/transport');
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
      const res = await fetch('/api/order/integration/shopby/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          mallDomain: mallDomain || undefined,
          mallKey: mallKey || undefined,
          systemKey: systemKey || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: ShopbyAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setMallKey('');
      setSystemKey('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '샵바이 연동 정보가 저장되었습니다.',
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
      const res = await fetch('/api/order/integration/shopby/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '샵바이 Server API 연결이 정상 확인되었습니다.',
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
    if (!window.confirm('저장된 샵바이 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/shopby', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setMallDomain('');
      setMallKey('');
      setSystemKey('');
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '샵바이 연동이 해제되었습니다.',
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
    <div className={embedded ? "w-full" : "mx-auto max-w-3xl px-4 py-6 pb-10 sm:px-6"}>
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">NHN커머스/샵바이 연동</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          베타
        </span>
      </div>
      ) : (
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">연동 정보 입력</h2>
      )}
{!embedded ? (
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        샵바이 Server API(mallKey 방식)로 연결 테스트를 진행할 수 있습니다. 실제 주문 조회·수집은 주문연동 화면에서
        진행합니다. 발주확인·송장 전송·상태 변경·Webhook은 포함하지 않습니다.
      </p>      ) : (
        <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">쇼핑몰에서 발급한 값을 입력한 뒤 연결 테스트와 저장을 진행합니다.</p>
      )}

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
        <strong>NHN Server API 호출 IP 등록은 불필요</strong>합니다.
        <span className="mt-1 block">
          엑클로드 구조상 <strong>고정 IP 프록시</strong>를 통해 <code className="text-xs">server-api.e-ncp.com</code>에
          호출합니다.
        </span>
      </p>

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.notes ? <span className="mt-1 block text-xs opacity-90">{transportInfo.notes}</span> : null}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          최근 오류: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

{!embedded ? (
      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">엑클로드 정보</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
        </dl>
      </section>
      ) : null}

{!embedded ? (
      <CollapsibleGuide title="API 키 발급 방법 보기 (샵바이)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://workspace-help.nhn-commerce.com/contents/faq/server-api-1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              샵바이 Server API 호출 가이드
            </a>
            를 참고합니다.
          </li>
          <li>워크스페이스 → 셀러어드민 → 앱(App) 등록 → systemKey 발급</li>
          <li>서비스어드민 → 쇼핑몰 관리 → 개발연동정보 → 외부 연동키(mallKey) 확인</li>
          <li>
            API 문서:{' '}
            <a
              href="https://server-docs.shopby.co.kr/?url.primaryName=order%2F"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              server-docs.shopby.co.kr
            </a>
          </li>
        </ol>
      </CollapsibleGuide>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="accountName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            접속별칭 (계정명)
          </label>
          <input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="예: 본사 샵바이몰"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mallDomain" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            쇼핑몰 도메인 또는 쇼핑몰명 (선택)
          </label>
          <input
            id="mallDomain"
            type="text"
            value={mallDomain}
            onChange={(e) => setMallDomain(e.target.value)}
            placeholder="예: myshop.shopby.co.kr"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">계정 구분용입니다. API 호출에는 사용하지 않습니다.</p>
        </div>

        <SecretInput
          id="systemKey"
          label="systemKey (워크스페이스 앱)"
          confirmLabel="systemKey"
          value={systemKey}
          onChange={setSystemKey}
          hasSaved={Boolean(savedAccount?.hasSystemKey)}
          savedMasked={savedAccount?.systemKeyMasked}
          newPlaceholder="systemKey(워크스페이스 앱) 입력 (저장 후 전체 노출되지 않습니다)"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <SecretInput
          id="mallKey"
          label="mallKey (외부 연동키)"
          confirmLabel="mallKey"
          value={mallKey}
          onChange={setMallKey}
          hasSaved={Boolean(savedAccount?.hasMallKey)}
          savedMasked={savedAccount?.mallKeyMasked}
          newPlaceholder="mallKey(외부 연동키) 입력 (저장 후 전체 노출되지 않습니다)"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        {statusMessage ? (
          <p className={`rounded-lg border px-3 py-2 text-sm ${statusBannerClass(statusMessage.kind)}`}>
            {statusMessage.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busyAction === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            저장
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleTest()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busyAction === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            연결 테스트
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleDisconnect()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            연동 해제
          </button>
        </div>
      </form>

      {savedAccount ? <IntegrationConnectedNotice mallName="샵바이" /> : null}
    </div>
  );
}
