'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  EXCLOAD_INTEGRATION_INFO,
  getExcloadOutboundIp,
  ORDER_INTEGRATION_MALLS,
  type OrderIntegrationMallId,
} from '@/app/lib/order-integration/malls';
import {
  buildMallOverviewRows,
  isMallConnected,
  type ConnectedMallSummary,
} from '@/app/lib/order-integration/connection-status-view';
import { CopyableInfoRow } from '@/app/components/order-integration/CopyableInfoRow';
import { MallIntegrationForm } from '@/app/components/order-integration/MallIntegrationForm';
import { MallSetupGuidePanel } from '@/app/components/order-integration/MallSetupGuidePanel';
import { MALL_SETUP_GUIDES } from '@/app/lib/order-integration/mall-setup-guides';
import { CAFE24_OAUTH_REDIRECT_URI, CAFE24_OAUTH_SCOPES } from '@/app/lib/cafe24/constants';
import { EXCLOAD_MAKESHOP_OUTBOUND_IP } from '@/app/lib/makeshop/api-spec';
import { EXCLOAD_GODOMALL_OUTBOUND_IP } from '@/app/lib/godomall/api-spec';

type AvailableMallId = Exclude<OrderIntegrationMallId, 'gmarket'>;

function isAvailableMallId(id: string): id is AvailableMallId {
  return ORDER_INTEGRATION_MALLS.some((m) => m.id === id && m.status === 'available');
}

function chipClass(selected: boolean): string {
  if (selected) {
    return 'border border-blue-600 bg-blue-600 text-white';
  }
  return 'border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50';
}

/** 몰별로 판매자센터에 실제로 등록하는 항목만 표시 */
function excloadInfoOptionsForMall(mallId: AvailableMallId | null): {
  showCompany: boolean;
  showUrl: boolean;
  showIp: boolean;
  ipLabel: string;
  registerHint: string;
} {
  if (mallId === 'shopby') {
    return {
      showCompany: false,
      showUrl: false,
      showIp: false,
      ipLabel: 'IP 주소 (outbound)',
      registerHint:
        '샵바이 공용 앱·스토어 설치가 아닙니다. 본인 워크스페이스에서 개인 연동 앱을 만들고 systemKey·mallKey를 발급한 뒤 엑클로드에 입력합니다.',
    };
  }
  if (mallId === 'cafe24') {
    return {
      showCompany: false,
      showUrl: false,
      showIp: false,
      ipLabel: 'IP 주소 (outbound)',
      registerHint:
        '카페24 앱스토어 설치가 아닙니다. Developers에서 개인 연동 앱을 만들고 App URL·Redirect URI·Scope를 등록한 뒤, Client ID/Secret을 엑클로드에 입력합니다.',
    };
  }
  if (mallId === 'makeshop') {
    return {
      showCompany: true,
      showUrl: true,
      showIp: true,
      ipLabel: 'APP 접근 허용 IP',
      registerHint: '메이크샵은 엑클로드 APP 접근 허용 IP와 shop_uid가 핵심입니다.',
    };
  }
  if (mallId === 'godomall') {
    return {
      showCompany: true,
      showUrl: true,
      showIp: true,
      ipLabel: '호출 IP (제휴사·openhub)',
      registerHint: 'partner_key는 엑클로드가 보유합니다. 판매자는 user key를 입력합니다.',
    };
  }
  if (mallId === 'ssg' || mallId === 'lotteon' || mallId === 'cjonstyle' || mallId === 'eleven') {
    return {
      showCompany: true,
      showUrl: false,
      showIp: true,
      ipLabel: 'IP 주소 (outbound)',
      registerHint: '판매자센터에는 주로 엑클로드 고정 IP를 등록합니다. (일반 URL 등록 단계는 없음)',
    };
  }
  if (mallId === 'domeggook') {
    return {
      showCompany: true,
      showUrl: true,
      showIp: true,
      ipLabel: '고정 IP (로그인 ip 파라미터)',
      registerHint: '도매꾹 setLogin의 ip 파라미터에 엑클로드 고정 IP를 사용합니다.',
    };
  }
  return {
    showCompany: true,
    showUrl: true,
    showIp: true,
    ipLabel: 'IP 주소 (outbound)',
    registerHint: '판매자센터(또는 개발자센터)에 아래 값을 등록한 뒤, 발급 키를 입력합니다.',
  };
}

