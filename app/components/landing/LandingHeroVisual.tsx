'use client';

import { useCallback, useEffect, useState } from 'react';

type HeroScene = 'order-link' | 'file-convert' | 'invoice';
type ShoppingMallKey = 'naver' | 'eleven' | 'coupang';

const SCENES: {
  key: HeroScene;
  label: string;
  title: string;
  desc: string;
  status: string;
}[] = [
  {
    key: 'order-link',
    label: '주문연동',
    title: '쇼핑몰 주문을 한곳에서',
    desc: '연동된 주문을 바로 정리 흐름으로 이어갑니다.',
    status: '오픈 베타',
  },
  {
    key: 'file-convert',
    label: '파일 정리',
    title: '엑셀·카톡 주문을 표로',
    desc: '복사·붙여넣기만으로 택배 업로드용 항목으로 정리됩니다.',
    status: '사용 가능',
  },
  {
    key: 'invoice',
    label: '송장변환',
    title: '쇼핑몰·택배사 업로드용으로',
    desc: '송장번호를 매칭해 쇼핑몰 송장 업로드·택배사 업로드 양식으로 변환합니다.',
    status: '사용 가능',
  },
];

const LINK_MALLS: { key: ShoppingMallKey; name: string; count: string }[] = [
  { key: 'coupang', name: '쿠팡', count: '5건' },
  { key: 'naver', name: '스마트스토어', count: '4건' },
  { key: 'eleven', name: '11번가', count: '3건' },
];

const COURIERS = [
  { logo: 'CJ', name: 'CJ대한통운', color: '#0f5ca8' },
  { logo: 'LOGEN', name: '로젠택배', color: '#b07a1f' },
  { logo: 'HANJIN', name: '한진택배', color: '#0f75bc' },
];

const TABLE_HEADERS = ['수령인', '연락처', '주소', '상품'];
const TABLE_ROWS = [
  ['김민수', '010-12**-5678', '서울 강남구', '에코백 2'],
  ['이서연', '010-98**-1234', '부산 해운대구', '텀블러 1'],
  ['박지훈', '010-55**-8899', '대구 수성구', '노트 3'],
];

const ROTATE_MS = 4200;
const CARD_HEIGHT_CLASS = 'h-[500px] sm:h-[520px] lg:h-[520px]';
const SCENE_HEADER_HEIGHT_CLASS = 'h-[4.5rem]';
const SCENE_STAGE_HEIGHT_CLASS = 'h-[292px]';

function ShoppingMallBrand({ type }: { type: ShoppingMallKey }) {
  if (type === 'naver') {
    return <span className="text-[13px] font-black leading-none text-[#03c75a]">NAVER</span>;
  }
  if (type === 'eleven') {
    return <span className="text-[15px] font-black leading-none text-[#ef3340]">11&gt;</span>;
  }
  return (
    <span className="text-[12px] font-black leading-none">
      <span className="text-[#6b1d1d]">cou</span>
      <span className="text-[#f59e0b]">p</span>
      <span className="text-[#16a34a]">a</span>
      <span className="text-[#2563eb]">n</span>
      <span className="text-[#38bdf8]">g</span>
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === '사용 가능'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : 'border-blue-300 bg-blue-50 text-blue-900';
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${tone}`}>
      {status}
    </span>
  );
}

function PanelHeader({ status }: { status: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">엑클로드 작업 화면</h2>
      <StatusPill status={status} />
    </div>
  );
}

function ExcelTable({ compact = false }: { compact?: boolean }) {
  const cellClass = compact ? 'px-2 py-1' : 'px-2 py-1.5';
  return (
    <div className="overflow-hidden rounded-sm border border-zinc-300 bg-white text-[10px] dark:border-zinc-700 dark:bg-zinc-950 sm:text-[11px]">
      <div className="grid grid-cols-4 border-b border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
        {TABLE_HEADERS.map((h) => (
          <div
            key={h}
            className={`${cellClass} border-r border-zinc-300 font-bold text-zinc-700 last:border-r-0 dark:border-zinc-700 dark:text-zinc-200`}
          >
            {h}
          </div>
        ))}
      </div>
      {TABLE_ROWS.map((row, rowIdx) => (
        <div
          key={row.join('-')}
          className={`grid grid-cols-4 border-b border-zinc-200 last:border-b-0 dark:border-zinc-800 ${
            rowIdx === 0 ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'bg-white dark:bg-zinc-950'
          }`}
        >
          {row.map((cell) => (
            <div
              key={cell}
              className={`${cellClass} truncate border-r border-zinc-200 text-zinc-800 last:border-r-0 dark:border-zinc-800 dark:text-zinc-300`}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SceneStatusBar({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border border-zinc-200 bg-zinc-50 px-3 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      <span>{left}</span>
      <span className="font-bold text-blue-700 dark:text-blue-400">{right}</span>
    </div>
  );
}

function OrderLinkScene() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="grid shrink-0 grid-cols-3 gap-1.5">
        {LINK_MALLS.map((mall, idx) => (
          <div
            key={mall.name}
            className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-sm border px-2 py-1 shadow-sm ${
              idx === 0
                ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
                : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
            }`}
          >
            <ShoppingMallBrand type={mall.key} />
            <span className="text-[10px] font-black text-zinc-900 dark:text-zinc-100">{mall.name}</span>
            <span className="text-[10px] font-semibold text-zinc-500">{mall.count}</span>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-center rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-[12px] font-bold leading-tight text-zinc-700 dark:text-zinc-300 [word-break:keep-all]">
          여러 쇼핑몰 주문 <span className="text-zinc-400">→</span> 택배사 양식으로 정리
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ExcelTable />
      </div>

      <SceneStatusBar left="통합 주문 목록" right="12건 · 연동 완료" />
    </div>
  );
}

