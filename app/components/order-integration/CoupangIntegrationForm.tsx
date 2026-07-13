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
  COUPANG_PREVIEW_HEADERS,
  type CoupangPreviewRow,
} from '@/app/lib/coupang/map-coupang-orders';

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

export function CoupangIntegrationForm() {
  const outboundIp = getExcloadOutboundIp();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<CoupangAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [apiKeyExpiry, setApiKeyExpiry] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<CoupangPreviewRow[]>([]);
  const [fetchMeta, setFetchMeta] = useState<{ count: number; failedStatusCount: number } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<unknown>(null);
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
        throw new Error(data.error ?? '?°ë™ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??');
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
        text: error instanceof Error ? error.message : '?°ë™ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??',
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
        // transport ?•ë³´??ë¶€ê°€ ?ˆë‚´??
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
      if (!res.ok) throw new Error(data.error ?? '?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(data.account ?? null);
      setAccessKey('');
      setSecretKey('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'ì¿ íŒ¡ ?°ë™ ?•ë³´ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤.',
      });
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.',
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
      if (!res.ok) throw new Error(data.error ?? '?°ê²° ?ŒìŠ¤?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'ì¿ íŒ¡ API ?°ê²°???•ìƒ ?•ì¸?˜ì—ˆ?µë‹ˆ??',
      });
      await loadSavedAccount();
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '?°ê²° ?ŒìŠ¤?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.',
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
    setDebugInfo(null);
    try {
      const res = await fetch('/api/order/integration/coupang/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: CoupangPreviewRow[];
        count?: number;
        failedStatusCount?: number;
        debug?: unknown;
      };
      if (!res.ok) throw new Error(data.error ?? 'ì£¼ë¬¸ ?˜ì§‘???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({
        count: data.count ?? data.previewRows?.length ?? 0,
        failedStatusCount: data.failedStatusCount ?? 0,
      });
      setDebugInfo(data.debug ?? null);
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `ì¿ íŒ¡ ì£¼ë¬¸ ${data.count ?? 0}ê±´ì„ ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.`,
      });
      await loadSavedAccount();
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'ì£¼ë¬¸ ?˜ì§‘???¤íŒ¨?ˆìŠµ?ˆë‹¤.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('?€?¥ëœ ì¿ íŒ¡ ?°ë™ ?•ë³´ë¥??? œ? ê¹Œ??')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/coupang', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ë™ ?´ì œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(null);
      setAccountName('');
      setVendorCode('');
      setAccessKey('');
      setSecretKey('');
      setApiKeyExpiry('');
      setPreviewRows([]);
      setFetchMeta(null);
      setDebugInfo(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? 'ì¿ íŒ¡ ?°ë™???´ì œ?˜ì—ˆ?µë‹ˆ??',
      });
    } catch (error) {
      setStatusMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '?°ë™ ?´ì œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  const accessKeyPlaceholder = savedAccount?.hasAccessKey
    ? `?€?¥ë¨: ${savedAccount.accessKeyMasked || '****'}`
    : 'Access Key ?…ë ¥';
  const secretKeyPlaceholder = savedAccount?.hasSecretKey
    ? `?€?¥ë¨: ${savedAccount.secretKeyMasked || '********'} (ë³€ê²??œì—ë§??…ë ¥)`
    : 'Secret Key ?…ë ¥ (?€?????„ì²´ ?¸ì¶œ?˜ì? ?ŠìŠµ?ˆë‹¤)';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-10 sm:px-6">
      <Link
        href="/order/integration/connect"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        ì£¼ë¬¸?°ë™ ëª©ë¡
      </Link>

      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">ì¿ íŒ¡ ?°ë™</h1>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        ì¿ íŒ¡ Wing Open API ?•ë³´ë¥??€?¥í•œ ???°ê²° ?ŒìŠ¤?¸ì? ì£¼ë¬¸ ?˜ì§‘??ì§„í–‰?????ˆìŠµ?ˆë‹¤.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">?°ë™ ?•ë³´ ë¶ˆëŸ¬?¤ëŠ” ì¤‘â€?/p> : null}

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API ?¸ì¶œ ê²½ë¡œ: <strong>{transportInfo.mode === 'proxy' ? 'ê³ ì • IP ?„ë¡?? : 'Vercel ì§ì ‘ ?¸ì¶œ'}</strong>
          {transportInfo.mode === 'direct' ? (
            <span className="mt-1 block text-xs opacity-90">
              ê³ ì • IP ?•ë³´ ??ê´€ë¦¬ì ?ŒìŠ¤???„ìš©?…ë‹ˆ?? ?´ì˜ ??COUPANG_PROXY_BASE_URL ?„ë¡?œë? ?¤ì •?˜ì„¸??
            </span>
          ) : (
            <span className="mt-1 block text-xs opacity-90">
              ì¿ íŒ¡ WING?ëŠ” ?„ë¡???œë²„??ê³ ì • IP(NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP)ë¥??±ë¡?˜ì„¸??
            </span>
          )}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          ìµœê·¼ ?¤ë¥˜: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">?‘í´ë¡œë“œ ?•ë³´ (?ë§¤?ì„¼???±ë¡??</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="?…ì²´ëª? value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow
            label="IP ì£¼ì†Œ"
            value={outboundIp}
            placeholder="NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP ?˜ê²½ë³€???¤ì • ?„ìš”"
          />
        </dl>
      </section>

      <CollapsibleGuide title="API ë°œê¸‰ ë°©ë²• ë³´ê¸° (ì¿ íŒ¡)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>ì¿ íŒ¡ Wing ?ë§¤?ì„¼????Open API ë©”ë‰´ë¡??´ë™?©ë‹ˆ??</li>
          <li>?…ì²´ëª?<strong>?‘í´ë¡œë“œ</strong>, URL <strong>https://www.excload.com</strong>, IP???‘í´ë¡œë“œ ê³ ì • IPë¥??±ë¡?©ë‹ˆ??</li>
          <li>Access Key, Secret Keyë¥?ë°œê¸‰ë°›ì•„ ?„ë˜???…ë ¥?©ë‹ˆ??</li>
          <li>API ??ë§Œë£Œ?¼ì„ ?¨ê»˜ ?…ë ¥?˜ë©´ ê°±ì‹  ?Œë¦¼???œìš©?????ˆìŠµ?ˆë‹¤.</li>
        </ol>
      </CollapsibleGuide>

      <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="accountName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            ê³„ì •ëª?
          </label>
          <input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="?? ë³¸ì‚¬ ì¿ íŒ¡ ê³„ì •"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="vendorCode" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            ì¿ íŒ¡ ?…ì²´ì½”ë“œ
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

        <div>
          <label htmlFor="secretKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Secret Key
          </label>
          <input
            id="secretKey"
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            autoComplete="new-password"
            placeholder={secretKeyPlaceholder}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="apiKeyExpiry" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            API ??ë§Œë£Œ??(ê°±ì‹  ?Œë¦¼??
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
            ?€??
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleTest()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busyAction === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            ?°ê²° ?ŒìŠ¤??
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleFetchOrders()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            {busyAction === 'fetch' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            ì£¼ë¬¸ ?˜ì§‘
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={() => void handleDisconnect()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            ?°ë™ ?´ì œ
          </button>
        </div>
      </form>

      {fetchMeta ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          ?˜ì§‘ ê²°ê³¼: {fetchMeta.count}ê±?
          {fetchMeta.failedStatusCount > 0 ? ` Â· ?íƒœë³?ì¡°íšŒ ?¤íŒ¨ ${fetchMeta.failedStatusCount}ê±? : ''}
        </p>
      ) : null}

      {previewRows.length > 0 ? (
        <section className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                {COUPANG_PREVIEW_HEADERS.map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {previewRows.map((row, index) => (
                <tr key={`${row['ì£¼ë¬¸ë²ˆí˜¸']}-${row['ë¬¶ìŒë°°ì†¡ë²ˆí˜¸']}-${index}`}>
                  {COUPANG_PREVIEW_HEADERS.map((header) => (
                    <td key={header} className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                      {row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            ë¯¸ë¦¬ë³´ê¸°?…ë‹ˆ?? ?´í›„ ?ë°°ì£¼ë¬¸ë³€??ë¯¸ë¦¬ë³´ê¸° ?Œì´?„ë¼?¸ê³¼ ?°ê²°?????ˆìŠµ?ˆë‹¤.
          </p>
        </section>
      ) : null}

      {debugInfo ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDebug((prev) => !prev)}
            className="text-xs font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            {showDebug ? 'ê´€ë¦¬ì ?”ë²„ê·??•ë³´ ?¨ê¸°ê¸? : 'ê´€ë¦¬ì ?”ë²„ê·??•ë³´ ë³´ê¸°'}
          </button>
          {showDebug ? (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
