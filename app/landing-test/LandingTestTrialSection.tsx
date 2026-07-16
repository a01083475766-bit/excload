'use client';

import { landingContentCardClass, landingContainerClass } from '@/app/components/landing/landingLayout';
import { InvoiceFileConvertTrialModeProvider } from '@/app/invoice-file-convert/trial-mode-context';
import { isOpenBetaMode, getSignupBonusPoints } from '@/app/lib/open-beta-policy';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';

const TrialEmbed = dynamic(
  () =>
    import('@/app/logistics-convert/LogisticsConvertClient').then(
      (mod) => mod.LogisticsConvertClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        주문정리 체험 화면을 불러오는 중입니다...
      </div>
    ),
  },
);

const InvoiceTrialEmbed = dynamic(() => import('@/app/invoice-file-convert/page'), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      송장변환 체험 화면을 불러오는 중입니다...
    </div>
  ),
});

type TrialTab = 'order' | 'invoice';

const tabItems: { key: TrialTab; label: string; desc: string }[] = [
  {
    key: 'order',
    label: '주문정리 체험',
    desc: '엑셀·카톡 주문을 택배사 양식으로 변환',
  },
  {
    key: 'invoice',
    label: '송장변환 체험',
    desc: '출고 결과를 송장·택배 양식에 맞게 변환',
  },
];

export default function LandingTestTrialSection() {
  const [activeTab, setActiveTab] = useState<TrialTab>('order');
  const betaMode = isOpenBetaMode();
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();

  return (
    <section
      id="free-trial"
      className="blue-unified-theme scroll-mt-24 border-b border-zinc-200 py-8 dark:border-zinc-800 lg:py-11"
    >
      <div className={landingContainerClass}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
            TRY EXCLOAD
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-3xl">
            지금 바로 테스트
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-400 [word-break:keep-all]">
            {betaMode ? (
              <>
                가입 전에도 체험할 수 있습니다. 가입하면 주문연동과 매월 {signupBonusLabel}P도 함께
                이용할 수 있습니다.
              </>
            ) : (
              <>복잡한 주문 정리, 먼저 무료로 테스트해 보세요.</>
            )}
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-5xl">
          <div
            className="flex flex-col gap-2 sm:flex-row sm:justify-center"
            role="tablist"
            aria-label="체험 기능 선택"
          >
            {tabItems.map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl border px-4 py-3 text-left transition sm:min-w-[220px] sm:flex-1 sm:max-w-xs ${
                    selected
                      ? 'border-blue-500 bg-blue-600 text-white shadow-md'
                      : 'border-zinc-200 bg-white text-zinc-800 hover:border-blue-200 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-blue-800 dark:hover:bg-blue-950/40'
                  }`}
                >
                  <span className="block text-sm font-extrabold">{tab.label}</span>
                  <span
                    className={`mt-1 block text-xs leading-snug [word-break:keep-all] ${
                      selected ? 'text-blue-100' : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {tab.desc}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`mt-6 ${landingContentCardClass}`} role="tabpanel">
            {activeTab === 'order' ? (
              <>
                <TrialEmbed trialMode landingEmbed />
                <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-500 [word-break:keep-all]">
                  파일 업로드가 부담되면 카톡 주문문구를 붙여넣어도 됩니다.{' '}
                  <Link
                    href="/trial"
                    className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
                  >
                    전체 화면 주문정리 체험
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="invoice-native-theme">
                  <InvoiceFileConvertTrialModeProvider trialMode>
                    <InvoiceTrialEmbed />
                  </InvoiceFileConvertTrialModeProvider>
                </div>
                <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-500 [word-break:keep-all]">
                  송장변환 전체 화면이 필요하면{' '}
                  <Link
                    href="/invoice-file-convert/trial"
                    className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
                  >
                    송장변환 체험 전용 페이지
                  </Link>
                  로 이동할 수 있습니다.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
