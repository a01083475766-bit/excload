'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import { getSignupBonusPoints } from '@/app/lib/open-beta-policy';
import Link from 'next/link';
import { useState } from 'react';

const OPEN_BETA_MALLS = [
  '쿠팡',
  '스마트스토어',
  '11번가',
  '카페24',
  '롯데ON',
  'SSG',
  'CJ온스타일',
  '샵바이',
  '고도몰',
  '메이크샵',
] as const;

const BENEFITS = [
  {
    title: '무료로 충분히 사용해 보세요',
    body: '오픈 베타 기간에는 주요 기능을 비용 부담 없이 직접 사용하고 확인할 수 있습니다.',
  },
  {
    title: '가입 즉시 50,000P 제공',
    body: '가입과 동시에 테스트에 사용할 수 있는 포인트가 지급됩니다.',
  },
  {
    title: '매월 50,000P 추가 제공',
    body: '베타 참여 기간 동안 기능을 꾸준히 확인할 수 있도록 포인트를 제공합니다.',
  },
  {
    title: '자동 유료 전환 없음',
    body: '오픈 베타가 종료되어도 별도의 동의 없이 결제되거나 유료로 전환되지 않습니다.',
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
    href: '/order/integration/shipments',
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
  { n: '02', t: '필요한 기능 선택' },
  { n: '03', t: '파일 또는 주문 자료로 테스트' },
  { n: '04', t: '불편하거나 필요한 기능 전달' },
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
    <div className="max-w-3xl">
      <h2 className="break-keep text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="mt-3 break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
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
    <section className="border-b border-zinc-200 bg-blue-600 py-12 text-white sm:py-14">
      <div className={landingContainerClass}>
        <div className="max-w-3xl">
          <h2 className="break-keep text-2xl font-bold sm:text-[1.75rem]">
            직접 사용해 보고,
            <br />
            엑클로드를 함께 완성해 주세요.
          </h2>
          <p className="mt-3 break-keep text-base leading-relaxed text-blue-50">
            오픈 베타는 완성된 기능을 단순히 구경하는 기간이 아닙니다.
            실제 주문과 배송 업무에 사용해 보고 불편한 점을 알려주세요.
            판매자에게 필요한 기능부터 확인하고 개선하겠습니다.
          </p>
        </div>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            오픈 베타 참여하기
          </Link>
          <Link
            href="/beta-feedback"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/45 px-6 text-base font-semibold text-white hover:bg-white/10"
          >
            베타 사용자 의견 보기
          </Link>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-blue-50">
          오류 제보와 개선 의견, 운영자의 확인 내용을 함께 볼 수 있습니다.
        </p>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 border-b border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-800 dark:bg-black sm:py-14">
      <div className={landingContainerClass}>
        <SectionHead
          title="엑클로드에서 할 수 있는 일"
          desc="주문을 확인하고, 필요한 양식으로 바꾸고, 송장번호를 다시 쇼핑몰에 연결하는 과정을 도와드립니다."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

/** Hero 다음: 연동 대상 쇼핑몰 → 혜택 → 참여 독려 */
export function OpenBetaLandingTop() {
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();
  const benefits = BENEFITS.map((item) =>
    item.title.includes('50,000P')
      ? { ...item, title: item.title.replaceAll('50,000P', `${signupBonusLabel}P`) }
      : item,
  );

  return (
    <>
      <section className="border-b border-zinc-200 bg-white py-8 dark:border-zinc-800 dark:bg-zinc-950 sm:py-10">
        <div className={landingContainerClass}>
          <div className="max-w-3xl">
            <h2 className="break-keep text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[1.75rem]">
              오픈 베타 연동 대상 쇼핑몰
            </h2>
            <p className="mt-3 break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              판매자 계정의 API 이용 승인 여부와 쇼핑몰별 제공 조건에 따라
              연결 가능 시점이 달라질 수 있습니다.
            </p>
          </div>
          <ul className="mt-5 flex flex-wrap gap-2">
            {OPEN_BETA_MALLS.map((mall) => (
              <li key={mall}>
                <span className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                  {mall}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 break-keep text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            사용 중인 쇼핑몰을 연결해 보고, 필요한 연동을 알려주세요.
          </p>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white py-12 dark:border-zinc-800 dark:bg-zinc-950 sm:py-14">
        <div className={landingContainerClass}>
          <SectionHead
            title="오픈 베타 참여자에게 드리는 혜택"
            desc="엑클로드의 주요 기능을 직접 사용해 보고, 판매 업무에 필요한 기능을 함께 만들어 주세요."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <FeaturesSection />
    </>
  );
}

/** 무료 테스트 다음: 업무 흐름 → 이메일 → FAQ */
export function OpenBetaLandingBottom() {
  return (
    <>
      <section className="border-b border-zinc-200 bg-white py-12 dark:border-zinc-800 dark:bg-zinc-950 sm:py-14">
        <div className={landingContainerClass}>
          <SectionHead
            title="여러 채널의 주문과 배송 업무를 하나의 흐름으로"
            desc="쇼핑몰, 엑셀, 카톡에 나뉘어 있는 주문을 정리하고 배송 처리 결과를 다시 쇼핑몰에 입력하는 반복 작업을 줄입니다."
          />
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

      <section className="border-b border-zinc-200 bg-white py-12 dark:border-zinc-800 dark:bg-zinc-950 sm:py-14">
        <div className={landingContainerClass}>
          <SectionHead
            title="아직 사용해 볼 시간이 없으신가요?"
            desc="새로운 쇼핑몰 연동과 오픈 베타 업데이트를 이메일로 알려드립니다. 현재는 고객문의 페이지에서 이메일과 함께 ‘오픈 베타 소식 신청’이라고 남겨 주세요."
          />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/contact"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-base font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              이메일로 업데이트 소식 신청하기
            </Link>
            <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              별도 자동 구독 폼은 아직 없으며, 고객문의로 신청해 주시면 됩니다.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-800 dark:bg-black sm:py-14">
        <div className={landingContainerClass}>
          <SectionHead title="자주 묻는 질문" desc="오픈 베타 이용과 관련된 안내입니다." />
          <div className="mt-4 max-w-3xl">
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
