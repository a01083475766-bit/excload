'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES } from '@/app/lib/cjonstyle/api-spec';
import {
  CJONSTYLE_PREVIEW_HEADERS,
  type CjonstylePreviewRow,
} from '@/app/lib/cjonstyle/map-cjonstyle-orders';

type CjonstyleAccountResponse = {
  id: string;
  accountName: string;
  vendorCode: string;
  deliveryMethodCodes: string[];
  authenticationKeyMasked: string;
  hasAuthenticationKey: boolean;
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

export function CjonstyleIntegrationForm() {
  const outboundIp = getExcloadOutboundIp() || '54.180.45.46';
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<CjonstyleAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [authenticationKey, setAuthenticationKey] = useState('');
  const [deliveryMethodCode, setDeliveryMethodCode] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<CjonstylePreviewRow[]>([]);
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
      const res = await fetch('/api/order/integration/cjonstyle');
      const data = (await res.json()) as { account?: CjonstyleAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '?°ë™ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setVendorCode(account.vendorCode);
        setDeliveryMethodCode(account.deliveryMethodCodes.join(','));
        setAuthenticationKey('');
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
        const res = await fetch('/api/order/integration/cjonstyle/transport');
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
      const res = await fetch('/api/order/integration/cjonstyle/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          vendorCode,
          authenticationKey: authenticationKey || undefined,
          deliveryMethodCode: deliveryMethodCode || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: CjonstyleAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(data.account ?? null);
      setAuthenticationKey('');
      if (data.account?.deliveryMethodCodes.length) {
        setDeliveryMethodCode(data.account.deliveryMethodCodes.join(','));
      }
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'CJ?¨ìŠ¤?€???°ë™ ?•ë³´ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤.',
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
      const res = await fetch('/api/order/integration/cjonstyle/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ê²° ?ŒìŠ¤?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'CJ?¨ìŠ¤?€??API ?°ê²°???•ìƒ ?•ì¸?˜ì—ˆ?µë‹ˆ??',
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
      const res = await fetch('/api/order/integration/cjonstyle/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: CjonstylePreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? 'ì£¼ë¬¸ ?˜ì§‘???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `CJ?¨ìŠ¤?€??ì£¼ë¬¸ ${data.count ?? 0}ê±´ì„ ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.`,
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
    if (!window.confirm('?€?¥ëœ CJ?¨ìŠ¤?€???°ë™ ?•ë³´ë¥??? œ? ê¹Œ??')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/cjonstyle', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ë™ ?´ì œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(null);
      setAccountName('');
      setVendorCode('');
      setAuthenticationKey('');
      setDeliveryMethodCode('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? 'CJ?¨ìŠ¤?€???°ë™???´ì œ?˜ì—ˆ?µë‹ˆ??',
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

  const authKeyPlaceholder = savedAccount?.hasAuthenticationKey
    ? `?€?¥ë¨: ${savedAccount.authenticationKeyMasked || '********'} (ë³€ê²??œì—ë§??…ë ¥)`
    : 'authenticationKey ?…ë ¥ (Header, ?€?????„ì²´ ?¸ì¶œ?˜ì? ?ŠìŠµ?ˆë‹¤)';

  const defaultDeliveryCodes = CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES.join(',');

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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">CJ?¨ìŠ¤?€???°ë™</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          ë² í?
        </span>
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          restricted
        </span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        ?…ì  ?‘ë ¥???„ìš© ?œì? APIë¡??°ê²° ?ŒìŠ¤?¸ì? ì£¼ë¬¸ ì¡°íšŒÂ·?˜ì§‘(ë°°ì†¡?€?…ë³„)??ì§„í–‰?????ˆìŠµ?ˆë‹¤. ë°œì£¼?•ì¸Â·?¡ì¥
        ?„ì†¡Â·?íƒœ ë³€ê²?POST API???¬í•¨?˜ì? ?ŠìŠµ?ˆë‹¤.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">?°ë™ ?•ë³´ ë¶ˆëŸ¬?¤ëŠ” ì¤‘â€?/p> : null}

      <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
        <strong>?°ë™ ë°©ì‹: ì§ì ‘ê°œë°œ</strong>
        <span className="mt-1 block">
          ?´ì˜?œë²„ IP: <strong>{outboundIp}</strong>
        </span>
        <span className="mt-1 block text-xs opacity-90">
          CJ?¨ìŠ¤?€???…ì  ?‘ë ¥??ê³„ì •?ì„œ API ?•ë³´ê´€ë¦?ë©”ë‰´ë¥??µí•´ ?¸ì¦?¤ë? ë°œê¸‰ë°›ì•„???©ë‹ˆ?? ?‘í´ë¡œë“œ???„ì¬ CJ
          ?¬ì „?±ë¡ ?€?¬íˆ´???„ë‹ˆë¯€ë¡??€?¬íˆ´ ? íƒ ë°©ì‹???„ë‹ˆ??ì§ì ‘ê°œë°œ ë°©ì‹?¼ë¡œ ?ˆë‚´?©ë‹ˆ??
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
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">?‘í´ë¡œë“œ ?•ë³´ (?ŒíŠ¸???±ë¡??</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="?…ì²´ëª? value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow label="IP ì£¼ì†Œ (?´ì˜?œë²„)" value={outboundIp} />
        </dl>
      </section>

      <CollapsibleGuide title="API ë°œê¸‰ ë°©ë²• ë³´ê¸° (CJ?¨ìŠ¤?€??">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://partners.cjonstyle.com/standardApi/apiGuide"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              CJ?¨ìŠ¤?€???ŒíŠ¸?ˆì‹œ?¤í…œ
            </a>
            ???…ì  ?‘ë ¥??ê³„ì •?¼ë¡œ ë¡œê·¸?¸í•©?ˆë‹¤.
          </li>
          <li>API ê´€ë¦???API ?•ë³´ê´€ë¦???ê¸°ë³¸?•ë³´ ?±ë¡</li>
          <li>
            ?°ë™ ë°©ë²•: <strong>ì§ì ‘ê°œë°œ</strong> ? íƒ, ?´ì˜?œë²„ IP??<strong>{outboundIp}</strong> ?±ë¡
          </li>
          <li>API ?¸ì¦??ë°œê¸‰ ??vendorCode(6???€ authenticationKeyë¥??…ë ¥?©ë‹ˆ??</li>
          <li>ì£¼ë¬¸ API PathÂ·Query ëª…ì¹­?€ ?ŒíŠ¸??Docs ?•ì¸ ??ë°˜ì˜?©ë‹ˆ???„ì¬ placeholder).</li>
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
            placeholder="?? ë³¸ì‚¬ CJ?¨ìŠ¤?€??
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="vendorCode" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            vendorCode (?‘ë ¥?…ì²´ì½”ë“œ, 6??
          </label>
          <input
            id="vendorCode"
            type="text"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="?? AB1234"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="authenticationKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            authenticationKey
          </label>
          <input
            id="authenticationKey"
            type="password"
            value={authenticationKey}
            onChange={(e) => setAuthenticationKey(e.target.value)}
            autoComplete="new-password"
            placeholder={authKeyPlaceholder}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="deliveryMethodCode"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            ë°°ì†¡?€??ì½”ë“œ (? íƒ)
          </label>
          <input
            id="deliveryMethodCode"
            type="text"
            value={deliveryMethodCode}
            onChange={(e) => setDeliveryMethodCode(e.target.value)}
            placeholder={`ë¯¸ì…????${defaultDeliveryCodes} ?„ì²´ ?˜ì§‘ (?¼í‘œ êµ¬ë¶„)`}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">
            ë°°ì†¡?€?…ë³„ APIë¥??œíšŒ????ì£¼ë¬¸ë²ˆí˜¸ ê¸°ì??¼ë¡œ ì¤‘ë³µ ?œê±°?©ë‹ˆ?? ?™ì¼ ì¡°í•©?¼ë¡œ ë³µìˆ˜ ì±„ë„??ë§Œë“¤ë©?ì¤‘ë³µ
            ?˜ì§‘?????ˆìŠµ?ˆë‹¤.
          </p>
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
                    {CJONSTYLE_PREVIEW_HEADERS.map((header) => (
                      <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-t border-zinc-100 dark:border-zinc-800">
                      {CJONSTYLE_PREVIEW_HEADERS.map((header) => (
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
            <p className="text-sm text-zinc-500">ìµœê·¼ 7???´ë‚´ ?´ë‹¹ ë°°ì†¡?€??ì£¼ë¬¸???†ìŠµ?ˆë‹¤.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
