'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { EXCLOAD_GODOMALL_OUTBOUND_IP } from '@/app/lib/godomall/api-spec';
import { IntegrationConnectedNotice } from '@/app/components/order-integration/IntegrationConnectedNotice';
import { SecretInput } from '@/app/components/order-integration/SecretInput';

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

export function GodomallIntegrationForm({
  embedded = false,
  onConnectionChange,
}: { embedded?: boolean; onConnectionChange?: () => void } = {}) {
  const [loading, setLoading] = useState(true);
  const [savedAccount, setSavedAccount] = useState<GodomallAccountResponse | null>(null);
  const [accountName, setAccountName] = useState('');
  const [mallDomain, setMallDomain] = useState('');
  const [userKey, setUserKey] = useState('');
  const [mallSno, setMallSno] = useState('');
  const [partnerKeyOverride, setPartnerKeyOverride] = useState('');
  const [clearPartnerKeyOverride, setClearPartnerKeyOverride] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
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
        throw new Error(data.error ?? '연동 정보를 불러오지 못했습니다.');
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
        // transport 정보는 부가 안내용
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
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');

      setSavedAccount(data.account ?? null);
      setUserKey('');
      setPartnerKeyOverride('');
      setClearPartnerKeyOverride(false);
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '고도몰 연동 정보가 저장되었습니다.',
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
      const res = await fetch('/api/order/integration/godomall/test', { method: 'POST' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연결 테스트에 실패했습니다.');
      setStatusMessage({
        kind: 'success',
        text: data.message ?? '고도몰 Open API 연결이 정상 확인되었습니다.',
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
    if (!window.confirm('저장된 고도몰 연동 정보를 삭제할까요?')) return;

    setBusyAction('disconnect');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/order/integration/godomall', { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '연동 해제에 실패했습니다.');

      setSavedAccount(null);
      setAccountName('');
      setMallDomain('');
      setUserKey('');
      setMallSno('');
      setPartnerKeyOverride('');
      setStatusMessage({
        kind: 'info',
        text: data.message ?? '고도몰 연동이 해제되었습니다.',
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

  const partnerKeyOverridePlaceholder = savedAccount?.hasPartnerKeyOverride
    ? '저장됨 (변경 시에만 입력)'
    : '개발·테스트용 partner_key override (선택)';

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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">고도몰 연동</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          베타
        </span>
      </div>
      ) : (
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">연동 정보 입력</h2>
      )}
{!embedded ? (
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        NHN커머스 고도몰5 Open API(Order_Search.php)로 연결 테스트를 진행할 수 있습니다. 실제 주문 조회·수집은 주문연동
        화면에서 진행합니다. 발주확인·송장 전송·상태 변경은 포함하지 않습니다.
      </p>      ) : (
        <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">쇼핑몰에서 발급한 값을 입력한 뒤 연결 테스트와 저장을 진행합니다.</p>
      )}

      {loading ? <p className="mb-4 text-sm text-zinc-500">연동 정보 불러오는 중…</p> : null}

      <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
        <strong>partner_key(제휴사키)</strong>는 엑클로드 공통 값으로 서버에 등록됩니다. 판매자는{' '}
        <strong>user key(사용자키)</strong>만 입력하면 됩니다.
        <span className="mt-1 block">
          NHN openhub 호출 IP <strong>{EXCLOAD_GODOMALL_OUTBOUND_IP}</strong> 허용은 NHN 1:1 문의가 필요합니다.
        </span>
      </p>

      {transportInfo ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
          API 호출 경로:{' '}
          <strong>{transportInfo.mode === 'proxy' ? '고정 IP 프록시' : '프록시 미설정'}</strong>
          {transportInfo.partnerKeyConfigured === false ? (
            <span className="mt-1 block text-xs font-semibold text-amber-800 dark:text-amber-200">
              고도몰 서버 인증정보가 아직 준비되지 않았습니다. 실연동 전 관리자에게 문의해 주세요.
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
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">엑클로드 정보 (제휴사 등록용)</h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow label="호출 IP" value={EXCLOAD_GODOMALL_OUTBOUND_IP} />
        </dl>
      </section>
      ) : null}

{!embedded ? (
      <CollapsibleGuide title="API 키 발급 방법 보기 (고도몰)">
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
            에서 엑클로드 제휴사(partner_key) 등록
          </li>
          <li>쇼핑몰 관리자 → Open API → 사용자키(user key) 신청·승인</li>
          <li>NHN 1:1 문의로 openhub 호출 IP({EXCLOAD_GODOMALL_OUTBOUND_IP}) 허용 요청</li>
          <li>멀티몰 운영 시 mallSno(상점번호)가 필요할 수 있습니다.</li>
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
            placeholder="예: 본사 고도몰"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mallDomain" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            쇼핑몰 도메인
          </label>
          <input
            id="mallDomain"
            type="text"
            value={mallDomain}
            onChange={(e) => setMallDomain(e.target.value)}
            placeholder="예: shop.example.com"
            className={inputClass}
            required
          />
          <p className="mt-1 text-xs text-zinc-500">계정 구분용입니다. API XML에는 partner_key와 user key만 사용합니다.</p>
        </div>

        <SecretInput
          id="userKey"
          label="user key (사용자키)"
          confirmLabel="user key(사용자키)"
          value={userKey}
          onChange={setUserKey}
          hasSaved={Boolean(savedAccount?.hasUserKey)}
          savedMasked={savedAccount?.userKeyMasked}
          newPlaceholder="user key(사용자키) 입력 (저장 후 전체 노출되지 않습니다)"
          inputClass={inputClass}
          disabled={busyAction !== null}
          resetSignal={savedAccount}
        />

        <div>
          <label htmlFor="mallSno" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            mallSno (상점번호, 선택)
          </label>
          <input
            id="mallSno"
            type="text"
            value={mallSno}
            onChange={(e) => setMallSno(e.target.value)}
            placeholder="멀티몰 운영 시 입력"
            className={inputClass}
          />
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300"
          >
            개발·내부용 (partner_key override)
            {showAdvanced ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {showAdvanced ? (
            <div className="space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">
                운영 환경에서는 서버에 안전하게 저장된 인증정보를 사용합니다. 로컬·스테이징 테스트 시에만
                개발용 override를 입력하세요.
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
                  저장된 partner_key override 삭제
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
            onClick={() => void handleDisconnect()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            연동 해제
          </button>
        </div>
      </form>

      {savedAccount ? <IntegrationConnectedNotice mallName="고도몰" /> : null}
    </div>
  );
}