function FileConvertScene() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <div className="rounded-sm border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-[10px] font-bold text-zinc-500">입력 · 카톡 주문문구</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-[10px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            {`김민수 010-1234-5678\n서울 강남구 테헤란로 123\n에코백 2개`}
          </pre>
        </div>
        <div className="rounded-sm border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-[10px] font-bold text-zinc-500">입력 · 주문 엑셀</p>
          <p className="mt-1 text-[10px] font-semibold text-zinc-800 dark:text-zinc-200">스마트스토어_0316.xlsx</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">48행 · 6열</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
        <span className="rounded border border-zinc-300 bg-zinc-100 px-2 py-0.5 dark:border-zinc-600 dark:bg-zinc-800">
          택배사 양식
        </span>
        <span className="text-zinc-400">→</span>
        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          CJ대한통운 업로드용
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ExcelTable compact />
      </div>

      <SceneStatusBar left="변환 결과" right="3건 · 다운로드 가능" />
    </div>
  );
}

function InvoiceScene() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="grid shrink-0 grid-cols-3 gap-1.5">
        {COURIERS.map((courier, idx) => (
          <div
            key={courier.name}
            className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-sm border px-2 py-1 shadow-sm ${
              idx === 0
                ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
                : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
            }`}
          >
            <span
              className="text-[10px] font-black leading-none"
              style={{ color: courier.color }}
            >
              {courier.logo}
            </span>
            <span className="text-[10px] font-black text-zinc-900 dark:text-zinc-100">{courier.name}</span>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 rounded-sm border border-zinc-200 bg-white px-3 py-2 text-[10px] dark:border-zinc-700 dark:bg-zinc-900">
        <div className="min-w-0">
          <p className="font-bold text-zinc-800 dark:text-zinc-100">출고결과_0316.xlsx</p>
          <p className="text-zinc-500">48행 · 송장번호 매칭</p>
        </div>
        <span className="shrink-0 font-bold text-zinc-400">→</span>
        <div className="min-w-0 text-right">
          <p className="truncate font-bold text-zinc-800 dark:text-zinc-100">
            스마트스토어_송장.xlsx
          </p>
          <p className="truncate font-bold text-zinc-800 dark:text-zinc-100">CJ_업로드양식.xlsx</p>
          <p className="text-zinc-500">쇼핑몰·택배사 업로드용</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ExcelTable compact />
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">송장변환 결과</span>
        <span className="rounded-sm bg-blue-600 px-3 py-1 text-[10px] font-bold text-white">엑셀 다운로드</span>
      </div>
    </div>
  );
}

function SceneBody({ scene }: { scene: HeroScene }) {
  if (scene === 'order-link') return <OrderLinkScene />;
  if (scene === 'file-convert') return <FileConvertScene />;
  return <InvoiceScene />;
}

/** 랜딩 히어로 우측 — 실무형 작업 화면 데모 */
export default function LandingTestHeroVisual() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  const goTo = useCallback((idx: number) => {
    setActiveIdx((idx + SCENES.length) % SCENES.length);
    setTimerKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % SCENES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused, timerKey]);

  const scene = SCENES[activeIdx];

  return (
    <div
      className={`flex w-full flex-col ${CARD_HEIGHT_CLASS}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="엑클로드 주문·송장 정리 작업 화면"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <PanelHeader status={scene.status} />

        <div className="flex shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {SCENES.map((item, idx) => {
            const selected = idx === activeIdx;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => goTo(idx)}
                className={`flex-1 border-b-2 px-2 py-2.5 text-center text-[11px] font-bold transition sm:text-xs ${
                  selected
                    ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-white px-4 py-4 dark:bg-zinc-950 sm:px-5 sm:py-5">
          <div className={`mb-3 shrink-0 overflow-hidden ${SCENE_HEADER_HEIGHT_CLASS}`}>
            <p className="line-clamp-1 text-sm font-extrabold text-zinc-950 dark:text-zinc-100">
              {scene.title}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {scene.desc}
            </p>
          </div>

          <div className={`relative shrink-0 overflow-hidden ${SCENE_STAGE_HEIGHT_CLASS}`}>
            {SCENES.map((item, idx) => (
              <div
                key={item.key}
                className={`absolute inset-0 transition-opacity duration-300 ${
                  idx === activeIdx
                    ? 'z-10 opacity-100'
                    : 'pointer-events-none z-0 opacity-0'
                }`}
                aria-hidden={idx !== activeIdx}
              >
                <SceneBody scene={item.key} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex gap-1.5">
            {SCENES.map((_, idx) => (
              <button
                key={SCENES[idx].key}
                type="button"
                onClick={() => goTo(idx)}
                className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${
                  idx === activeIdx ? 'w-5 bg-blue-600' : 'w-1.5 bg-zinc-300 dark:bg-zinc-600'
                }`}
                aria-label={`${idx + 1}번째 화면`}
              />
            ))}
          </div>
          <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">EXCLOAD</p>
        </div>
      </div>
    </div>
  );
}
