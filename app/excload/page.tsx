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
          <div className="flex flex-col gap-4">
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

            <div className="w-full">
              <DemoAnimation />
            </div>

            {/* 데모 하단 · CTA 상단: 가격 메시지 (2줄) */}
            <div className="flex flex-col items-center text-center gap-1.5 max-w-2xl mx-auto px-3 pt-0.5">
              <p className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                비싼 프로그램은 부담되고 주문정리가 힘들 때, 정답은{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">월 4,000원</span> 엑클로드!
              </p>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                커피 한 잔 값으로 대형 쇼핑몰 부럽지 않은 주문 관리 시스템을 완성하세요.
              </p>
            </div>

            {/* 체험 CTA */}
            <div className="flex flex-col items-center text-center gap-2 max-w-lg mx-auto px-2">
              <Link
                href="/trial"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3.5 text-sm sm:text-base font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-colors w-full sm:w-auto min-w-[min(100%,280px)]"
              >
                지금 내 주문으로 무료 체험하기
              </Link>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 leading-snug">
                로그인 없이 시작 · 미리보기까지 이용 (엑셀 저장·다운로드는 가입 후 정식 서비스)
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mt-1">
                체험에는 사용량이 제공되며, 횟수·네트워크별 제한이 있을 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 설명 텍스트 섹션 */}
        <section className="py-12 lg:py-16">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              송장·발송 전, 표부터 덜어내고 싶다면
            </h2>
            <div className="space-y-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                한 건 한 건 옮기고 열 이름 맞추다 보면 하루가 금방 갑니다. 들어오는 채널이 늘수록 부담도 커지죠.
              </p>
              <p>
                엑클로드는 여러 형식의 주문을 같은 파이프라인으로 넘겨,{' '}
                <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                  업로드용 열 구조에 맞는 표
                </strong>
                로 정리하는 데 초점을 둡니다.
              </p>
              <p className="text-zinc-700 dark:text-zinc-300 text-base">
                복잡한 대시보드 대신, 입력·미리보기 중심으로 빠르게 손에 익히실 수 있게 만들었습니다.
              </p>
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
