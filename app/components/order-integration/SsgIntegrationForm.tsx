'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { SSG_PREVIEW_HEADERS, type SsgPreviewRow } from '@/app/lib/ssg/map-ssg-orders';

type SsgAccountResponse = {
  id: string;
  accountName: string;
  vendorCode: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
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

export function SsgIntegrationForm() {
  const outboundIp = getExcloadOutboundIp();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<SsgAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<SsgPreviewRow[]>([]);
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
      const res = await fetch('/api/order/integration/ssg');
      const data = (await res.json()) as { account?: SsgAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setVendorCode(account.vendorCode);
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
        const res = await fetch('/api/order/integration/ssg/transport');
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
      const res = await fetch('/api/order/integration/ssg/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          vendorCode,
          apiKey: apiKey || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: SsgAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setApiKey('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'SSG 연동 정보가 저장되었습니다.',
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
      const res = await fetch('/api/order/integration/ssg/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'SSG API 연결이 정상 확인되었습니다.',
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
      const res = await fetch('/api/order/integration/ssg/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: SsgPreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? '주문 수집에 실패했습니다.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `SSG 주문 ${data.count ?? 0}건을 불러왔습니다.`,
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
    if (!window.confirm('저장된 SSG 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/ssg', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setVendorCode('');
      setApiKey('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? 'SSG 연동이 해제되었습니다.',
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

  const apiKeyPlaceholder = savedAccount?.hasApiKey
    ? `저장됨: ${savedAccount.apiKeyMasked || '********'} (변경 시에만 입력)`
    : 'API 인증키 입력 (Authorization 헤더, 저장 후 전체 노출되지 않습니다)';

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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">SSG.COM 연동</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          베타
        </span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        API 인증키 저장 후 연결 테스트와 주문 조회·수집(배송지시·출고대상)을 진행할 수 있습니다. 발주확인·송장
        전송·상태 변경은 포함하지 않습니다.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.mode === 'proxy' ? (
            <span className="mt-1 block text-xs opacity-90">
              SSG 파트너오피스 API회원정보관리에 엑클로드 고정 IP({outboundIp || '54.180.45.46'})를 등록하세요.
            </span>
          ) : (
            <span className="mt-1 block text-xs opacity-90">
              SSG API는 Vercel 직접 호출을 지원하지 않습니다. INTEGRATION_PROXY_BASE_URL을 설정해 주세요.
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

      <CollapsibleGuide title="API 발급 방법 보기 (SSG.COM)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://po.ssgadm.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              SSG 파트너오피스
            </a>
            에 로그인합니다.
          </li>
          <li>API회원정보관리에서 운영·테스트 서버 IP에 엑클로드 고정 IP를 각각 등록합니다.</li>
          <li>이메일로 발송된 API 인증키를 활성화한 뒤, 협력사코드(로그인 ID)와 함께 입력합니다.</li>
          <li>
            API 문서는{' '}
            <a
              href="https://eapi.ssgadm.com/info/main.ssg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              SSG Open API
            </a>
            에서 확인할 수 있습니다.
          </li>
        </ol>
      </CollapsibleGuide>

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
            placeholder="예: 본사 SSG"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="vendorCode" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            협력사코드 (로그인 ID)
          </label>
          <input
            id="vendorCode"
            type="text"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value)}
            placeholder="파트너오피스 로그인 ID"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="apiKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            API 인증키
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="new-password"
            placeholder={apiKeyPlaceholder}
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

      {fetchMeta ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            수집 결과 미리보기 ({fetchMeta.count}건)
          </h2>
          {previewRows.length ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    {SSG_PREVIEW_HEADERS.map((header) => (
                      <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-t border-zinc-100 dark:border-zinc-800">
                      {SSG_PREVIEW_HEADERS.map((header) => (
                        <td key={header} className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-300">
                          {row[header]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">최근 7일 이내 배송지시·출고대상 주문이 없습니다.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
