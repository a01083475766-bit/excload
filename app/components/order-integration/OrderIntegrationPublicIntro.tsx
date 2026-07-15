import Link from 'next/link';
import { ArrowRight, Link2, Search, Send } from 'lucide-react';
import { buildAuthLoginRedirectPath } from '@/app/lib/auth/post-login-redirect';
import { ORDER_INTEGRATION_MALLS } from '@/app/lib/order-integration/malls';

const primaryActions = [
  { label: '쇼핑몰 연결하기', path: '/order/integration/connect', icon: Link2 },
  { label: '주문 조회 시작', path: '/order/integration/fetch', icon: Search },
  { label: '송장 매칭·전송', path: '/order/integration/shipments', icon: Send },
] as const;

const workflow = [
  ['1', '주문조회', '연결한 쇼핑몰에서 내 주문을 불러옵니다.'],
  ['2', '송장 매칭', '업로드한 송장 파일을 내 주문과 연결합니다.'],
  ['3', '송장 전송', '확정한 송장 정보를 쇼핑몰로 전송합니다.'],
] as const;

export default function OrderIntegrationPublicIntro() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 pb-12 pt-4 sm:px-5 lg:px-8">
      <header className="border-b border-zinc-200 pb-5">
        <h1 className="text-xl font-semibold text-zinc-950">쇼핑몰 주문연동</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
          쇼핑몰 주문을 조회하고 송장 파일을 매칭한 뒤 배송 정보를 전송할 수 있습니다.
          연결 정보와 주문 데이터는 로그인한 사용자 본인에게만 표시됩니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.path}
                href={buildAuthLoginRedirectPath(action.path)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {action.label}
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500">기능 사용 시 로그인이 필요합니다.</p>
      </header>

      <section className="border-b border-zinc-200 py-6" aria-labelledby="integration-flow-title">
        <h2 id="integration-flow-title" className="text-base font-semibold text-zinc-900">
          이용 흐름
        </h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {workflow.map(([step, title, description]) => (
            <li key={step} className="flex gap-3 border-l-2 border-blue-500 pl-3">
              <span className="text-sm font-semibold text-blue-700">{step}</span>
              <div>
                <p className="text-sm font-semibold text-zinc-900">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-6" aria-labelledby="supported-malls-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="supported-malls-title" className="text-base font-semibold text-zinc-900">
              지원 쇼핑몰
            </h2>
            <p className="mt-1 text-sm text-zinc-600">로그인 후 본인의 판매자 계정을 연결할 수 있습니다.</p>
          </div>
        </div>

        <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">
          {ORDER_INTEGRATION_MALLS.map((mall) => (
            <li
              key={mall.id}
              className="grid gap-2 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_7rem] sm:items-center"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900">{mall.name}</span>
                <span className="text-xs text-zinc-500">
                  {mall.status === 'available' ? (mall.badge === 'live' ? '지원' : '베타') : mall.preparingLabel ?? '준비 중'}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-600">{mall.description}</p>
              {mall.status === 'available' ? (
                <Link
                  href={buildAuthLoginRedirectPath(`/order/integration/${mall.id}`)}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:border-blue-500 hover:text-blue-700"
                >
                  연결하기
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : (
                <span className="text-sm text-zinc-400 sm:text-center">준비 중</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
