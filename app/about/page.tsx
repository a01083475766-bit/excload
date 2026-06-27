/**
 * 서비스 소개(설명 중심). 요금·결제 상세는 app/pricing/page.tsx 로 분리합니다.
 * ⚠️ EXCLOAD CONSTITUTION — 마케팅/안내 페이지는 파이프라인과 독립합니다.
 */
import Link from 'next/link';
import { PAGE_SEO } from '@/app/lib/seo-metadata';
import { ArrowRight, Check, Download, FileUp, Repeat } from 'lucide-react';

export const metadata = PAGE_SEO.about;

export default function AboutPage() {
  const valueCards = [
    {
      title: '주문 데이터 자동 정리',
      description: '엑셀, 텍스트, 이미지로 받은 주문을 택배 업로드에 맞게 정리합니다.',
    },
    {
      title: '택배 업로드 파일 생성',
      description: '사용 중인 택배사 양식 흐름을 유지하면서 업로드 가능한 파일로 변환합니다.',
    },
    {
      title: '쇼핑몰 운영 흐름에 맞춤',
      description: '복잡한 ERP보다, 작은 쇼핑몰이 매일 쓰는 주문 정리 작업에 집중했습니다.',
    },
  ];

  const steps = [
    { title: '주문 입력', description: '텍스트, 엑셀, 이미지 주문을 그대로 넣습니다.', icon: FileUp },
    { title: '자동 변환', description: '필요한 항목을 정리하고 택배사 양식에 맞춥니다.', icon: Repeat },
    { title: '엑셀 다운로드', description: '변환된 파일을 내려받아 바로 업로드합니다.', icon: Download },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 px-3 py-12 dark:bg-black sm:px-6 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white px-5 py-12 text-center shadow-sm dark:border-blue-950 dark:bg-zinc-900 sm:px-8 lg:px-12 lg:py-16">
          <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
            EXCLOAD SERVICE
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-5xl [word-break:keep-all]">
            주문 데이터를 택배사 양식으로 빠르게 정리합니다
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-lg [word-break:keep-all]">
            엑클로드(EXCLOAD)는 쇼핑몰 주문 엑셀, 송장 파일, 물류 주문 데이터를 택배사·물류 양식에 맞게
            변환해주는 주문/배송 업무 자동화 서비스입니다.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/trial"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 sm:w-auto"
            >
              무료로 테스트하기
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:w-auto"
            >
              가격 보기
            </Link>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {valueCards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                <Check className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-extrabold text-zinc-950 dark:text-zinc-100">{card.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{card.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:p-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black text-zinc-950 dark:text-zinc-100">서비스 이용 흐름</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              처음 사용하는 분도 3단계로 바로 결과를 확인할 수 있습니다.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-2xl bg-zinc-50 p-5 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">STEP 0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold text-zinc-950 dark:text-zinc-100">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:p-8">
          <h2 className="text-xl font-black text-zinc-950 dark:text-zinc-100">요금 안내 요약</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            FREE, PRO, YEARLY 플랜이 있으며, 사용량과 다운로드 조건에 따라 선택할 수 있습니다.
            금액·혜택 등 상세 내용은 가격 페이지에서 확인해 주세요.
          </p>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
            엑클로드는 구독형(SaaS) 서비스로, 정기결제를 통해 매월 사용량을 제공받아 이용할 수 있습니다.
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-black dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            가격 및 플랜 보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </main>
  );
}
