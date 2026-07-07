'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CoupangIntegrationForm } from '@/app/components/order-integration/CoupangIntegrationForm';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
  type OrderIntegrationMallId,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';

type Props = {
  mallId: Extract<OrderIntegrationMallId, 'coupang' | 'eleven'>;
  mallName: string;
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

function ElevenIntegrationPlaceholder({ mallName }: { mallName: string }) {
  const outboundIp = getExcloadOutboundIp();
  const [accountName, setAccountName] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [openApiKey, setOpenApiKey] = useState('');
  const [busyAction, setBusyAction] = useState<'test' | 'fetch' | 'disconnect' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handlePlaceholderAction(action: 'test' | 'fetch' | 'disconnect') {
    setBusyAction(action);
    setStatusMessage(null);
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    setBusyAction(null);
    setStatusMessage('11번가 연동 API는 쿠팡 안정화 후 구현 예정입니다.');
  }

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-10 sm:px-6">
      <Link
        href="/order/integration"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        주문연동 목록
      </Link>

      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{mallName} 연동</h1>
      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {mallName} 판매자센터에서 발급한 API 정보를 입력하고 연결을 테스트할 수 있습니다.
      </p>

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

      <CollapsibleGuide title="API 발급 방법 보기 (11번가)">
        <ol className="list-decimal space-y-2 pl-5">
          <li>11번가 OPEN API CENTER → API 관리 메뉴로 이동합니다.</li>
          <li>셀링툴 업체 목록에 엑클로드가 없으면 IP 직접입력을 사용합니다.</li>
          <li>개발서버 IP, 개발자 PC, 상용서버 IP에 엑클로드 고정 IP를 입력합니다.</li>
          <li>발급된 OPEN API KEY를 아래에 붙여넣습니다.</li>
        </ol>
      </CollapsibleGuide>

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
            placeholder="예: 본사 11번가 계정"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="sellerId" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            11번가 판매자 ID
          </label>
          <input
            id="sellerId"
            type="text"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="openApiKey" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            11ST OPEN API KEY
          </label>
          <input
            id="openApiKey"
            type="password"
            value={openApiKey}
            onChange={(e) => setOpenApiKey(e.target.value)}
            autoComplete="new-password"
            placeholder="저장 후 전체 노출되지 않습니다"
            className={inputClass}
          />
        </div>

        {statusMessage ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {statusMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handlePlaceholderAction('test')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busyAction === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            연결 테스트
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handlePlaceholderAction('fetch')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            {busyAction === 'fetch' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            주문 수집
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handlePlaceholderAction('disconnect')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busyAction === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            연동 해제
          </button>
        </div>
      </form>
    </div>
  );
}

export function MallIntegrationForm({ mallId, mallName }: Props) {
  if (mallId === 'coupang') {
    return <CoupangIntegrationForm />;
  }

  return <ElevenIntegrationPlaceholder mallName={mallName} />;
}
