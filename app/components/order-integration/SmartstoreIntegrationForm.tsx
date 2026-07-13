'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import {
  SMARTSTORE_PREVIEW_HEADERS,
  type SmartstorePreviewRow,
} from '@/app/lib/smartstore/map-smartstore-orders';

type SmartstoreAccountResponse = {
  id: string;
  accountName: string;
  clientId: string;
  clientIdMasked: string;
  clientSecretMasked: string;
  authType: 'SELF' | 'SELLER';
  hasClientId: boolean;
  hasClientSecret: boolean;
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

export function SmartstoreIntegrationForm() {
  const outboundIp = getExcloadOutboundIp();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<SmartstoreAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [authType] = useState<'SELF'>('SELF');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<SmartstorePreviewRow[]>([]);
  const [fetchMeta, setFetchMeta] = useState<{ count: number } | null>(null);
  const [transportInfo, setTransportInfo] = useState<{
    mode: 'direct' | 'proxy';
    notes?: string;
  } | null>(null);

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const loadSavedAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/order/integration/smartstore');
      const data = (await res.json()) as { account?: SmartstoreAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setClientId(account.clientId);
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
    async function loadTransport() {
      try {
        const res = await fetch('/api/order/integration/smartstore/transport');
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
      const res = await fetch('/api/order/integration/smartstore/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          clientId,
          clientSecret: clientSecret || undefined,
          authType,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: SmartstoreAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setClientSecret('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '스마트스토어 연동 정보가 저장되었습니다.',
      });
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
      const res = await fetch('/api/order/integration/smartstore/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '스마트스토어 API 연결이 정상 확인되었습니다.',
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

  async function handleFetchOrders() {
    setBusyAction('fetch');
    setStatusMessage(null);
    setPreviewRows([]);
    setFetchMeta(null);
    try {
      const res = await fetch('/api/order/integration/smartstore/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: SmartstorePreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? '주문 수집에 실패했습니다.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `스마트스토어 주문 ${data.count ?? 0}건을 불러왔습니다.`,
      });
      await loadSavedAccount();
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '주문 수집에 실패했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('저장된 스마트스토어 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/smartstore', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setClientId('');
      setClientSecret('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '스마트스토어 연동이 해제되었습니다.',
      });
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '연동 해제에 실패했습니다.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  const clientIdPlaceholder = savedAccount?.hasClientId
    ? `저장됨: ${savedAccount.clientIdMasked || '****'}`
    : 'Client ID (애플리케이션 ID) 입력';
  const clientSecretPlaceholder = savedAccount?.hasClientSecret
    ? `저장됨: ${savedAccount.clientSecretMasked || '********'} (변경 시에만 입력)`
    : 'Client Secret 입력 (저장 후 전체 노출되지 않습니다)';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-10 sm:px-6">
      <Link
        href="/order/integration/connect"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        주문연동 목록
      </Link>

      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">스마트스토어 연동</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          베타
        </span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        네이버 커머스API(Smart Store Center) 애플리케이션 정보를 저장한 뒤 연결 테스트와 주문 조회·수집을 진행할 수
        있습니다. 발주확인·송장 전송 등 상태 변경 기능은 포함하지 않습니다.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.mode === 'proxy' ? (
            <span className="mt-1 block text-xs opacity-90">
              커머스API센터 API 호출 IP에는 엑클로드 고정 IP({outboundIp || '54.180.45.46'})를 등록하세요.
            </span>
          ) : (
            <span className="mt-1 block text-xs opacity-90">
              스마트스토어 API는 Vercel 직접 호출을 지원하지 않습니다. INTEGRATION_PROXY_BASE_URL을 설정해 주세요.
            </span>
          )}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          최근 오류: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">엑클로드 정보 (커머스API센터 등록용)</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow
            label="API 호출 IP"
            value={outboundIp}
            placeholder="NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP 환경변수 설정 필요"
          />
        </dl>
      </section>

      <CollapsibleGuide title="API 발급 방법 보기 (스마트스토어 · 직접 운영)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://sell.smartstore.naver.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              스마트스토어센터
            </a>
            에 판매자 계정으로 로그인합니다.
          </li>
          <li>네이버 커머스API센터 → 내 스토어 애플리케이션 → 애플리케이션 등록</li>
          <li>
            API 호출 IP에 <strong>엑클로드 고정 IP</strong>를 등록하고, API 권한(주문 조회 등)을 추가합니다.
          </li>
          <li>발급된 애플리케이션 ID(Client ID)와 Client Secret을 아래에 입력합니다.</li>
          <li>
            인증 유형(type)은 <strong>SELF</strong> (직접 운영)를 사용합니다.
          </li>
        </ol>
      </CollapsibleGuide>

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
            placeholder="예: 본사 스마트스토어"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="clientId" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Client ID (애플리케이션 ID)
          </label>
          <input
            id="clientId"
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={clientIdPlaceholder}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="clientSecret" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Client Secret (애플리케이션 시크릿)
          </label>
          <input
            id="clientSecret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="new-password"
            placeholder={clientSecretPlaceholder}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="authType" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            type
          </label>
          <input id="authType" type="text" value={authType} readOnly className={`${inputClass} bg-zinc-50 dark:bg-zinc-800`} />
          <p className="mt-1 text-xs text-zinc-500">직접 운영(SELF) 방식 — 판매자 본인 스토어 애플리케이션 연동</p>
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
            onClick={() => void handleFetchOrders()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            {busyAction === 'fetch' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            주문 수집
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

      {previewRows.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            수집 미리보기 {fetchMeta ? `(${fetchMeta.count}건)` : ''}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-100 dark:bg-zinc-800">
                <tr>
                  {SMARTSTORE_PREVIEW_HEADERS.map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${row['상품주문번호']}-${index}`} className="border-t border-zinc-200 dark:border-zinc-700">
                    {SMARTSTORE_PREVIEW_HEADERS.map((header) => (
                      <td key={header} className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">
                        {row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
