'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import OpenBetaDemoVideo from '@/app/components/landing/OpenBetaDemoVideo';
import { getVisibleIntegrationMallNames } from '@/app/lib/order-integration/malls';
import { getSignupBonusPoints } from '@/app/lib/open-beta-policy';
import Link from 'next/link';
import { useState } from 'react';

const BENEFITS = [
  {
    title: '가입 즉시 50,000P 제공',
    body: '회원가입만 하면 바로 주문정리·송장변환을 시작할 수 있습니다.',
  },
  {
    title: '매월 50,000P 추가 제공',
    body: '베타 기간 동안 매월 사용량이 리셋·지급됩니다. 텍스트 변환 시 글자 수만큼 차감됩니다.',
  },
  {
    title: '주문연동·파일 변환 우선 이용',
    body: '스마트스토어·쿠팡 등 주문연동과 엑셀 다운로드 무제한을 오픈 베타에서 먼저 이용할 수 있습니다.',
  },
  {
    title: '자동 유료 전환 없음',
    body: '베타 종료 후에도 자동 결제로 전환되지 않습니다. 정식 요금은 별도 안내 후 선택합니다.',
  },
] as const;

type FeatureCard = {
  title: string;
  body: string;
  flow: string;
  actionLabel?: string;
  href?: string;
  status?: string;
};

const FEATURES: FeatureCard[] = [
  {
    title: '쇼핑몰 주문연동',
    body: '쿠팡·스마트스토어 등 여러 쇼핑몰의 주문을 한곳에서 확인하고 배송 업무로 연결합니다.',
    flow: '쇼핑몰 주문 API → 주문 목록 확인',
    actionLabel: '오픈 베타로 이용하기',
    href: '/order/integration',
  },
  {
    title: '카톡 주문 변환',
    body: '카카오톡으로 받은 주문 내용을 이름, 연락처, 주소, 상품, 수량 등의 항목으로 정리합니다.',
    flow: '카톡 주문 내용 → 주문 항목 정리',
    actionLabel: '직접 붙여넣어 테스트하기',
    href: '#free-trial',
  },
  {
    title: '택배사 양식 변환',
    body: '주문 파일을 CJ대한통운, 롯데택배, 한진택배, 로젠택배 등 사용하는 택배사 양식에 맞게 변환합니다.',
    flow: '주문 엑셀 → 택배사 양식',
    actionLabel: '엑셀 파일 변환하기',
    href: '/order-convert',
  },
  {
    title: '물류사 양식 변환',
    body: '판매자가 가진 주문 파일을 사용하는 물류사 또는 출고 양식에 맞춰 정리합니다.',
    flow: '주문 파일 → 물류·출고양식',
    actionLabel: '변환 기능 살펴보기',
    href: '/logistics-convert',
  },
  {
    title: '송장번호 변환·매칭',
    body: '택배사에서 받은 출고 결과를 주문과 연결하고 쇼핑몰별 송장 입력 파일로 변환합니다.',
    flow: '주문 파일 + 송장 파일 → 송장 업로드 파일',
    actionLabel: '송장 변환 사용하기',
    href: '/invoice-file-convert',
  },
  {
    title: '쇼핑몰 송장 전송',
    body: '연결된 쇼핑몰 주문에 택배사와 송장번호를 전송해 배송 처리를 이어갑니다.',
    flow: '매칭된 송장 → 쇼핑몰 전송',
    status: '오픈 베타',
    actionLabel: '송장 전송 화면 보기',
    href: '/order/integration?focus=shipment-match',
  },
];

const FLOW = [
  '주문 가져오기',
  '주문 내용 정리',
  '택배·물류 파일 만들기',
  '송장번호 연결',
  '쇼핑몰 송장 전송',
] as const;

const JOIN_STEPS = [
  { n: '01', t: '무료 회원가입' },
  { n: '02', t: '주문연동·파일 변환 테스트' },
  { n: '03', t: '불편하거나 필요한 기능 전달' },
  { n: '04', t: '프로 플랜 혜택 검토' },
] as const;

