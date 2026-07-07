'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Link2, Clock } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
  ORDER_INTEGRATION_MALLS,
  type OrderIntegrationMall,
} from '@/app/lib/order-integration/malls';
import { getPriorityHubChannels } from '@/app/lib/order-integration/mall-integration-specs';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';

function MallBadge({ badge }: { badge?: OrderIntegrationMall['badge'] }) {
  if (badge === 'live') {
    return (
      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
        운영
      </span>
    );
  }
  if (badge === 'beta') {
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        베타
      </span>
    );
  }
  if (badge === 'planned') {
    return (
      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-100">
        예정
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
      연동 가능
    </span>
  );
}

function MallCard({ mall }: { mall: OrderIntegrationMall }) {
  const isAvailable = mall.status === 'available';

  const cardInner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{mall.name}</h2>
        {isAvailable ? (
          <MallBadge badge={mall.badge} />
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
  const [hubSectionOpen, setHubSectionOpen] = useState(false);
  const priorityHubs = getPriorityHubChannels();

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
        <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
          {' '}
          메인 연동 방식은 쇼핑몰별 직접 API(direct)입니다.
        </strong>{' '}
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

      <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">쇼핑몰 직접 연동 (direct)</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ORDER_INTEGRATION_MALLS.map((mall) => (
          <MallCard key={mall.id} mall={mall} />
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 dark:border-zinc-600 dark:bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setHubSectionOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            이미 통합솔루션(플레이오토·사방넷·이지어드민)을 사용 중인가요?
          </span>
          {hubSectionOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
          )}
        </button>
        {hubSectionOpen ? (
          <div className="border-t border-dashed border-zinc-300 px-4 py-3 dark:border-zinc-600">
            <p className="mb-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              허브 연동은 <strong className="font-medium">보조 기능</strong>입니다. 이미 유료 통합솔루션으로
              주문을 관리 중이라면, 해당 주문 데이터를 엑클로드로 가져와 택배사 양식 변환·카톡 주문 통합 등에
              활용할 수 있습니다. 단순 주문 수집만을 위해 엑클로드를 추가로 쓰는 용도는 아닙니다. 동일
              쇼핑몰은 direct 연동과 동시에 켤 수 없습니다.
            </p>
            <ul className="space-y-2">
              {priorityHubs.map((hub) => (
                <li
                  key={hub.channelCode}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{hub.channelName}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                    <Clock className="h-3 w-3" />
                    검토 중
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <p className="mt-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        관리자 전용 화면입니다. 쿠팡(운영), 나머지 9개 몰 direct API(베타) 코드 배포 완료.
        허브(플레이오토·사방넷·이지어드민)는 API·계약 검토 단계이며 구현 미완입니다.
        실연동 테스트는 개발자센터 App 등록 및 Lightsail 프록시 1회 반영 후 진행합니다.
      </p>
    </div>
  );
}
