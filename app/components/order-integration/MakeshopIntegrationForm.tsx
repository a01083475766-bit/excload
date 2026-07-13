'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { EXCLOAD_MAKESHOP_OUTBOUND_IP } from '@/app/lib/makeshop/api-spec';
import {
  MAKESHOP_PREVIEW_HEADERS,
  type MakeshopPreviewRow,
} from '@/app/lib/makeshop/map-makeshop-orders';

type MakeshopAccountResponse = {
  id: string;
  accountName: string;
  shopId: string;
  mallDomain: string;
  oauthConfigured: boolean;
  hasClientIdOverride: boolean;
  hasClientSecretOverride: boolean;
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

export function MakeshopIntegrationForm({ embedded = false }: { embedded?: boolean } = {}) {
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<MakeshopAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [shopId, setShopId] = useState('');
  const [mallDomain, setMallDomain] = useState('');
  const [clientIdOverride, setClientIdOverride] = useState('');
  const [clientSecretOverride, setClientSecretOverride] = useState('');
  const [clearOAuthOverride, setClearOAuthOverride] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<MakeshopPreviewRow[]>([]);
  const [fetchMeta, setFetchMeta] = useState<{ count: number } | null>(null);
  const [transportInfo, setTransportInfo] = useState<{
    mode: 'direct' | 'proxy';
    oauthConfigured?: boolean;
    notes?: string;
  } | null>(null);

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const loadSavedAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/order/integration/makeshop');
      const data = (await res.json()) as { account?: MakeshopAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setShopId(account.shopId);
        setMallDomain(account.mallDomain);
        setClientIdOverride('');
        setClientSecretOverride('');
        setClearOAuthOverride(false);
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
        const res = await fetch('/api/order/integration/makeshop/transport');
        const data = (await res.json()) as {
          transport?: { mode: 'direct' | 'proxy' };
          oauthConfigured?: boolean;
          notes?: string;
        };
        if (res.ok && data.transport) {
          setTransportInfo({
            mode: data.transport.mode,
            oauthConfigured: data.oauthConfigured,
            notes: data.notes,
          });
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
      const res = await fetch('/api/order/integration/makeshop/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          shopId,
          mallDomain: mallDomain || undefined,
          clientIdOverride: clientIdOverride || undefined,
          clientSecretOverride: clientSecretOverride || undefined,
          clearOAuthOverride,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: MakeshopAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setClientIdOverride('');
      setClientSecretOverride('');
      setClearOAuthOverride(false);
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '메이크샵 연동 정보가 저장되었습니다.',
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
      const res = await fetch('/api/order/integration/makeshop/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '메이크샵 APP API 연결이 정상 확인되었습니다.',
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
      const res = await fetch('/api/order/integration/makeshop/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: MakeshopPreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? '주문 수집에 실패했습니다.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `메이크샵 주문 ${data.count ?? 0}건을 불러왔습니다.`,
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
    if (!window.confirm('저장된 메이크샵 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/makeshop', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setShopId('');
      setMallDomain('');
      setClientIdOverride('');
      setClientSecretOverride('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '메이크샵 연동이 해제되었습니다.',
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">메이크샵 연동</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          베타
        </span>
      </div>
      ) : (
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">연동 정보 입력</h2>
      )}
{!embedded ? (
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        메이크샵 신규 APP API(connect.makeshop.co.kr)로 연결 테스트와 주문 2.0 조회·수집을 진행할 수 있습니다.
        레거시 상점도메인 Open API·발주·송장·Webhook은 포함하지 않습니다.
      </p>      ) : (
        <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">쇼핑몰에서 발급한 값을 입력한 뒤 연결 테스트와 저장을 진행합니다.</p>
      )}

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
        <strong>Client ID / Client Secret</strong>은 엑클로드 APP 공통 값으로 서버 env에 등록됩니다. 판매자는{' '}
        <strong>shop_uid</strong>만 입력하면 됩니다.
        <span className="mt-1 block">
          APP 접근 허용 IP <strong>{EXCLOAD_MAKESHOP_OUTBOUND_IP}</strong> 등록과 샵스토어 APP 설치가 필요합니다.
        </span>
      </p>

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.oauthConfigured === false ? (
            <span className="mt-1 block text-xs font-semibold text-amber-800 dark:text-amber-200">
              MAKESHOP_CLIENT_ID/MAKESHOP_CLIENT_SECRET이 아직 서버에 설정되지 않았습니다. 실연동 전 Vercel env 등록
              또는 개발용 override가 필요합니다.
            </span>
          ) : null}
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
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">엑클로드 APP 등록용 정보</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow label="접근 허용 IP" value={EXCLOAD_MAKESHOP_OUTBOUND_IP} />
        </dl>
      </section>
      ) : null}

{!embedded ? (
      <CollapsibleGuide title="연동 준비 방법 보기 (메이크샵 APP API)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://developer.makeshop.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              developer.makeshop.co.kr
            </a>
            · partner.makeshop.co.kr에서 APP 등록
          </li>
          <li>개발 정보 → 접근 허용 IP에 {EXCLOAD_MAKESHOP_OUTBOUND_IP} 등록, 주문 Read scope 선택</li>
          <li>MAKESHOP_CLIENT_ID / MAKESHOP_CLIENT_SECRET을 Vercel env에 등록</li>
          <li>판매자 샵스토어에서 엑클로드 APP 설치 후 shop_uid 확인</li>
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
            placeholder="예: 본사 메이크샵"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="shopId" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            shop_uid (상점 ID)
          </label>
          <input
            id="shopId"
            type="text"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            placeholder="예: myshop"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="mallDomain" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            쇼핑몰 도메인 (선택)
          </label>
          <input
            id="mallDomain"
            type="text"
            value={mallDomain}
            onChange={(e) => setMallDomain(e.target.value)}
            placeholder="예: shop.example.com"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">계정 구분용입니다. API 호출 host는 connect.makeshop.co.kr입니다.</p>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300"
          >
            개발·내부용 (OAuth override)
            {showAdvanced ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {showAdvanced ? (
            <div className="space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">
                운영 환경에서는 Vercel env <code>MAKESHOP_CLIENT_ID</code>, <code>MAKESHOP_CLIENT_SECRET</code>을
                사용합니다. 로컬·스테이징 테스트 시에만 override를 입력하세요.
              </p>
              <input
                id="clientIdOverride"
                type="password"
                value={clientIdOverride}
                onChange={(e) => setClientIdOverride(e.target.value)}
                autoComplete="new-password"
                placeholder={
                  savedAccount?.hasClientIdOverride
                    ? 'Client ID override 저장됨 (변경 시에만 입력)'
                    : 'Client ID override (선택)'
                }
                className={inputClass}
              />
              <input
                id="clientSecretOverride"
                type="password"
                value={clientSecretOverride}
                onChange={(e) => setClientSecretOverride(e.target.value)}
                autoComplete="new-password"
                placeholder={
                  savedAccount?.hasClientSecretOverride
                    ? 'Client Secret override 저장됨 (변경 시에만 입력)'
                    : 'Client Secret override (선택)'
                }
                className={inputClass}
              />
              {savedAccount?.hasClientIdOverride || savedAccount?.hasClientSecretOverride ? (
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={clearOAuthOverride}
                    onChange={(e) => setClearOAuthOverride(e.target.checked)}
                  />
                  저장된 OAuth override 삭제
                </label>
              ) : null}
            </div>
          ) : null}
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
          <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">
            수집 미리보기 ({fetchMeta.count}건)
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-100 dark:bg-zinc-800">
                <tr>
                  {MAKESHOP_PREVIEW_HEADERS.map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${row['주문번호']}-${index}`} className="border-t border-zinc-200 dark:border-zinc-700">
                    {MAKESHOP_PREVIEW_HEADERS.map((header) => (
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
