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
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
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
        const res = await fetch('/api/order/integration/cjonstyle/transport');
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
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setAuthenticationKey('');
      if (data.account?.deliveryMethodCodes.length) {
        setDeliveryMethodCode(data.account.deliveryMethodCodes.join(','));
      }
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'CJ온스타일 연동 정보가 저장되었습니다.',
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
      const res = await fetch('/api/order/integration/cjonstyle/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? 'CJ온스타일 API 연결이 정상 확인되었습니다.',
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
      const res = await fetch('/api/order/integration/cjonstyle/fetch-orders', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        previewRows?: CjonstylePreviewRow[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error ?? '주문 수집에 실패했습니다.');

      setPreviewRows(data.previewRows ?? []);
      setFetchMeta({ count: data.count ?? data.previewRows?.length ?? 0 });
      setStatusMessage({
        kind: 'success',
        text: data.message ?? `CJ온스타일 주문 ${data.count ?? 0}건을 불러왔습니다.`,
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
    if (!window.confirm('저장된 CJ온스타일 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/cjonstyle', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setVendorCode('');
      setAuthenticationKey('');
      setDeliveryMethodCode('');
      setPreviewRows([]);
      setFetchMeta(null);
      setStatusMessage({
        kind: 'info',
        text: data.message ?? 'CJ온스타일 연동이 해제되었습니다.',
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

  const authKeyPlaceholder = savedAccount?.hasAuthenticationKey
    ? `저장됨: ${savedAccount.authenticationKeyMasked || '********'} (변경 시에만 입력)`
    : 'authenticationKey 입력 (Header, 저장 후 전체 노출되지 않습니다)';

  const defaultDeliveryCodes = CJONSTYLE_DEFAULT_DELIVERY_METHOD_CODES.join(',');

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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">CJ온스타일 연동</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          베타
        </span>
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          restricted
        </span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        입점 협력사 전용 표준 API로 연결 테스트와 주문 조회·수집(배송타입별)을 진행할 수 있습니다. 발주확인·송장
        전송·상태 변경 POST API는 포함하지 않습니다.
      </p>

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
        <strong>연동 방식: 직접개발</strong>
        <span className="mt-1 block">
          운영서버 IP: <strong>{outboundIp}</strong>
        </span>
        <span className="mt-1 block text-xs opacity-90">
          CJ온스타일 입점 협력사 계정에서 API 정보관리 메뉴를 통해 인증키를 발급받아야 합니다. 엑클로드는 현재 CJ
          사전등록 셀러툴이 아니므로 셀러툴 선택 방식이 아니라 직접개발 방식으로 안내합니다.
        </span>
      </p>

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.notes ? <span className="mt-1 block text-xs opacity-90">{transportInfo.notes}</span> : null}
        </p>
      ) : null}

      {savedAccount?.lastErrorMessage ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          최근 오류: {savedAccount.lastErrorMessage}
        </p>
      ) : null}

      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">엑클로드 정보 (파트너 등록용)</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow label="IP 주소 (운영서버)" value={outboundIp} />
        </dl>
      </section>

      <CollapsibleGuide title="API 발급 방법 보기 (CJ온스타일)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a
              href="https://partners.cjonstyle.com/standardApi/apiGuide"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              CJ온스타일 파트너시스템
            </a>
            에 입점 협력사 계정으로 로그인합니다.
          </li>
          <li>API 관리 → API 정보관리 → 기본정보 등록</li>
          <li>
            연동 방법: <strong>직접개발</strong> 선택, 운영서버 IP에 <strong>{outboundIp}</strong> 등록
          </li>
          <li>API 인증키 발급 후 vendorCode(6자)와 authenticationKey를 입력합니다.</li>
          <li>주문 API Path·Query 명칭은 파트너 Docs 확인 후 반영됩니다(현재 placeholder).</li>
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
            placeholder="예: 본사 CJ온스타일"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="vendorCode" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            vendorCode (협력업체코드, 6자)
          </label>
          <input
            id="vendorCode"
            type="text"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="예: AB1234"
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
            배송타입 코드 (선택)
          </label>
          <input
            id="deliveryMethodCode"
            type="text"
            value={deliveryMethodCode}
            onChange={(e) => setDeliveryMethodCode(e.target.value)}
            placeholder={`미입력 시 ${defaultDeliveryCodes} 전체 수집 (쉼표 구분)`}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">
            배송타입별 API를 순회한 뒤 주문번호 기준으로 중복 제거합니다. 동일 조합으로 복수 채널을 만들면 중복
            수집될 수 있습니다.
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
            <p className="text-sm text-zinc-500">최근 7일 이내 해당 배송타입 주문이 없습니다.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