function ExcloadInfoList({
  outboundIp,
  extras = [],
  showCompany = true,
  showUrl = true,
  showIp = true,
  ipLabel = 'IP 주소 (outbound)',
}: {
  outboundIp: string;
  extras?: { label: string; value: string }[];
  showCompany?: boolean;
  showUrl?: boolean;
  showIp?: boolean;
  ipLabel?: string;
}) {
  const rows: { label: string; value: string; placeholder?: string }[] = [];
  if (showCompany) {
    rows.push({ label: '업체명', value: EXCLOAD_INTEGRATION_INFO.companyName });
  }
  if (showUrl) {
    rows.push({ label: 'URL', value: EXCLOAD_INTEGRATION_INFO.url });
  }
  if (showIp) {
    rows.push({
      label: ipLabel,
      value: outboundIp,
      placeholder: 'NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP 설정 필요',
    });
  }
  rows.push(...extras);

  if (rows.length === 0) {
    return null;
  }

  return (
    <dl className="divide-y divide-zinc-100 border border-zinc-200 bg-white">
      {rows.map((row) => (
        <div key={row.label} className="px-3 py-2.5 sm:px-4">
          <CopyableInfoRow label={row.label} value={row.value} placeholder={row.placeholder} />
        </div>
      ))}
    </dl>
  );
}

/**
 * 쇼핑몰 연동 설정 — 상단 선택 후 무료도구식 2열 상세.
 * 준비중·후보 채널 안내는 페이지 미노출 — docs/order-integration/connect-page-preparing-and-candidates.md
 * API/DB 로직은 기존 MallIntegrationForm을 재사용합니다.
 */