const FAQ_ITEMS = [
  {
    q: '정말 무료로 이용할 수 있나요?',
    a: '네. 현재 오픈 베타 기간에는 주요 기능을 무료로 이용할 수 있습니다. 가입 시 포인트가 제공되며, 텍스트 변환 시에만 글자 수만큼 포인트가 차감됩니다.',
  },
  {
    q: '카드 등록이 필요한가요?',
    a: '아니요. 오픈 베타 참여와 무료 이용을 위해 카드 등록은 필요하지 않습니다.',
  },
  {
    q: '자동으로 결제되거나 유료 전환되나요?',
    a: '아니요. 오픈 베타 이용자는 별도의 동의 없이 자동으로 유료 전환되지 않습니다.',
  },
  {
    q: '어떤 쇼핑몰을 지원하나요?',
    a: '주문 파일·카톡 텍스트 변환은 여러 쇼핑몰·자사몰 파일을 대상으로 사용할 수 있습니다. 쇼핑몰 API 주문연동은 오픈 베타에서 순차적으로 지원합니다.',
  },
  {
    q: '업로드한 주문 자료는 어떻게 처리되나요?',
    a: '변환·연동 처리에 사용됩니다. 보관 기간 등 세부 운영 정책은 서비스 약관·개인정보처리방침을 확인해 주세요.',
  },
  {
    q: '오픈 베타가 끝나면 어떻게 되나요?',
    a: '정식 요금제 적용 전에 별도로 안내할 예정입니다. 현재 표시된 유료 요금제는 정식 출시 후 예상 요금이며, 베타 이용자가 자동으로 유료 전환되지는 않습니다.',
  },
] as const;

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-3 max-w-3xl sm:mb-4">
      <h2 className="break-keep text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="mt-4 break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        {desc}
      </p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="break-keep text-base font-semibold text-zinc-900 dark:text-zinc-100">{q}</span>
        <span className="shrink-0 text-zinc-400" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <p className="pb-4 break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{a}</p>
      ) : null}
    </div>
  );
}

