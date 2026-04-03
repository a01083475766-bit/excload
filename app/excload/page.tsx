'use client';

import DemoAnimation from '@/app/components/DemoAnimation';
import Link from 'next/link';
import { Check } from 'lucide-react';

export default function HomePage() {
  const plans = [
    {
      planKey: 'free' as const,
      name: '무료',
      priceLabel: '무료',
      description: '무료 이용 플랜',
      features: ['매월 5,000 사용량 제공', '텍스트 입력 최대 5,000자', '엑셀 다운로드 1회 1,000 사용량 차감'],
      popular: false,
    },
    {
      planKey: 'monthly' as const,
      name: '프로',
      priceLabel: '₩4,000 / 월',
      description: '꾸준한 주문 처리를 위한 플랜',
      features: ['매월 400,000 사용량 제공', '텍스트 변환 시 글자수만큼 사용량 차감', '엑셀 다운로드 무제한'],
      popular: true,
    },
    {
      planKey: 'yearly' as const,
      name: '연간',
      priceLabel: '₩40,000 / 년',
      description: '장기 이용자를 위한 연간 플랜',
      features: ['20% 할인', '매월 400,000 사용량 제공', '엑셀 다운로드 무제한'],
      popular: false,
    },
  ];

  return (
    <div className="pt-6 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-7xl mx-auto px-6">
        {/* Hero 섹션 */}
        <section className="pt-4 pb-8 lg:pt-6 lg:pb-12">
          <div className="flex flex-col gap-0">
            <div className="flex flex-col items-center text-center gap-2.5 sm:gap-3">
              <h1
                className="mx-auto w-full max-w-[min(100%,90rem)] px-2 text-center font-bold leading-tight text-zinc-950 dark:text-zinc-100
                text-[clamp(1.5rem,5vw,2.25rem)] tracking-tighter
                lg:whitespace-nowrap [word-break:keep-all]"
              >
                반복적인 주문정리 엑셀정리 힘드셨죠? 이제 복사해서 붙이면 준비 끝
              </h1>
              <p className="max-w-4xl text-sm sm:text-base md:text-lg text-zinc-700 dark:text-zinc-300 leading-snug">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">&quot;엑셀 노가다 탈출&quot;</span>
                <span className="text-zinc-400 dark:text-zinc-500 mx-1 sm:mx-2">·</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  &quot;엑셀파일, 카톡 주문, 붙여넣기 하면 정리끝&quot;
                </span>
                <span className="text-zinc-400 dark:text-zinc-500 mx-1 sm:mx-2">·</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">&quot;오입력 걱정 끝&quot;</span>
              </p>
              <p className="max-w-3xl text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                복잡한 기능을 빼고{' '}
                <strong className="font-bold text-zinc-900 dark:text-zinc-100">&quot;빠른주문정리&quot;</strong>에만
                집중해 사용법이 어렵지 않습니다
              </p>
            </div>

            {/* 데모: 히어로·가격 문구와의 상하 여백 2배 (기존 gap-4 대비 ≈2rem) */}
            <div className="w-full py-8 lg:py-12">
              <DemoAnimation />
            </div>

            {/* 데모 하단: 가격 강조 (한 줄) */}
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto px-3 pt-0.5">
              <p className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                비싼 프로그램은 부담되고 주문정리가 힘들 때, 정답은{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">월 4,000원</span> 엑클로드!
              </p>
            </div>

            {/* 체험: 가로형 통합 박스 (파란 테두리 · /trial 이동) — 데모와 간격 */}
            <div className="w-full max-w-4xl mx-auto px-2 mt-4">
              <Link
                href="/trial"
                className="group flex flex-col gap-4 rounded-2xl border-2 border-blue-500 bg-white p-4 shadow-sm transition-all hover:border-blue-600 hover:shadow-md dark:border-blue-500 dark:bg-zinc-900/90 dark:hover:border-blue-400 md:flex-row md:items-stretch md:gap-0 md:p-0 md:overflow-hidden"
              >
                <span
                  className="trial-button inline-flex w-full max-w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border-2 border-[#00bcd4] bg-white px-[25px] py-[10px] text-center text-base font-semibold leading-tight text-[#00bcd4] shadow-none [font-family:'Courier_New',Courier,monospace] dark:border-cyan-400 dark:bg-zinc-900 dark:text-cyan-300 md:mx-4 md:my-4 md:w-[min(100%,280px)] md:max-w-[280px] md:self-center"
                >
                  <span className="text-current">지금 바로 체험</span>
                  <span className="text-current">테스트 해보기</span>
                </span>
                <p className="flex flex-1 flex-col items-center justify-center gap-0 text-center text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 md:items-start md:px-6 md:py-5 md:text-left md:text-base">
                  <span>
                    정리가 잘 되는지 테스트해보고 나에게 필요한 기능인지 확인해주세요.
                  </span>
                  <span className="mt-1 block">
                    회원가입 없이 바로 확인해보세요.
                  </span>
                </p>
              </Link>
              <p className="mt-2 text-center text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-500 leading-snug">
                체험에는 사용량이 제공되며, 횟수·네트워크별 제한이 있을 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 설명 텍스트 섹션 — 콜론(:) 세로 정렬 (Grid 3열), 여백·줄간격 타이트 */}
        <section className="py-6 lg:py-8">
          <div className="max-w-4xl mx-auto px-3 space-y-3">
            <h2 className="text-center text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
              엑클로드만의 편리성, 중요기능
            </h2>
            <div className="flex justify-center overflow-x-auto">
              <div className="grid w-max max-w-full min-w-0 grid-cols-[max-content_auto_minmax(8rem,1fr)] gap-x-2 gap-y-2 text-left text-sm sm:gap-x-3 sm:text-base leading-snug text-zinc-600 dark:text-zinc-400">
                <div className="text-right font-semibold text-zinc-800 dark:text-zinc-200 [word-break:keep-all]">
                  어떤 방식의 주문도 OK
                </div>
                <div className="shrink-0 px-0.5 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                  :
                </div>
                <div className="min-w-0 text-left [word-break:keep-all]">
                  카톡 주문, 엑셀 주문, 스크린샷 주문도 모두 OK
                </div>

                <div className="text-right font-semibold text-zinc-800 dark:text-zinc-200 [word-break:keep-all]">
                  나만의 양식으로 전환
                </div>
                <div className="shrink-0 px-0.5 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                  :
                </div>
                <div className="min-w-0 text-left [word-break:keep-all]">
                  복잡한 양식 필요 없이 쓰고 있는 양식 그대로 OK
                </div>

                <div className="text-right font-semibold text-zinc-800 dark:text-zinc-200 [word-break:keep-all]">
                  배울 필요 없는 시스템
                </div>
                <div className="shrink-0 px-0.5 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                  :
                </div>
                <div className="min-w-0 text-left [word-break:keep-all]">
                  ctrl + c , ctrl + v 로 끝나는 주문정리 OK
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 가격 섹션 */}
        <section className="py-16 lg:py-24">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">가격 플랜</h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">가격 페이지의 핵심 정보를 바로 확인하고 시작하세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.planKey}
                  className={`relative p-6 rounded-2xl border-2 bg-white dark:bg-zinc-900 shadow-lg transition-all ${
                    plan.popular ? 'border-emerald-500' : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                      인기 플랜
                    </div>
                  )}

                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 text-center">{plan.name}</h3>
                  <p className="text-center text-zinc-600 dark:text-zinc-400 text-sm mb-3">{plan.description}</p>
                  <p className="text-center text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-5">{plan.priceLabel}</p>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <Check className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/subscribe?plan=${encodeURIComponent(plan.planKey)}`}
                    className="block w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {plan.name} 시작하기
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-6 text-center text-xs text-zinc-500">자세한 비교는 가격 페이지에서 확인하세요.</p>
            <div className="mt-3 text-center">
              <Link href="/pricing" className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-2">
                가격 페이지 전체 보기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