export default function OrderIntegrationPanel() {
  const outboundIp = getExcloadOutboundIp();
  const [selectedMallId, setSelectedMallId] = useState<AvailableMallId | 'all'>('all');
  const [connectedMalls, setConnectedMalls] = useState<ConnectedMallSummary[]>([]);

  const availableMalls = useMemo(
    () => ORDER_INTEGRATION_MALLS.filter((m) => m.status === 'available'),
    []
  );
  const preparingMalls = useMemo(
    () => ORDER_INTEGRATION_MALLS.filter((m) => m.status === 'preparing'),
    []
  );

  const selectedMall =
    selectedMallId === 'all' ? null : availableMalls.find((m) => m.id === selectedMallId) ?? null;
  const selectedAvailableMallId =
    selectedMall && isAvailableMallId(selectedMall.id) ? selectedMall.id : null;

  const selectedMallInfoOpts = selectedAvailableMallId
    ? excloadInfoOptionsForMall(selectedAvailableMallId)
    : null;
  const selectedMallOutboundIp = selectedAvailableMallId
    ? selectedAvailableMallId === 'makeshop'
      ? EXCLOAD_MAKESHOP_OUTBOUND_IP || outboundIp
      : selectedAvailableMallId === 'godomall'
        ? EXCLOAD_GODOMALL_OUTBOUND_IP || outboundIp
        : outboundIp
    : outboundIp;
  const selectedMallExtras =
    selectedAvailableMallId === 'cafe24'
      ? [
          { label: 'App URL', value: EXCLOAD_INTEGRATION_INFO.url },
          { label: 'Redirect URI', value: CAFE24_OAUTH_REDIRECT_URI },
          { label: 'Scope', value: CAFE24_OAUTH_SCOPES },
        ]
      : [];

  const refreshConnectedMalls = useCallback(async () => {
    try {
      const res = await fetch('/api/order/integration/connected-malls');
      if (!res.ok) return;
      const data = (await res.json()) as {
        malls?: {
          mallId: string;
          name: string;
          accountName: string;
          status: string;
          lastCheckedAt: string | null;
        }[];
      };
      setConnectedMalls(
        (data.malls ?? []).map((m) => ({
          mallId: m.mallId as ConnectedMallSummary['mallId'],
          name: m.name,
          accountName: m.accountName,
          status: m.status,
          lastCheckedAt: m.lastCheckedAt ?? null,
        }))
      );
    } catch {
      // 연결 상태 표시는 부가 기능 — 실패 시 조용히 무시
    }
  }, []);

  // 최초 진입 + 탭 전환 시 서버의 실제 저장된 연결 상태를 다시 읽는다.
  useEffect(() => {
    void refreshConnectedMalls();
  }, [refreshConnectedMalls, selectedMallId]);

  // 다른 창/탭에서 저장·해제 후 돌아온 경우도 반영.
  useEffect(() => {
    const onFocus = () => void refreshConnectedMalls();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshConnectedMalls]);

  const overviewRows = useMemo(() => buildMallOverviewRows(connectedMalls), [connectedMalls]);

  return (
    <div className="mx-auto max-w-6xl px-3 pb-12 pt-1.5 sm:px-5 lg:px-8">
      <Link
        href="/order/integration"
        className="mb-3 inline-block text-sm text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
      >
        주문연동으로 돌아가기
      </Link>

      <header className="mb-6 border-b border-gray-200 pb-5">
        <h1 className="text-xl font-semibold text-gray-900">쇼핑몰 연동 설정</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          쇼핑몰을 선택한 뒤, 판매자센터(또는 개발자센터)에서 키를 발급·등록하고 엑클로드에 입력해
          연동합니다. 등록할 항목(IP·URL 등)은 쇼핑몰마다 다릅니다.
        </p>
        <p className="mt-3 text-sm text-gray-500">
          <Link
            href="/order/integration?focus=shipment-match"
            className="text-blue-600 underline-offset-2 hover:underline"
          >
            송장 매칭·전송
          </Link>
          <span className="mx-1.5 text-gray-300">·</span>
          주문 수집 후 송장번호를 쇼핑몰로 보낼 때 사용합니다.
        </p>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">연동 순서</h2>
        <ol className="space-y-2 text-sm leading-relaxed text-gray-700 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-2 sm:space-y-0">
          <li className="flex gap-3">
            <span className="w-5 shrink-0 font-medium text-gray-400">1</span>
            <span>판매자센터에서 API(또는 앱)를 발급합니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 shrink-0 font-medium text-gray-400">2</span>
            <span>쇼핑몰별로 필요한 엑클로드 정보(IP·Redirect URI 등)만 등록합니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 shrink-0 font-medium text-gray-400">3</span>
            <span>발급 키를 입력하고 저장한 뒤 연결 테스트를 합니다.</span>
          </li>
        </ol>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">엑클로드 공통 정보</h2>
        <ExcloadInfoList outboundIp={outboundIp} />
        <p className="mt-2 text-xs text-zinc-500">
          쇼핑몰을 선택하면, 그 몰에서 실제로 쓰는 등록 항목만 아래에 다시 표시됩니다.
        </p>
        {!outboundIp ? (
          <p className="mt-2 text-xs text-amber-700">
            운영 고정 IP가 없으면 IP 등록이 필요한 몰에서는 연동이 불가할 수 있습니다.
          </p>
        ) : null}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">쇼핑몰 선택</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => setSelectedMallId('all')}
            className={`flex h-11 w-full items-center justify-center rounded-lg px-2 text-sm font-medium transition ${chipClass(selectedMallId === 'all')}`}
          >
            전체
          </button>
          {availableMalls.map((mall) => {
            const selected = selectedMallId === mall.id;
            const connected = isMallConnected(mall.id, connectedMalls);
            return (
              <button
                key={mall.id}
                type="button"
                title={
                  connected
                    ? `${mall.name} (설정됨)`
                    : mall.badge === 'dev'
                      ? `${mall.name} (개발진행중)`
                      : mall.badge === 'beta'
                        ? `${mall.name} (베타)`
                        : mall.name
                }
                onClick={() => setSelectedMallId(mall.id as AvailableMallId)}
                className={`flex h-11 w-full items-center justify-center gap-1 overflow-hidden rounded-lg px-2 text-sm font-medium transition ${chipClass(selected)}`}
              >
                <span className="truncate">{mall.name}</span>
                {connected ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${
                      selected ? 'text-emerald-100' : 'text-emerald-600'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-emerald-200' : 'bg-emerald-500'}`}
                      aria-hidden
                    />
                    설정됨
                  </span>
                ) : mall.badge === 'dev' ? (
                  <span
                    className={`shrink-0 text-[11px] ${selected ? 'text-blue-100' : 'text-zinc-400'}`}
                  >
                    개발진행중
                  </span>
                ) : mall.badge === 'beta' ? (
                  <span
                    className={`shrink-0 text-[11px] ${selected ? 'text-blue-100' : 'text-zinc-400'}`}
                  >
                    베타
                  </span>
                ) : null}
              </button>
            );
          })}
          {preparingMalls.map((mall) => (
            <button
              key={mall.id}
              type="button"
              disabled
              aria-disabled="true"
              title={`${mall.name} (준비중)`}
              className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-1 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm font-medium text-zinc-400"
            >
              <span className="truncate">{mall.name}</span>
              <span className="shrink-0 text-[11px] text-zinc-400">
                {mall.preparingLabel ?? '준비중'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selectedMall && isAvailableMallId(selectedMall.id) ? (
        <section className="mb-8">
          <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
            <div className="space-y-5">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
                <h3 className="text-lg font-bold text-zinc-950">
                  {selectedAvailableMallId === 'cafe24'
                    ? '카페24 개인 앱 등록 정보'
                    : selectedAvailableMallId === 'shopby'
                      ? '샵바이 개인 연동 키 등록'
                      : `${selectedMall.name} · 엑클로드 등록 정보`}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {selectedMallInfoOpts?.registerHint}
                </p>
                <div className="mt-5">
                  <ExcloadInfoList
                    outboundIp={selectedMallOutboundIp}
                    showCompany={selectedMallInfoOpts?.showCompany}
                    showUrl={selectedMallInfoOpts?.showUrl}
                    showIp={selectedMallInfoOpts?.showIp}
                    ipLabel={selectedMallInfoOpts?.ipLabel}
                    extras={selectedMallExtras}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
                <MallIntegrationForm
                  mallId={selectedMall.id}
                  mallName={selectedMall.name}
                  embedded
                  onConnectionChange={() => void refreshConnectedMalls()}
                />
              </div>
            </div>

            <div className="xl:sticky xl:top-24 xl:z-10 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
              <MallSetupGuidePanel
                guide={MALL_SETUP_GUIDES[selectedMall.id]}
                mallName={selectedMall.name}
                mallId={selectedMall.id}
              />
            </div>
          </div>
        </section>
      ) : null}

      {selectedMallId === 'all' ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">쇼핑몰별 설정 상태</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">쇼핑몰</th>
                  <th className="px-4 py-2.5 font-semibold">상태</th>
                  <th className="px-4 py-2.5 font-semibold">계정명</th>
                  <th className="px-4 py-2.5 text-right font-semibold">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {overviewRows.map((row) => (
                  <tr key={row.mallId} className={row.isPreparing ? 'text-zinc-400' : ''}>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      <span className={row.isPreparing ? 'text-zinc-500' : ''}>{row.name}</span>
                      {row.badge === 'dev' && !row.connected && !row.isPreparing ? (
                        <span className="ml-1.5 text-[11px] text-zinc-400">개발진행중</span>
                      ) : row.badge === 'beta' && !row.connected && !row.isPreparing ? (
                        <span className="ml-1.5 text-[11px] text-zinc-400">베타</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.connected ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                          {row.statusLabel}
                        </span>
                      ) : row.isPreparing ? (
                        <span className="text-sm text-zinc-400">{row.statusLabel}</span>
                      ) : (
                        <span className="text-sm text-zinc-500">{row.statusLabel}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{row.accountName ?? '-'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {row.action === 'none' ? (
                        <span className="text-xs text-zinc-400">-</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedMallId(row.mallId as AvailableMallId)}
                          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            row.action === 'manage'
                              ? 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {row.actionLabel}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            파란 배경 버튼은 현재 선택된 쇼핑몰입니다. ‘설정됨’은 연동 정보가 저장된 상태이고, ‘준비중’은 아직 선택할 수 없습니다.
          </p>
        </section>
      ) : null}
    </div>
  );
}
