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

type LotteonAccountResponse = {
  id: string;
  accountName: string;
  sellerId: string;
  trNo: string;
  shopId: string;
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

export function LotteonIntegrationForm({
  embedded = false,
  onConnectionChange,
}: { embedded?: boolean; onConnectionChange?: () => void } = {}) {
  const outboundIp = getExcloadOutboundIp();
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<LotteonAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [trNo, setTrNo] = useState('');
  const [shopId, setShopId] = useState('');
  const [apiKey, setApiKey] = useState('');
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
      const res = await fetch('/api/order/integration/lotteon');
      const data = (await res.json()) as { account?: LotteonAccountResponse | null; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
      }
      const account = data.account ?? null;
      setSavedAccount(account);
      if (account) {
        setAccountName(account.accountName);
        setSellerId(account.sellerId);
        setTrNo(account.trNo);
        setShopId(account.shopId);
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
        const res = await fetch('/api/order/integration/lotteon/transport');
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
      const res = await fetch('/api/order/integration/lotteon/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          sellerId,
          trNo,
          shopId: shopId || undefined,
          apiKey: apiKey || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        account?: LotteonAccountResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setApiKey('');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '롯데ON 연동 정보가 저장되었습니다.',
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
      const res = await fetch('/api/order/integration/lotteon/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '롯데ON API 연결이 정상 확인되었습니다.',
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
    if (!window.confirm('저장된 롯데ON 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/lotteon', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setSellerId('');
      setTrNo('');
      setShopId('');
      setApiKey('');
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '롯데ON 연동이 해제되었습니다.',
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">롯데ON 연동</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          베타
        </span>
      </div>
      ) : (
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">연동 정보 입력</h2>
      )}
{!embedded ? (
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        API KEY + tr_no 저장 후 연결 테스트를 진행할 수 있습니다. 실제 주문 조회·수집(출고지시·상품준비)은 주문연동
        화면에서 진행합니다. 발주확인·송장 전송·상태 변경은 포함하지 않습니다.
      </p>      ) : (
        <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">쇼핑몰에서 발급한 값을 입력한 뒤 연결 테스트와 저장을 진행합니다.</p>
      )}

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.mode === 'proxy' ? (
            <span className="mt-1 block text-xs opacity-90">
              롯데ON OpenAPI 관리에 엑클로드 고정 IP({outboundIp || '54.180.45.46'})를 등록하세요.
            </span>
          ) : (
            <span className="mt-1 block text-xs opacity-90">
              롯데ON API 서버 연결 준비가 완료되지 않았습니다. 관리자에게 문의해 주세요.
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
      <CollapsibleGuide title="API 발급 방법 보기 (롯데ON)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://store.lotteon.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              롯데ON 스토어센터
            </a>
            에 로그인합니다.
          </li>
          <li>판매자정보 → OpenAPI 관리에서 호스팅/셀러툴(엑클로드)과 직접입력을 선택합니다.</li>
          <li>
            서버 IP에 <strong>엑클로드 고정 IP</strong>를 세미콜론(;)으로 구분해 추가한 뒤 저장·키발급합니다.
          </li>
          <li>판매자정보 → 기본정보관리에서 LO로 시작하는 거래처번호(tr_no)를 확인합니다.</li>
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
            placeholder="예: 본사 롯데ON"
            className={inputClass}
          />
        </div>

        <SecretInput
          id="sellerId"
          label="판매자 ID"
          confirmLabel="판매자 ID"
          secret={false}
          value={sellerId}
          onChange={setSellerId}
          hasSaved={Boolean(savedAccount?.sellerId)}
          savedMasked={savedAccount?.sellerId}
          newPlaceholder="스토어센터 판매자 ID"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <SecretInput
          id="trNo"
          label="거래처번호 (tr_no)"
          confirmLabel="거래처번호(tr_no)"
          secret={false}
          value={trNo}
          onChange={setTrNo}
          hasSaved={Boolean(savedAccount?.trNo)}
          savedMasked={savedAccount?.trNo}
          newPlaceholder="예: LO12345678"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <SecretInput
          id="shopId"
          label="Shop ID (선택)"
          confirmLabel="Shop ID"
          secret={false}
          value={shopId}
          onChange={setShopId}
          hasSaved={Boolean(savedAccount?.shopId)}
          savedMasked={savedAccount?.shopId}
          newPlaceholder="필요 시 Shop ID / lrtr_no"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <SecretInput
          id="apiKey"
          label="API 인증 KEY"
          value={apiKey}
          onChange={setApiKey}
          hasSaved={Boolean(savedAccount?.hasApiKey)}
          savedMasked={savedAccount?.apiKeyMasked}
          newPlaceholder="OpenAPI 인증 KEY 입력 (Query Key 파라미터, 저장 후 전체 노출되지 않습니다)"
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

      {savedAccount ? <IntegrationConnectedNotice mallName="롯데ON" /> : null}
    </div>
  );
}
