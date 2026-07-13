'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { EXCLOAD_GODOMALL_OUTBOUND_IP } from '@/app/lib/godomall/api-spec';
import {
  GODOMALL_PREVIEW_HEADERS,
  type GodomallPreviewRow,
} from '@/app/lib/godomall/map-godomall-orders';

type GodomallAccountResponse = {
  id: string;
  accountName: string;
  mallDomain: string;
  mallSno: string;
  userKeyMasked: string;
  hasUserKey: boolean;
  hasPartnerKeyOverride: boolean;
  partnerKeyConfigured: boolean;
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

export function GodomallIntegrationForm() {
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<GodomallAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [mallDomain, setMallDomain] = useState('');
  const [userKey, setUserKey] = useState('');
  const [mallSno, setMallSno] = useState('');
  const [partnerKeyOverride, setPartnerKeyOverride] = useState('');
  const [clearPartnerKeyOverride, setClearPartnerKeyOverride] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [previewRows, setPreviewRows] = useState<GodomallPreviewRow[]>([]);
  const [fetchMeta, setFetchMeta] = useState<{ count: number } | null>(null);
  const [transportInfo, setTransportInfo] = useState<{
    mode: 'direct' | 'proxy';
    partnerKeyConfigured?: boolean;
    notes?: string;
  } | null>(null);

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const loadSavedAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/order/integration/godomall');
      const data = (await res.json()) as { account?: GodomallAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '?°ë™ ?•ë³´ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setMallDomain(account.mallDomain);
        setMallSno(account.mallSno);
        setUserKey('');
        setPartnerKeyOverride('');
        setClearPartnerKeyOverride(false);
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
        const res = await fetch('/api/order/integration/godomall/transport');
        const data = (await res.json()) as {
          transport?: { mode: 'direct' | 'proxy' };
          partnerKeyConfigured?: boolean;
          notes?: string;
        };
        if (res.ok && data.transport) {
          setTransportInfo({
            mode: data.transport.mode,
            partnerKeyConfigured: data.partnerKeyConfigured,
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
      const res = await fetch('/api/order/integration/godomall/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          mallDomain,
          userKey: userKey || undefined,
          mallSno: mallSno || undefined,
          partnerKeyOverride: partnerKeyOverride || undefined,
          clearPartnerKeyOverride,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: GodomallAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '?€?¥ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(data.account ?? null);
      setUserKey('');
      setPartnerKeyOverride('');
      setClearPartnerKeyOverride(false);
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'ê³ ë„ëª??°ë™ ?•ë³´ê°€ ?€?¥ë˜?ˆìŠµ?ˆë‹¤.',
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
      const res = await fetch('/api/order/integration/godomall/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ê²° ?ŒìŠ¤?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'ê³ ë„ëª?Open API ?°ê²°???•ìƒ ?•ì¸?˜ì—ˆ?µë‹ˆ??',
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
      const res = await fetch('/api/order/integration/godomall/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: GodomallPreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? 'ì£¼ë¬¸ ?˜ì§‘???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `ê³ ë„ëª?ì£¼ë¬¸ ${data.count ?? 0}ê±´ì„ ë¶ˆëŸ¬?”ìŠµ?ˆë‹¤.`,
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
    if (!window.confirm('?€?¥ëœ ê³ ë„ëª??°ë™ ?•ë³´ë¥??? œ? ê¹Œ??')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/godomall', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '?°ë™ ?´ì œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.');

      setSavedAccount(null);
      setAccountName('');
      setMallDomain('');
      setUserKey('');
      setMallSno('');
      setPartnerKeyOverride('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? 'ê³ ë„ëª??°ë™???´ì œ?˜ì—ˆ?µë‹ˆ??',
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

  const userKeyPlaceholder = savedAccount?.hasUserKey
    ? `?€?¥ë¨: ${savedAccount.userKeyMasked || '********'} (ë³€ê²??œì—ë§??…ë ¥)`
    : 'user key(?¬ìš©?í‚¤) ?…ë ¥ (?€?????„ì²´ ?¸ì¶œ?˜ì? ?ŠìŠµ?ˆë‹¤)';

  const partnerKeyOverridePlaceholder = savedAccount?.hasPartnerKeyOverride
    ? '?€?¥ë¨ (ë³€ê²??œì—ë§??…ë ¥)'
    : 'ê°œë°œÂ·?ŒìŠ¤?¸ìš© partner_key override (? íƒ)';

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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">ê³ ë„ëª??°ë™</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          ë² í?
        </span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        NHNì»¤ë¨¸??ê³ ë„ëª? Open API(Order_Search.php)ë¡??°ê²° ?ŒìŠ¤?¸ì? ì£¼ë¬¸ ì¡°íšŒÂ·?˜ì§‘??ì§„í–‰?????ˆìŠµ?ˆë‹¤. ë°œì£¼?•ì¸Â·?¡ì¥
        ?„ì†¡Â·?íƒœ ë³€ê²½ì? ?¬í•¨?˜ì? ?ŠìŠµ?ˆë‹¤.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">?°ë™ ?•ë³´ ë¶ˆëŸ¬?¤ëŠ” ì¤‘â€?/p> : null}

      <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
        <strong>partner_key(?œíœ´?¬í‚¤)</strong>???‘í´ë¡œë“œ ê³µí†µ ê°’ìœ¼ë¡??œë²„???±ë¡?©ë‹ˆ?? ?ë§¤?ëŠ”{' '}
        <strong>user key(?¬ìš©?í‚¤)</strong>ë§??…ë ¥?˜ë©´ ?©ë‹ˆ??
        <span className="mt-1 block">
          NHN openhub ?¸ì¶œ IP <strong>{EXCLOAD_GODOMALL_OUTBOUND_IP}</strong> ?ˆìš©?€ NHN 1:1 ë¬¸ì˜ê°€ ?„ìš”?©ë‹ˆ??
        </span>
      </p>

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API ?¸ì¶œ ê²½ë¡œ:{' '}
          <strong>{transportInfo.mode === 'proxy' ? 'ê³ ì • IP ?„ë¡?? : '?„ë¡??ë¯¸ì„¤??}</strong>
          {transportInfo.partnerKeyConfigured === false ? (
            <span className="mt-1 block text-xs font-semibold text-amber-800 dark:text-amber-200">
              GODOMALL_PARTNER_KEYê°€ ?„ì§ ?œë²„???¤ì •?˜ì? ?Šì•˜?µë‹ˆ?? ?¤ì—°????Vercel env ?±ë¡ ?ëŠ” ê°œë°œ??overrideê°€
              ?„ìš”?©ë‹ˆ??
            </span>
          ) : null}
          {transportInfo.notes ? <span className="mt-1 block text-xs opacity-90">{transportInfo.notes}</span> : null}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          ìµœê·¼ ?¤ë¥˜: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">?‘í´ë¡œë“œ ?•ë³´ (?œíœ´???±ë¡??</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="?…ì²´ëª? value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow label="?¸ì¶œ IP" value={EXCLOAD_GODOMALL_OUTBOUND_IP} />
        </dl>
      </section>

      <CollapsibleGuide title="API ??ë°œê¸‰ ë°©ë²• ë³´ê¸° (ê³ ë„ëª?">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://devcenter.godo.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              devcenter.godo.co.kr
            </a>
            ?ì„œ ?‘í´ë¡œë“œ ?œíœ´??partner_key) ?±ë¡
          </li>
          <li>?¼í•‘ëª?ê´€ë¦¬ì ??Open API ???¬ìš©?í‚¤(user key) ? ì²­Â·?¹ì¸</li>
          <li>NHN 1:1 ë¬¸ì˜ë¡?openhub ?¸ì¶œ IP({EXCLOAD_GODOMALL_OUTBOUND_IP}) ?ˆìš© ?”ì²­</li>
          <li>ë©€?°ëª° ?´ì˜ ??mallSno(?ì ë²ˆí˜¸)ê°€ ?„ìš”?????ˆìŠµ?ˆë‹¤.</li>
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
            placeholder="?? ë³¸ì‚¬ ê³ ë„ëª?
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mallDomain" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            ?¼í•‘ëª??„ë©”??
          </label>
          <input
            id="mallDomain"
            type="text"
            value={mallDomain}
            onChange={(e) => setMallDomain(e.target.value)}
            placeholder="?? shop.example.com"
            className={inputClass}
            required
          />
          <p className="mt-1 text-xs text-zinc-500">ê³„ì • êµ¬ë¶„?©ì…?ˆë‹¤. API XML?ëŠ” partner_key?€ user keyë§??¬ìš©?©ë‹ˆ??</p>
        </div>

        <div>
          <label htmlFor="userKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            user key (?¬ìš©?í‚¤)
          </label>
          <input
            id="userKey"
            type="password"
            value={userKey}
            onChange={(e) => setUserKey(e.target.value)}
            autoComplete="new-password"
            placeholder={userKeyPlaceholder}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mallSno" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            mallSno (?ì ë²ˆí˜¸, ? íƒ)
          </label>
          <input
            id="mallSno"
            type="text"
            value={mallSno}
            onChange={(e) => setMallSno(e.target.value)}
            placeholder="ë©€?°ëª° ?´ì˜ ???…ë ¥"
            className={inputClass}
          />
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300"
          >
            ê°œë°œÂ·?´ë???(partner_key override)
            {showAdvanced ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {showAdvanced ? (
            <div className="space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">
                ?´ì˜ ?˜ê²½?ì„œ??Vercel env <code>GODOMALL_PARTNER_KEY</code>ë¥??¬ìš©?©ë‹ˆ?? ë¡œì»¬Â·?¤í…Œ?´ì§• ?ŒìŠ¤???œì—ë§?
                overrideë¥??…ë ¥?˜ì„¸??
              </p>
              <input
                id="partnerKeyOverride"
                type="password"
                value={partnerKeyOverride}
                onChange={(e) => setPartnerKeyOverride(e.target.value)}
                autoComplete="new-password"
                placeholder={partnerKeyOverridePlaceholder}
                className={inputClass}
              />
              {savedAccount?.hasPartnerKeyOverride ? (
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={clearPartnerKeyOverride}
                    onChange={(e) => setClearPartnerKeyOverride(e.target.checked)}
                  />
                  ?€?¥ëœ partner_key override ?? œ
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
          <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">
            ?˜ì§‘ ë¯¸ë¦¬ë³´ê¸° ({fetchMeta.count}ê±?
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-100 dark:bg-zinc-800">
                <tr>
                  {GODOMALL_PREVIEW_HEADERS.map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${row['ì£¼ë¬¸ë²ˆí˜¸']}-${index}`} className="border-t border-zinc-200 dark:border-zinc-700">
                    {GODOMALL_PREVIEW_HEADERS.map((header) => (
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
