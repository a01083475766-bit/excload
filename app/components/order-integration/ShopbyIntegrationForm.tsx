'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import {
  SHOPBY_PREVIEW_HEADERS,
  type ShopbyPreviewRow,
} from '@/app/lib/shopby/map-shopby-orders';

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

export function ShopbyIntegrationForm() {
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<ShopbyAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [mallDomain, setMallDomain] = useState('');
  const [mallKey, setMallKey] = useState('');
  const [systemKey, setSystemKey] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<ShopbyPreviewRow[]>([]);
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
      const res = await fetch('/api/order/integration/shopby');
      const data = (await res.json()) as { account?: ShopbyAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '?°ë™ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??');
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
        const res = await fetch('/api/order/integration/shopby/transport');
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
      if (!res.ok) throw new Error(data.error ?? '?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(data.account ?? null);
      setMallKey('');
      setSystemKey('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '?µë°”???°ë™ ?•ë³´ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤.',
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
      const res = await fetch('/api/order/integration/shopby/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ê²° ?ŒìŠ¤?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '?µë°”??Server API ?°ê²°???•ìƒ ?•ì¸?˜ì—ˆ?µë‹ˆ??',
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
      const res = await fetch('/api/order/integration/shopby/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: ShopbyPreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? 'ì£¼ë¬¸ ?˜ì§‘???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `?µë°”??ì£¼ë¬¸ ${data.count ?? 0}ê±´ì„ ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.`,
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
    if (!window.confirm('?€?¥ëœ ?µë°”???°ë™ ?•ë³´ë¥??? œ? ê¹Œ??')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/shopby', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ë™ ?´ì œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(null);
      setAccountName('');
      setMallDomain('');
      setMallKey('');
      setSystemKey('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '?µë°”???°ë™???´ì œ?˜ì—ˆ?µë‹ˆ??',
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

  const mallKeyPlaceholder = savedAccount?.hasMallKey
    ? `?€?¥ë¨: ${savedAccount.mallKeyMasked || '********'} (ë³€ê²??œì—ë§??…ë ¥)`
    : 'mallKey(?¸ë? ?°ë™?? ?…ë ¥ (?€?????„ì²´ ?¸ì¶œ?˜ì? ?ŠìŠµ?ˆë‹¤)';

  const systemKeyPlaceholder = savedAccount?.hasSystemKey
    ? `?€?¥ë¨: ${savedAccount.systemKeyMasked || '********'} (ë³€ê²??œì—ë§??…ë ¥)`
    : 'systemKey(?Œí¬?¤í˜?´ìŠ¤ ?? ?…ë ¥ (?€?????„ì²´ ?¸ì¶œ?˜ì? ?ŠìŠµ?ˆë‹¤)';

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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">NHNì»¤ë¨¸???µë°”???°ë™</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          ë² í?
        </span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        ?µë°”??Server API(mallKey ë°©ì‹)ë¡??°ê²° ?ŒìŠ¤?¸ì? ì£¼ë¬¸ ì¡°íšŒÂ·?˜ì§‘??ì§„í–‰?????ˆìŠµ?ˆë‹¤. ë°œì£¼?•ì¸Â·?¡ì¥ ?„ì†¡Â·?íƒœ
        ë³€ê²½Â·Webhook?€ ?¬í•¨?˜ì? ?ŠìŠµ?ˆë‹¤.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">?°ë™ ?•ë³´ ë¶ˆëŸ¬?¤ëŠ” ì¤‘â€?/p> : null}

      <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
        <strong>NHN Server API ?¸ì¶œ IP ?±ë¡?€ ë¶ˆí•„??/strong>?©ë‹ˆ??
        <span className="mt-1 block">
          ?‘í´ë¡œë“œ êµ¬ì¡°??<strong>ê³ ì • IP ?„ë¡??/strong>ë¥??µí•´ <code className="text-xs">server-api.e-ncp.com</code>??
          ?¸ì¶œ?©ë‹ˆ??
        </span>
      </p>

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API ?¸ì¶œ ê²½ë¡œ:{' '}
          <strong>{transportInfo.mode === 'proxy' ? 'ê³ ì • IP ?„ë¡?? : '?„ë¡??ë¯¸ì„¤??}</strong>
          {transportInfo.notes ? <span className="mt-1 block text-xs opacity-90">{transportInfo.notes}</span> : null}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          ìµœê·¼ ?¤ë¥˜: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">?‘í´ë¡œë“œ ?•ë³´</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="?…ì²´ëª? value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
        </dl>
      </section>

      <CollapsibleGuide title="API ??ë°œê¸‰ ë°©ë²• ë³´ê¸° (?µë°”??">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://workspace-help.nhn-commerce.com/contents/faq/server-api-1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              ?µë°”??Server API ?¸ì¶œ ê°€?´ë“œ
            </a>
            ë¥?ì°¸ê³ ?©ë‹ˆ??
          </li>
          <li>?Œí¬?¤í˜?´ìŠ¤ ???€?¬ì–´?œë? ????App) ?±ë¡ ??systemKey ë°œê¸‰</li>
          <li>?œë¹„?¤ì–´?œë? ???¼í•‘ëª?ê´€ë¦???ê°œë°œ?°ë™?•ë³´ ???¸ë? ?°ë™??mallKey) ?•ì¸</li>
          <li>
            API ë¬¸ì„œ:{' '}
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

      <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="accountName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            ?‘ì†ë³„ì¹­ (ê³„ì •ëª?
          </label>
          <input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="?? ë³¸ì‚¬ ?µë°”?´ëª°"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mallDomain" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            ?¼í•‘ëª??„ë©”???ëŠ” ?¼í•‘ëª°ëª… (? íƒ)
          </label>
          <input
            id="mallDomain"
            type="text"
            value={mallDomain}
            onChange={(e) => setMallDomain(e.target.value)}
            placeholder="?? myshop.shopby.co.kr"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">ê³„ì • êµ¬ë¶„?©ì…?ˆë‹¤. API ?¸ì¶œ?ëŠ” ?¬ìš©?˜ì? ?ŠìŠµ?ˆë‹¤.</p>
        </div>

        <div>
          <label htmlFor="systemKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            systemKey (?Œí¬?¤í˜?´ìŠ¤ ??
          </label>
          <input
            id="systemKey"
            type="password"
            value={systemKey}
            onChange={(e) => setSystemKey(e.target.value)}
            autoComplete="new-password"
            placeholder={systemKeyPlaceholder}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mallKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            mallKey (?¸ë? ?°ë™??
          </label>
          <input
            id="mallKey"
            type="password"
            value={mallKey}
            onChange={(e) => setMallKey(e.target.value)}
            autoComplete="new-password"
            placeholder={mallKeyPlaceholder}
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
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            ?˜ì§‘ ê²°ê³¼ ë¯¸ë¦¬ë³´ê¸° ({fetchMeta.count}ê±?
          </h2>
          {previewRows.length ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    {SHOPBY_PREVIEW_HEADERS.map((header) => (
                      <th
                        key={header}
                        className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-t border-zinc-100 dark:border-zinc-800">
                      {SHOPBY_PREVIEW_HEADERS.map((header) => (
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
            <p className="text-sm text-zinc-500">ìµœê·¼ 7???´ë‚´ ì¡°íšŒ ?€??ì£¼ë¬¸???†ìŠµ?ˆë‹¤.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