function JoinBand() {
  return (
    <section className="border-b border-zinc-200 bg-blue-600 py-[4.2rem] text-white sm:py-20">
      <div className={landingContainerClass}>
        <div className="max-w-3xl">
          <h2 className="break-keep text-2xl font-bold sm:text-[1.75rem]">
            직접 사용해 보고,
            <br />
            엑클로드를 함께 완성해 주세요.
          </h2>
          <p className="mt-4 break-keep text-base leading-relaxed text-blue-50">
            오픈 베타는 완성된 기능을 단순히 구경하는 기간이 아닙니다.
            실제 주문과 배송 업무에 사용해 보고 불편한 점을 알려주세요.
            게시판 의견·오류 제보 등 도움 주신 분들께는 3개월·6개월·1년 프로 플랜 이용을
            검토해 드리겠습니다.
          </p>
        </div>
        <ol className="mt-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {JOIN_STEPS.map((step) => (
            <li key={step.n} className="border border-white/25 bg-white/10 px-4 py-4">
              <p className="text-xs font-bold text-blue-100">{step.n}</p>
              <p className="mt-1.5 text-base font-semibold">{step.t}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/auth"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-6 text-base font-semibold text-blue-700 hover:bg-blue-50"
          >
            오픈 베타 무료 가입
          </Link>
          <Link
            href="/beta-feedback"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/45 px-6 text-base font-semibold text-white hover:bg-white/10"
          >
            베타 피드백 남기기
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 border-b border-zinc-200 bg-zinc-50 py-[4.2rem] dark:border-zinc-800 dark:bg-black sm:py-20">
      <div className={landingContainerClass}>
        <SectionHead
          title="엑클로드에서 할 수 있는 일"
          desc="주문을 확인하고, 필요한 양식으로 바꾸고, 송장번호를 다시 쇼핑몰에 연결하는 과정을 도와드립니다."
        />
        <div className="mt-11 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="flex flex-col border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{feature.title}</h3>
                {feature.status ? (
                  <span className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900">
                    {feature.status}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 border-l-2 border-blue-600 pl-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {feature.flow}
              </p>
              <p className="mt-3 flex-1 break-keep text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                {feature.body}
              </p>
              {feature.href && feature.actionLabel ? (
                feature.href.startsWith('#') ? (
                  <a
                    href={feature.href}
                    className="mt-5 inline-flex text-base font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {feature.actionLabel}
                  </a>
                ) : (
                  <Link
                    href={feature.href}
                    className="mt-5 inline-flex text-base font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {feature.actionLabel}
                  </Link>
                )
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 오픈 베타 혜택 카드 + 참여 밴드 (연동 쇼핑몰 바로 아래) */
export function OpenBetaBenefitsAndJoin() {
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();
  const benefits = BENEFITS.map((item) =>
    item.title.includes('50,000P')
      ? { ...item, title: item.title.replaceAll('50,000P', `${signupBonusLabel}P`) }
      : item,
  );

  return (
    <>
      <section
        id="open-beta-benefits"
        className="scroll-mt-24 border-b border-zinc-200 bg-white py-[4.2rem] dark:border-zinc-800 dark:bg-zinc-950 sm:py-20"
      >
        <div className={landingContainerClass}>
          <div className="mb-3 max-w-3xl sm:mb-4">
            <h2 className="break-keep text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[1.75rem]">
              오픈 베타 참여자에게 드리는 혜택
            </h2>
            <p className="mt-4 break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              지금 가입하시면 주문연동·파일 변환 기능을 무료로 먼저 써보실 수 있습니다.
            </p>
          </div>
          <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((item) => (
              <article
                key={item.title}
                className="flex min-h-[168px] flex-col border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50 sm:p-6"
              >
                <h3 className="break-keep text-base font-bold text-zinc-950 dark:text-zinc-50 sm:text-lg">
                  {item.title}
                </h3>
                <p className="mt-3 flex-1 break-keep text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <JoinBand />
    </>
  );
}

/** Hero 다음: 연동 대상 쇼핑몰 → 혜택 → 참여 독려 */
export function OpenBetaLandingTop() {
  const visibleMalls = getVisibleIntegrationMallNames();

  return (
    <>
      <section className="border-b border-zinc-200 bg-white py-11 dark:border-zinc-800 dark:bg-zinc-950 sm:py-14">
        <div className={landingContainerClass}>
          <div className="mb-7 hidden w-full lg:block">
            <OpenBetaDemoVideo />
          </div>
          <div className="mb-3 max-w-3xl sm:mb-4">
            <h2 className="break-keep text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[1.75rem]">
              오픈 베타 연동 대상 쇼핑몰
            </h2>
            <p className="mt-4 break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              판매자 계정의 API 이용 승인 여부와 쇼핑몰별 제공 조건에 따라
              연결 가능 시점이 달라질 수 있습니다.
            </p>
          </div>
          <ul className="mt-7 flex flex-wrap gap-2">
            {visibleMalls.map((mall) => (
              <li key={mall} className="flex">
                <span className="inline-flex h-10 min-w-[7.25rem] items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-center text-sm font-medium leading-tight text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 sm:min-w-[7.75rem]">
                  {mall}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 break-keep text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            연동 가능한 쇼핑몰은 계속 추가하고 있습니다. 필요한 연동이 있으면 알려 주세요.
          </p>
        </div>
      </section>

      <OpenBetaBenefitsAndJoin />
      <FeaturesSection />
    </>
  );
}

/** 무료 테스트 다음: 업무 흐름 → 이메일 → FAQ */
export function OpenBetaLandingBottom() {
  return (
    <>
      <section className="border-b border-zinc-200 bg-white py-[4.2rem] dark:border-zinc-800 dark:bg-zinc-950 sm:py-20">
        <div className={landingContainerClass}>
          <SectionHead
            title="여러 채널의 주문과 배송 업무를 하나의 흐름으로"
            desc="쇼핑몰, 엑셀, 카톡에 나뉘어 있는 주문을 정리하고 배송 처리 결과를 다시 쇼핑몰에 입력하는 반복 작업을 줄입니다."
          />
          <ol className="mt-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((label, index) => (
              <li
                key={label}
                className="border border-zinc-200 bg-zinc-50 px-4 py-5 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <p className="text-xs font-bold text-blue-600">{String(index + 1).padStart(2, '0')}</p>
                <p className="mt-2 break-keep text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {label}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white py-[4.2rem] dark:border-zinc-800 dark:bg-zinc-950 sm:py-20">
        <div className={landingContainerClass}>
          <SectionHead
            title="아직 사용해 볼 시간이 없으신가요?"
            desc="새로운 쇼핑몰 연동과 오픈 베타 업데이트를 이메일로 알려드립니다. 이메일만 남겨 주시면 됩니다."
          />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/contact?intent=beta-news"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-base font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              이메일로 업데이트 소식 신청하기
            </Link>
            <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              이메일 입력만으로 신청할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-zinc-50 py-[4.2rem] dark:border-zinc-800 dark:bg-black sm:py-20">
        <div className={landingContainerClass}>
          <SectionHead title="자주 묻는 질문" desc="오픈 베타 이용과 관련된 안내입니다." />
          <div className="mt-6 max-w-3xl">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function OpenBetaLandingSections() {
  return (
    <>
      <OpenBetaLandingTop />
      <OpenBetaLandingBottom />
    </>
  );
}
