'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
  ORDER_INTEGRATION_MALLS,
  type OrderIntegrationMall,
} from '@/app/lib/order-integration/malls';
import {
  getNextApiDirectCandidates,
  getInquiryApprovalDirectChannelsForUi,
  getPriorityHubChannels,
  HUB_OR_EXCEL_PRIORITY_ROADMAP,
} from '@/app/lib/order-integration/mall-integration-specs';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';

function mallStatusLabel(mall: OrderIntegrationMall): string {
  if (mall.status !== 'available') return mall.preparingLabel ?? '준비중';
  if (mall.badge === 'live') return '운영';
  if (mall.badge === 'beta') return '베타';
  return '연동 가능';
}

/**
 * 쇼핑몰 연동 설정 — 목록·등록 안내.
 * 카드/컬러 배너 대신 목록·표 중심으로 실무형 UI.
 */
export default function OrderIntegrationPanel() {
  const outboundIp = getExcloadOutboundIp();
  const [moreOpen, setMoreOpen] = useState(false);

  const availableMalls = ORDER_INTEGRATION_MALLS.filter((m) => m.status === 'available');
  const preparingMalls = ORDER_INTEGRATION_MALLS.filter((m) => m.status !== 'available');
  const nextApiChannels = getNextApiDirectCandidates();
  const inquiryChannels = getInquiryApprovalDirectChannelsForUi();
  const priorityHubs = getPriorityHubChannels();

  return (
    <div className="mx-auto max-w-[720px] px-3 pb-12 pt-1.5 sm:px-5 lg:px-8">
      <Link
        href="/order/integration"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        쇼핑몰주문연동으로
      </Link>

      <header className="mb-8 border-b border-gray-200 pb-5">
        <h1 className="text-xl font-semibold text-gray-900">쇼핑몰 연동 설정</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          판매자센터에서 API 키를 발급한 뒤, 아래 엑클로드 정보를 등록하고 쇼핑몰을 선택해
          연동합니다.
        </p>
        <p className="mt-3 text-sm text-gray-500">
          <Link
            href="/order/integration/shipments"
            className="text-blue-600 underline-offset-2 hover:underline"
          >
            송장 매칭·전송
          </Link>
          <span className="mx-1.5 text-gray-300">·</span>
          주문 수집 후 송장번호를 쇼핑몰로 보낼 때 사용합니다.
        </p>
      </header>

      {/* 1. 준비 안내 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">연동 순서</h2>
        <ol className="space-y-2 text-sm leading-relaxed text-gray-700">
          <li className="flex gap-3">
            <span className="w-5 shrink-0 font-medium text-gray-400">1</span>
            <span>판매자센터에서 API(또는 앱)를 발급합니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 shrink-0 font-medium text-gray-400">2</span>
            <span>판매자센터에 아래 엑클로드 업체명·URL·IP를 등록합니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 shrink-0 font-medium text-gray-400">3</span>
            <span>쇼핑몰을 선택한 뒤 키를 입력하고 API 테스트 후 저장합니다.</span>
          </li>
        </ol>
      </section>

      {/* 2. 엑클로드 정보 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          판매자센터에 등록할 엑클로드 정보
        </h2>
        <div className="divide-y divide-gray-100 border border-gray-200 bg-white px-4 py-1">
          <div className="py-3">
            <CopyableInfoRow label="업체명" value={EXCLOAD_INTEGRATION_INFO.companyName} />
          </div>
          <div className="py-3">
            <CopyableInfoRow label="URL" value={EXCLOAD_INTEGRATION_INFO.url} />
          </div>
          <div className="py-3">
            <CopyableInfoRow
              label="IP 주소 (outbound)"
              value={outboundIp}
              placeholder="NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP 설정 필요"
            />
          </div>
        </div>
        {!outboundIp ? (
          <p className="mt-2 text-xs text-amber-700">
            운영 고정 IP가 없으면 판매자센터 화이트리스트 등록이 불가할 수 있습니다.
          </p>
        ) : null}
      </section>

      {/* 3. 쇼핑몰 목록 — 표형 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">쇼핑몰 선택</h2>
        <div className="border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-100">
            {availableMalls.map((mall) => (
              <li key={mall.id}>
                <Link
                  href={`/order/integration/${mall.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-gray-900">{mall.name}</span>
                      <span className="text-xs text-gray-500">{mallStatusLabel(mall)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{mall.description}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-blue-600">
                    설정
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {preparingMalls.length > 0 ? (
          <div className="mt-3 border border-gray-100 bg-gray-50">
            <p className="border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
              준비중
            </p>
            <ul className="divide-y divide-gray-100">
              {preparingMalls.map((mall) => (
                <li
                  key={mall.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-500"
                >
                  <span>{mall.name}</span>
                  <span className="text-xs">{mallStatusLabel(mall)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 4. 부가 정보 — 기본 접힘 */}
      <section className="border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="text-sm text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
        >
          {moreOpen ? '추가 채널·안내 접기' : '추가 채널·안내 보기'}
        </button>

        {moreOpen ? (
          <div className="mt-4 space-y-5 text-sm text-gray-600">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                API 개발 후보
              </h3>
              <ul className="list-inside list-disc space-y-1 text-xs">
                {nextApiChannels.map((ch) => (
                  <li key={ch.channelCode}>
                    {ch.channelName}
                    {ch.channelCode === 'shopify'
                      ? ' — Shopify OAuth 앱 등록 후 검토'
                      : ` — ${ch.requiredSellerAction}`}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                문의·승인 필요
              </h3>
              <ul className="list-inside list-disc space-y-1 text-xs">
                {inquiryChannels.map((ch) => (
                  <li key={ch.channelCode}>
                    {ch.channelName} — {ch.requiredSellerAction}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                허브·엑셀 우선
              </h3>
              <ul className="list-inside list-disc space-y-1 text-xs">
                {HUB_OR_EXCEL_PRIORITY_ROADMAP.map((item) => (
                  <li key={item.code}>{item.name}</li>
                ))}
                {priorityHubs.map((hub) => (
                  <li key={hub.channelCode}>{hub.channelName} (검토 중)</li>
                ))}
              </ul>
            </div>
            <p className="text-xs leading-relaxed text-gray-500">
              관리자 전용입니다. 메인 연동은 쇼핑몰별 직접 API입니다. G마켓/옥션은 ESM 제휴 승인
              전까지 설정할 수 없습니다.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
