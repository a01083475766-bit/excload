'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { CAFE24_OAUTH_REDIRECT_URI } from '@/app/lib/cafe24/client';
import {
  CAFE24_PREVIEW_HEADERS,
  type Cafe24PreviewRow,
} from '@/app/lib/cafe24/map-cafe24-orders';

type Cafe24AccountResponse = {
  id: string;
  accountName: string;
  mallId: string;
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

export function Cafe24IntegrationForm() {
  const searchParams = useSearchParams();
  const outboundIp = getExcloadOutboundIp();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<Cafe24AccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [mallId, setMallId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<Cafe24PreviewRow[]>([]);
  const [fetchMeta, setFetchMeta] = useState<{ count: number } | null>(null);
  const [transportInfo, setTransportInfo] = useState<{
    mode: 'direct' | 'proxy';
    suffixRules?: string[];
    notes?: string;
  } | null>(null);

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const loadSavedAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/order/integration/cafe24');
      const data = (await res.json()) as { account?: Cafe24AccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '?°ë™ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setMallId(account.mallId);
        setClientSecret('');
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
    const oauth = searchParams?.get('oauth');
    const message = searchParams?.get('message');
    if (oauth === 'success') {
      setStatusMessage({ kind: 'success', text: 'ì¹´í˜24 OAuth ?°ë™???„ë£Œ?˜ì—ˆ?µë‹ˆ?? ?°ê²° ?ŒìŠ¤?¸ë? ì§„í–‰??ì£¼ì„¸??' });
      void loadSavedAccount();
    } else if (oauth === 'error') {
      setStatusMessage({
        kind: 'error',
        text: message ?? 'ì¹´í˜24 OAuth ?°ë™???¤íŒ¨?ˆìŠµ?ˆë‹¤.',
      });
    }
  }, [searchParams, loadSavedAccount]);

  useEffect(() => {
    async function loadTransport() {
      try {
        const res = await fetch('/api/order/integration/cafe24/transport');
        const data = (await res.json()) as {
          transport?: { mode: 'direct' | 'proxy' };
          suffixRules?: string[];
          notes?: string;
        };
        if (res.ok && data.transport) {
          setTransportInfo({
            mode: data.transport.mode,
            suffixRules: data.suffixRules,
            notes: data.notes,
          });
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
      if (!res.ok) throw new Error(data.error ?? '?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(data.account ?? null);
      setClientSecret('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'ì¹´í˜24 ?°ë™ ?•ë³´ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤.',
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

  function handleStartOAuth() {
    window.location.href = '/api/order/integration/cafe24/authorize';
  }

  async function handleTest() {
    setBusyAction('test');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/cafe24/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ê²° ?ŒìŠ¤?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'ì¹´í˜24 API ?°ê²°???•ìƒ ?•ì¸?˜ì—ˆ?µë‹ˆ??',
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
    try {
      const res = await fetch('/api/order/integration/cafe24/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: Cafe24PreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? 'ì£¼ë¬¸ ?˜ì§‘???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `ì¹´í˜24 ì£¼ë¬¸ ${data.count ?? 0}ê±´ì„ ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.`,
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
    if (!window.confirm('?€?¥ëœ ì¹´í˜24 ?°ë™ ?•ë³´ë¥??? œ? ê¹Œ??')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/cafe24', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ë™ ?´ì œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(null);
      setAccountName('');
      setMallId('');
      setClientId('');
      setClientSecret('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? 'ì¹´í˜24 ?°ë™???´ì œ?˜ì—ˆ?µë‹ˆ??',
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

  const clientSecretPlaceholder = savedAccount?.hasClientSecret
    ? `?€?¥ë¨: ${savedAccount.clientSecretMasked || '********'} (ë³€ê²??œì—ë§??…ë ¥)`
    : 'Client Secret ?…ë ¥ (?€?????„ì²´ ?¸ì¶œ?˜ì? ?ŠìŠµ?ˆë‹¤)';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-10 sm:px-6">
      <Link
        href="/order/integration/connect"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        ì£¼ë¬¸?°ë™ ëª©ë¡
      </Link>

      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">ì¹´í˜24 ?°ë™</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          ë² í?
        </span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        ì¹´í˜24 OAuth ?°ë™ ???°ê²° ?ŒìŠ¤?¸ì? ì£¼ë¬¸ ì¡°íšŒÂ·?˜ì§‘??ì§„í–‰?????ˆìŠµ?ˆë‹¤. ë°œì£¼?•ì¸Â·?¡ì¥ ?„ì†¡Â·ì£¼ë¬¸ ?íƒœ
        ë³€ê²½ì? ?¬í•¨?˜ì? ?ŠìŠµ?ˆë‹¤.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">?°ë™ ?•ë³´ ë¶ˆëŸ¬?¤ëŠ” ì¤‘â€?/p> : null}

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API ?¸ì¶œ ê²½ë¡œ:{' '}
          <strong>{transportInfo.mode === 'proxy' ? 'ê³ ì • IP ?„ë¡?? : '?„ë¡??ë¯¸ì„¤??}</strong>
          {transportInfo.suffixRules?.length ? (
            <span className="mt-1 block text-xs opacity-90">
              ?ˆìš© suffix: {transportInfo.suffixRules.map((s) => `*.${s}`).join(', ')} (Lightsail 1??ë°˜ì˜ ?€ê¸?
            </span>
          ) : null}
        </p>
      ) : null}

      {savedAccount?.hasOAuthTokens ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('success')}`}>
          OAuth ?°ê²°??
          {savedAccount.tokenExpiresAt
            ? ` Â· access_token ë§Œë£Œ: ${new Date(savedAccount.tokenExpiresAt).toLocaleString('ko-KR')}`
            : null}
        </p>
      ) : savedAccount ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          OAuth ë¯¸ì—°ê²???ê³„ì • ?€?????Œì¹´??4 ?°ë™ ?œì‘?ì„ ?ŒëŸ¬ ê¶Œí•œ ?™ì˜ë¥??„ë£Œ??ì£¼ì„¸??
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          ìµœê·¼ ?¤ë¥˜: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">ê°œë°œ?ì„¼???±ë¡??/h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="Redirect URI" value={CAFE24_OAUTH_REDIRECT_URI} />
          <CopyableInfoRow label="Scope (1ì°?" value="mall.read_order" />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow
            label="IP ì£¼ì†Œ (?„ìš” ??"
            value={outboundIp}
            placeholder="NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP ?˜ê²½ë³€???¤ì • ?„ìš”"
          />
        </dl>
      </section>

      <CollapsibleGuide title="API ë°œê¸‰ ë°©ë²• ë³´ê¸° (ì¹´í˜24)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://developers.cafe24.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              ì¹´í˜24 ê°œë°œ?ì„¼??
            </a>
            ??App???±ë¡?©ë‹ˆ??
          </li>
          <li>
            Redirect URI??<strong>{CAFE24_OAUTH_REDIRECT_URI}</strong> ë¥??±ë¡?©ë‹ˆ??
          </li>
          <li>Scope??<strong>mall.read_order</strong> ë¥??¬í•¨?©ë‹ˆ??</li>
          <li>ë°œê¸‰??Client ID / Client Secretê³??¼í•‘ëª?mallIdë¥??„ë˜???…ë ¥?©ë‹ˆ??</li>
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
            placeholder="?? ë³¸ì‚¬ ì¹´í˜24"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mallId" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            mallId (?¼í•‘ëª?ID)
          </label>
          <input
            id="mallId"
            type="text"
            value={mallId}
            onChange={(e) => setMallId(e.target.value)}
            placeholder="?? yourmall"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="clientId" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Client ID
          </label>
          <input
            id="clientId"
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="ê°œë°œ?ì„¼??App Client ID"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="clientSecret" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Client Secret
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
            ?€??
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount}
            onClick={handleStartOAuth}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-60"
          >
            ì¹´í˜24 ?°ë™ ?œì‘
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount?.hasOAuthTokens}
            onClick={() => void handleTest()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busyAction === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            ?°ê²° ?ŒìŠ¤??
          </button>
          <button
            type="button"
            disabled={busyAction !== null || !savedAccount?.hasOAuthTokens}
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
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            ?˜ì§‘ ê²°ê³¼ ë¯¸ë¦¬ë³´ê¸° ({fetchMeta.count}ê±?
          </h2>
          {previewRows.length ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    {CAFE24_PREVIEW_HEADERS.map((header) => (
                      <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-t border-zinc-100 dark:border-zinc-800">
                      {CAFE24_PREVIEW_HEADERS.map((header) => (
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
            <p className="text-sm text-zinc-500">ìµœê·¼ 7???´ë‚´ ?˜ì§‘ ê°€?¥í•œ ì£¼ë¬¸???†ìŠµ?ˆë‹¤.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
