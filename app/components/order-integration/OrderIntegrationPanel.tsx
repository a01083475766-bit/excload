'use client';

import Link from 'next/link';
import { ArrowLeft, Link2, Clock } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
  ORDER_INTEGRATION_MALLS,
  type OrderIntegrationMall,
} from '@/app/lib/order-integration/malls';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';

function MallCard({ mall }: { mall: OrderIntegrationMall }) {
  const isAvailable = mall.status === 'available';

  const cardInner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{mall.name}</h2>
        {isAvailable ? (
          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
            연동 가능
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <Clock className="h-3 w-3" />
            준비중
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{mall.description}</p>
      {isAvailable ? (
        <p className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400">연동 설정 →</p>
      ) : null}
    </>
  );

  if (!isAvailable) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 opacity-90 dark:border-zinc-700 dark:bg-zinc-900/60">
        {cardInner}
      </div>
    );
  }

  return (
    <Link
      href={`/order/integration/${mall.id}`}
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-500"
    >
      {cardInner}
    </Link>
  );
}

export default function OrderIntegrationPanel() {
  const outboundIp = getExcloadOutboundIp();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-10 sm:px-6">
      <Link
        href="/order-convert"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        택배주문변환으로 돌아가기
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">주문연동</h1>
      </div>

      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        쇼핑몰 판매자센터에서 발급한 API 키를 등록하면 주문을 자동으로 수집할 수 있습니다.
        아래 정보를 판매자센터 API 설정에 입력한 뒤, 쇼핑몰별 연동을 진행해 주세요.
      </p>

      <section className="mb-8 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <h2 className="mb-3 text-sm font-bold text-blue-900 dark:text-blue-100">
          판매자센터에 등록할 엑클로드 정보
        </h2>
        <dl className="space-y-3">
          <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          <CopyableInfoRow
            label="IP 주소 (운영 서버 고정 outbound IP)"
            value={outboundIp}
            placeholder="NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP 환경변수 설정 필요"
          />
        </dl>
        {!outboundIp ? (
          <p className="mt-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            운영 서버 고정 IP가 아직 설정되지 않았습니다. IP가 변경되면 사용자 연동이 끊길 수 있으므로
            배포 전 반드시 고정 IP를 확보해 주세요.
          </p>
        ) : null}
      </section>

      <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">쇼핑몰 선택</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ORDER_INTEGRATION_MALLS.map((mall) => (
          <MallCard key={mall.id} mall={mall} />
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        관리자 전용 준비 화면입니다. 쿠팡 → 11번가 순으로 연동 기능을 구현할 예정이며, 스마트스토어는
        네이버 커머스 API 공식 절차 검토 후 제공합니다.
      </p>
    </div>
  );
}
