'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { IntegrationConnectedNotice } from '@/app/components/order-integration/IntegrationConnectedNotice';
import { SecretInput } from '@/app/components/order-integration/SecretInput';

type CoupangAccountResponse = {
  id: string;
  accountName: string;
  vendorId: string;
  accessKeyMasked: string;
  secretKeyMasked: string;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  expiresAt: string | null;
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

function formatDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
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

export function CoupangIntegrationForm({
  embedded = false,
  onConnectionChange,
}: { embedded?: boolean; onConnectionChange?: () => void } = {}) {
  const outboundIp = getExcloadOutboundIp();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<CoupangAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [apiKeyExpiry, setApiKeyExpiry] = useState('');
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
      const res = await fetch('/api/order/integration/coupang');
      const data = (await res.json()) as { account?: CoupangAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setVendorCode(account.vendorId);
        setApiKeyExpiry(formatDateInputValue(account.expiresAt));
        setAccessKey('');
        setSecretKey('');
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
        const res = await fetch('/api/order/integration/coupang/transport');
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
      const res = await fetch('/api/order/integration/coupang/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          vendorId: vendorCode,
          accessKey,
          secretKey: secretKey || undefined,
          expiresAt: apiKeyExpiry || null,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: CoupangAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setAccessKey('');
      setSecretKey('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '쿠팡 연동 정보가 저장되었습니다.',
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
      const res = await fetch('/api/order/integration/coupang/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '쿠팡 API 연결이 정상 확인되었습니다.',
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
    if (!window.confirm('저장된 쿠팡 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/coupang', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setVendorCode('');
      setAccessKey('');
      setSecretKey('');
      setApiKeyExpiry('');
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '쿠팡 연동이 해제되었습니다.',
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

  const accessKeyPlaceholder = savedAccount?.hasAccessKey
    ? `저장됨: ${savedAccount.accessKeyMasked || '****'}`
    : 'Access Key 입력';

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
      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">쿠팡 연동</h1>
      ) : (
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">연동 정보 입력</h2>
      )}
      {!embedded ? (
        <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        쿠팡 Wing Open API 정보를 저장한 뒤 연결 테스트를 진행할 수 있습니다. 실제 주문 조회·수집은 주문연동 화면에서 진행합니다.
      </p>
      ) : (
        <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">쇼핑몰에서 발급한 값을 입력한 뒤 연결 테스트와 저장을 진행합니다.</p>
      )}

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로: <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : 'Vercel 직접 호출'}</strong>
          {transportInfo.mode === 'direct' ? (
            <span className="mt-1 block text-xs opacity-90">
              고정 IP 확보 전 관리자 테스트 전용입니다. 운영 시 COUPANG_PROXY_BASE_URL 프록시를 설정하세요.
            </span>
          ) : (
            <span className="mt-1 block text-xs opacity-90">
              쿠팡 WING에는 프록시 서버의 고정 IP(NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP)를 등록하세요.
            </span>
          )}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          최근 오류: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

{!embedded ? (
      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">엑클로드 정보 (판매자센터 등록용)</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow
            label="IP 주소"
            value={outboundIp}
            placeholder="NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP 환경변수 설정 필요"
          />
        </dl>
      </section>
      ) : null}

{!embedded ? (
      <CollapsibleGuide title="API 발급 방법 보기 (쿠팡)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>쿠팡 Wing 판매자센터 → Open API 메뉴로 이동합니다.</li>
          <li>업체명 <strong>엑클로드</strong>, URL <strong>https://www.excload.com</strong>, IP에 엑클로드 고정 IP를 등록합니다.</li>
          <li>Access Key, Secret Key를 발급받아 아래에 입력합니다.</li>
          <li>API 키 만료일을 함께 입력하면 갱신 알림에 활용할 수 있습니다.</li>
        </ol>
      </CollapsibleGuide>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="accountName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            계정명
          </label>
          <input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="예: 본사 쿠팡 계정"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="vendorCode" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            쿠팡 업체코드
          </label>
          <input
            id="vendorCode"
            type="text"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="accessKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Access Key
          </label>
          <input
            id="accessKey"
            type="text"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            autoComplete="off"
            placeholder={accessKeyPlaceholder}
            className={inputClass}
          />
        </div>

        <SecretInput
          id="secretKey"
          label="Secret Key"
          value={secretKey}
          onChange={setSecretKey}
          hasSaved={Boolean(savedAccount?.hasSecretKey)}
          savedMasked={savedAccount?.secretKeyMasked}
          newPlaceholder="Secret Key 입력 (저장 후 전체 노출되지 않습니다)"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <div>
          <label htmlFor="apiKeyExpiry" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            API 키 만료일 (갱신 알림용)
          </label>
          <input
            id="apiKeyExpiry"
            type="date"
            value={apiKeyExpiry}
            onChange={(e) => setApiKeyExpiry(e.target.value)}
            className={inputClass}
          />
        </div>

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
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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

      {savedAccount ? <IntegrationConnectedNotice mallName="쿠팡" /> : null}
    </div>
  );
}
