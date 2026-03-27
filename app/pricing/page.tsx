/**
 * 가격·결제·구독 안내. 서비스 설명 중심 페이지는 app/about/page.tsx 와 역할을 분리합니다.
 * ⚠️ EXCLOAD CONSTITUTION v4.2 — 결제/Stripe 연동은 본 페이지·API 경로에서만 다룹니다.
 */
'use client';

import { Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  const plans = [
    {
      planKey: 'free' as const,
      name: '무료',
      price: '0',
      period: '월',
      description: '무료 이용 플랜',
      features: [
        '매월 5,000 포인트 지급',
        '텍스트 변환 시 글자수 만큼 포인트 차감',
        '엑셀 다운로드 1회 1,000 포인트 차감',
        '텍스트 입력 최대 5,000자',
      ],
      recommendations: [
        '주문을 간편하게 정리하고 싶은 분',
        '월별·일별 주문량이 일정하지 않은 판매자',
        '월 주문량이 많지 않은 개인 판매자',
      ],
      popular: false,
      showVat: false,
    },
    {
      planKey: 'monthly' as const,
      name: '프로',
      price: '4,000',
      period: '월',
      description: '꾸준한 주문 처리를 위한 플랜',
      features: [
        '매월 400,000 포인트 지급',
        '텍스트 변환 시 글자수 만큼 포인트 차감',
        '엑셀 다운로드 무제한',
      ],
      recommendations: [
        '매일 들어오는 주문을 빠르게 정리해야 하는 분',
        '엑셀 주문 변환에 많은 시간이 소요되는 분',
        '카카오톡, 메시지, 텍스트 주문이 많은 분',
        '판매 채널이 많아 주문 정리에 시간이 많이 걸리는 분',
        '오입력이나 반송 문제를 줄이고 싶은 분',
        '반복되는 주문 정리 작업을 자동화하여 시간을 절약하고 싶은 분',
      ],
      popular: true,
      showVat: true,
    },
    {
      planKey: 'yearly' as const,
      name: '연간',
      price: '40,000',
      period: '년',
      description: '장기 이용자를 위한 연간 플랜',
      features: [
        '20% 할인',
        '매월 400,000 포인트 지급',
        '텍스트 변환 시 글자수 만큼 포인트 차감',
        '엑셀 다운로드 무제한',
      ],
      recommendations: [
        '매일 들어오는 주문을 빠르게 정리해야 하는 분',
        '엑셀 주문 변환에 많은 시간이 소요되는 분',
        '카카오톡, 메시지, 텍스트 주문이 많은 분',
        '판매 채널이 많아 주문 정리에 시간이 많이 걸리는 분',
        '오입력이나 반송 문제를 줄이고 싶은 분',
        '반복되는 주문 정리 작업을 자동화하여 시간을 절약하고 싶은 분',
        '연간 할인으로 비용을 절약하며 안정적으로 사용하고 싶은 분',
        '매달 꾸준히 주문을 처리하는 온라인 판매자 또는 사업자',
      ],
      popular: false,
      showVat: true,
    },
  ];

  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* 헤더 */}
        <div className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-zinc-950 dark:text-zinc-100 mb-4">
            가격 플랜
          </h1>
          <p className="text-lg sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            당신의 비즈니스에 맞는 플랜을 선택하세요
          </p>
        </div>

        {/* 플랜 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16">
          {plans.map((plan, index) => (
            <div
              key={plan.planKey}
              className={`relative rounded-2xl border-2 p-6 lg:p-8 ${
                plan.popular
                  ? 'border-blue-500 bg-white dark:bg-zinc-900 shadow-xl scale-105'
                  : 'border-black dark:border-black bg-white dark:bg-zinc-900'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-600 text-white text-sm font-semibold rounded-full">
                  인기 플랜
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  {plan.name}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
                  {plan.description}
                </p>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
                      {plan.price === '0' ? '무료' : `₩${parseInt(plan.price.replace(/,/g, '')).toLocaleString()}`}
                    </span>
                    {plan.price !== '0' && (
                      <span className="text-zinc-600 dark:text-zinc-400">
                        / {plan.period}
                      </span>
                    )}
                  </div>
                  {plan.showVat && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      (VAT 별도)
                    </span>
                  )}
                </div>
              </div>
              
              <ul className="space-y-2.5 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>
              
              {/* 이런 분께 추천합니다 섹션 */}
              <div className="mb-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3.5">
                  이런 분께 추천합니다
                </h4>
                <ul className="space-y-2">
                  {plan.recommendations.map((recommendation, recIndex) => (
                    <li key={recIndex} className="flex items-start gap-2">
                      <span className="text-zinc-500 dark:text-zinc-500 mt-0.5 text-xs">•</span>
                      <span className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/subscribe?plan=${encodeURIComponent(plan.planKey)}`;
                }}
                className="w-full text-center px-6 py-3 rounded-lg font-semibold transition-colors bg-blue-600 hover:bg-blue-700 text-white"
              >
                {`${plan.name} 시작하기`}
              </button>
            </div>
          ))}
        </div>

        <p className="mb-10 max-w-3xl mx-auto text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
          결제 진행 시 정기결제에 동의하는 것으로 간주됩니다.
        </p>

        {/* 결제·환불 안내 (토스 심사 대응: 가격 페이지에서 결제 조건 명시) */}
        <div className="max-w-3xl mx-auto space-y-6 mb-16">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 lg:p-8">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              결제 안내
            </h2>
            <p className="text-zinc-700 dark:text-zinc-300 mb-4">
              엑클로드는 구독형(정기결제) 서비스입니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>현재 카드 결제를 지원합니다. (토스 빌링/기존 결제 연동)</li>
              <li>정기결제는 선택한 플랜 주기(월/연) 기준으로 반복 결제가 진행됩니다.</li>
              <li>마이페이지에서 언제든지 해지 예약이 가능하며, 다음 결제일부터 중단됩니다.</li>
              <li>결제 후 즉시 서비스 이용이 가능합니다.</li>
              <li>서비스 제공기간: 월간 플랜 1개월 단위, 연간 플랜 12개월 단위</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 lg:p-8">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              환불 정책
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>결제 후 7일 이내 환불 요청 가능</li>
              <li>환불은 환불 신청 접수 후 검토를 통해 처리됩니다.</li>
              <li>필요 시 환불 계좌 정보 확인이 요청될 수 있습니다.</li>
              <li>환불 처리 결과는 영업일 기준 3~5일 내 안내됩니다.</li>
            </ul>
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
              자세한 내용은{' '}
              <Link href="/refund" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300">
                환불 정책 전문
              </Link>
              을 참고해 주세요.
            </p>
          </div>
        </div>

        {/* FAQ 섹션 */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-10">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-8 text-center">
            자주 묻는 질문
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
            {[
              {
                question: '플랜을 나중에 변경할 수 있나요?',
                answer: '네, 언제든지 플랜을 업그레이드하거나 다운그레이드할 수 있습니다.',
              },
              {
                question: '무료 플랜에 제한이 있나요?',
                answer: '무료 플랜은 월 10개 파일 처리 제한이 있으며, 기본 기능만 사용할 수 있습니다.',
              },
              {
                question: '결제는 어떻게 진행되나요?',
                answer: '현재 카드 결제를 지원하며, 플랜 주기에 따라 정기결제가 갱신됩니다.',
              },
              {
                question: '환불 정책은 어떻게 되나요?',
                answer:
                  '결제 후 7일 이내 환불 신청이 가능하며, 접수 후 정책 기준에 따라 검토·처리됩니다. 처리 결과는 영업일 기준 3~5일 내 안내됩니다. 상세는 환불 정책 페이지를 참고해 주세요.',
              },
            ].map((faq, index) => (
              <div key={index} className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  {faq.question}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* VAT 안내 및 플랜 변경 안내 */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            * 모든 가격은 부가세 별도입니다.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span>언제든지 플랜 변경 가능</span>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <span>언제든지 해지 가능</span>
          </div>
        </div>

        {/* CTA 섹션 */}
        <div className="mt-12 lg:mt-16 text-center">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 lg:p-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              더 많은 정보가 필요하신가요?
            </h2>
            <p className="text-lg text-blue-100 mb-8">
              고객 지원팀이 도와드리겠습니다.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              문의하기
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
