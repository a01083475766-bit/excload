'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Download,
  ShieldCheck,
  Truck,
  Upload,
  Zap,
} from 'lucide-react';

const containerClass = 'max-w-6xl mx-auto w-full px-0';

const carriers = [
  'CJ대한통운',
  '로젠택배',
  '한진택배',
  '롯데택배',
  'CU편의점택배',
  'GSPostbox택배',
  '우체국택배',
  '대신택배',
  '일양로지스',
  '합동택배',
  '경동택배',
  '천일택배',
] as const;

/** 참고 랜딩(이미지·코드) — 히어로 직후: 핵심 가치 + 사용 단계 + 택배사 */
export function LandingWhyHowCarriers() {
  return (
    <>
      <section
        aria-labelledby="landing-why-heading"
        className="border-t border-zinc-200/80 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-950/40 lg:py-24"
      >
        <div className={containerClass}>
          <div className="mb-14 text-center">
            <h2
              id="landing-why-heading"
              className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl"
            >
              왜 엑클로드인가요?
            </h2>
            <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">
              복잡한 AI 설명은 빼고, 핵심만 말씀드릴게요.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <article className="rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                <Zap className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <h3 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">1초 변환</h3>
              <p className="leading-relaxed text-zinc-500 dark:text-zinc-400">
                엑셀 파일을 업로드하면 1초 만에 택배사 양식으로 자동 변환됩니다. 복잡한 수식이나 매크로는 필요
                없어요.
              </p>
            </article>
            <article className="rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 text-white">
                <Truck className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <h3 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">모든 택배사 지원</h3>
              <p className="leading-relaxed text-zinc-500 dark:text-zinc-400">
                CJ대한통운, 로젠, 한진, 롯데 등 국내 주요 택배사 양식을 모두 지원합니다. 원하는 양식만 선택하세요.
              </p>
            </article>
            <article className="rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
                <ShieldCheck className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <h3 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">에러 제로</h3>
              <p className="leading-relaxed text-zinc-500 dark:text-zinc-400">
                수작업으로 인한 오타와 누락이 사라집니다. 정확한 데이터 변환으로 반송과 클레임을 줄이세요.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 dark:bg-zinc-950 lg:py-24">
        <div className={containerClass}>
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">
              3단계로 끝나요
            </h2>
            <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">배울 것 없이, 바로 쓸 수 있습니다.</p>
          </div>
          <div className="relative grid gap-12 md:grid-cols-3 md:gap-8">
            <div
              className="pointer-events-none absolute left-[16%] right-[16%] top-[2.35rem] hidden h-0.5 bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 md:block"
              aria-hidden
            />
            <div className="relative z-10 text-center">
              <div className="relative z-10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 dark:border-blue-800 dark:from-blue-950/50 dark:to-zinc-900 dark:text-blue-400">
                <Upload className="h-10 w-10" strokeWidth={1.5} aria-hidden />
              </div>
              <span className="mb-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                STEP 01
              </span>
              <h3 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">엑셀/이미지 업로드</h3>
              <p className="mx-auto max-w-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                주문이 담긴 엑셀 파일이나 스크린샷 이미지를 드래그 앤 드롭으로 올리세요. 카카오톡 주문 텍스트도
                붙여넣기 가능합니다.
              </p>
            </div>
            <div className="relative z-10 text-center">
              <div className="relative z-10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 dark:border-blue-800 dark:from-blue-950/50 dark:to-zinc-900 dark:text-blue-400">
                <Check className="h-10 w-10" strokeWidth={1.5} aria-hidden />
              </div>
              <span className="mb-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                STEP 02
              </span>
              <h3 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">택배사 양식 선택</h3>
              <p className="mx-auto max-w-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                사용 중이신 택배사 양식을 선택하세요. 이미 등록된 내 양식이 있다면 그대로 적용됩니다.
              </p>
            </div>
            <div className="relative z-10 text-center">
              <div className="relative z-10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 dark:border-blue-800 dark:from-blue-950/50 dark:to-zinc-900 dark:text-blue-400">
                <Download className="h-10 w-10" strokeWidth={1.5} aria-hidden />
              </div>
              <span className="mb-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                STEP 03
              </span>
              <h3 className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">변환 완료, 다운로드</h3>
              <p className="mx-auto max-w-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                1초 만에 변환된 엑셀 파일을 다운로드하세요. 택배사 시스템에 바로 업로드할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="carriers"
        className="border-t border-zinc-200/80 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-950/40 lg:py-24"
      >
        <div className={containerClass}>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">
              국내 주요 택배사 모두 지원
            </h2>
            <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">
              사용하시는 택배사 양식을 선택하면, 그에 맞춰 자동 변환됩니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 lg:gap-4">
            {carriers.map((name) => (
              <div
                key={name}
                className="flex min-h-[3.25rem] items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-3 text-center text-sm font-medium text-zinc-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
              >
                {name}
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            그 외에도 다양한 택배사 양식을 계속 추가하고 있습니다.
          </p>
        </div>
      </section>
    </>
  );
}

/** 참고 랜딩 CTA — 기존 가격 블록 직전(전환 유도), 레이아웃 푸터는 그대로 유지 */
export function LandingPrePricingCta() {
  return (
    <section className="relative overflow-hidden py-16 lg:py-24">
      <div
        className="absolute inset-0 bg-gradient-to-br from-blue-800 via-blue-900 to-[#0f172a]"
        aria-hidden
      />
      <div className="absolute -right-20 top-0 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" aria-hidden />
      <div className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden />
      <div className={`relative z-10 ${containerClass} px-4 text-center sm:px-6`}>
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          지금, 주문 정리를 자동화하세요
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-blue-100/95">
          무료 체험으로 시작해보세요. 복잡한 설정 없이 바로 사용할 수 있습니다.
        </p>
        <Link
          href="/trial"
          className="mt-10 inline-flex items-center gap-2 rounded-xl bg-white px-10 py-4 text-base font-semibold text-blue-600 shadow-xl transition hover:scale-[1.02] hover:bg-blue-50"
        >
          무료로 시작하기
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
        <p className="mt-6 text-sm text-blue-200/70">
          가입비 없음 · 언제든 해지 가능 · 무료 플랜 영구 사용
        </p>
      </div>
    </section>
  );
}
