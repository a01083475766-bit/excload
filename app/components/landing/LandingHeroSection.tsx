'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import { Check } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState, type CSSProperties } from 'react';

const HERO_SCAN_MS = 3600;
const HERO_RESULT_FADE_MS = 800;
const HERO_RESULT_HOLD_MS = 5000;

/** 우측 스캔 레이어 — 기존 0.6 배율 대비 30% 확대(0.78), 오른쪽 끝 고정 */
const LANDING_HERO_VISUAL_SCALE = 0.6 * 1.3;
const LANDING_HERO_KAKAO_WIDTH = Math.round(370 * LANDING_HERO_VISUAL_SCALE);
const LANDING_HERO_KAKAO_HEIGHT = Math.round(755 * LANDING_HERO_VISUAL_SCALE);
const LANDING_HERO_EXCEL_HEIGHT = Math.round(95 * (LANDING_HERO_KAKAO_WIDTH / 413));
const LANDING_HERO_SCAN_GAP_PX = 12;
const LANDING_HERO_KAKAO_TOP_OFFSET = LANDING_HERO_EXCEL_HEIGHT + LANDING_HERO_SCAN_GAP_PX;
const LANDING_HERO_VISUAL_HEIGHT = LANDING_HERO_KAKAO_TOP_OFFSET + LANDING_HERO_KAKAO_HEIGHT;

function useLandingHeroScanCycle() {
  const [cycleKey, setCycleKey] = useState(0);
  const [isScanning, setIsScanning] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsScanning(false);
      setShowResult(true);
      setResultVisible(true);
      return;
    }

    setIsScanning(true);
    setShowResult(false);
    setResultVisible(false);

    const scanDoneTimer = window.setTimeout(() => {
      setIsScanning(false);
      setShowResult(true);
    }, HERO_SCAN_MS);

    const nextCycleTimer = window.setTimeout(() => {
      setCycleKey((key) => key + 1);
    }, HERO_SCAN_MS + HERO_RESULT_FADE_MS + HERO_RESULT_HOLD_MS);

    return () => {
      window.clearTimeout(scanDoneTimer);
      window.clearTimeout(nextCycleTimer);
    };
  }, [cycleKey]);

  useEffect(() => {
    if (!showResult) {
      setResultVisible(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setResultVisible(true));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [showResult]);

  return { cycleKey, isScanning, showResult, resultVisible };
}

function LandingHeroBackgroundImage() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-zinc-50 dark:bg-black" aria-hidden>
      <div className="absolute inset-0">
        <Image
          src="/landing/hero-bg-laptop.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover object-center opacity-[0.54] blur-[3px]"
        />
      </div>
      <div className="absolute inset-0 bg-white/22 dark:bg-black/25" />
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            'linear-gradient(to right, rgba(255,255,255,0.56) 0%, rgba(255,255,255,0.1) 44%, rgba(255,255,255,0.1) 56%, rgba(255,255,255,0.56) 100%)',
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            'linear-gradient(to right, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.08) 44%, rgba(0,0,0,0.08) 56%, rgba(0,0,0,0.42) 100%)',
        }}
      />
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, transparent 58%, rgba(250,250,249,0.42) 78%, rgb(250 250 249) 100%)',
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, transparent 58%, rgba(0,0,0,0.38) 78%, rgb(0 0 0) 100%)',
        }}
      />
    </div>
  );
}

function LandingHeroVisualStack({
  scanCycleKey,
  isScanning,
}: {
  scanCycleKey: number;
  isScanning: boolean;
}) {
  const kakaoWidth = LANDING_HERO_KAKAO_WIDTH;
  const kakaoHeight = LANDING_HERO_KAKAO_HEIGHT;
  const excelDisplayWidth = kakaoWidth;
  const excelDisplayHeight = LANDING_HERO_EXCEL_HEIGHT;

  return (
    <div className="relative flex w-full max-w-full flex-col items-end">
      <div
        className="landing-hero-scan-stage"
        style={{ '--landing-hero-scan-width': `${kakaoWidth}px` } as CSSProperties}
        aria-label="주문 파일과 카카오톡 주문을 AI가 읽는 중"
      >
        <Image
          src="/landing/hero-layer-excel-files.png"
          alt="스마트스토어, 11번가, 자사몰, 카페24, 쿠팡 등 쇼핑몰별 주문 엑셀 파일"
          width={excelDisplayWidth}
          height={excelDisplayHeight}
          priority
          unoptimized
          className="relative z-[1] h-auto w-full max-w-full drop-shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
        />
        <Image
          src="/landing/hero-layer-kakao-chat.png"
          alt="카카오톡 주문 대화 예시"
          width={kakaoWidth}
          height={kakaoHeight}
          priority
          unoptimized
          className="relative z-[1] h-auto w-full max-w-full drop-shadow-[0_16px_40px_rgba(15,23,42,0.22)]"
        />
        {isScanning ? (
          <div key={scanCycleKey} className="landing-hero-scan-overlay" aria-hidden>
            <div className="landing-hero-scan-beam" />
            <div className="landing-hero-scan-line" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LandingHeroExcelResult({
  showResult,
  resultVisible,
}: {
  showResult: boolean;
  resultVisible: boolean;
}) {
  if (!showResult) {
    return null;
  }

  return (
    <div
      className={`w-full min-w-0 transition-all duration-[800ms] ease-out motion-reduce:transition-none ${
        resultVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
      aria-live="polite"
      aria-label="정리된 주문 엑셀 결과"
    >
      <div className="w-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-2">
        <Image
          src="/landing/hero-layer-excel-result.png"
          alt="정리된 주문 엑셀 결과 예시"
          width={910}
          height={154}
          priority
          unoptimized
          className="block h-auto w-full rounded-md opacity-[0.96] dark:opacity-[0.92]"
        />
      </div>
    </div>
  );
}

function LandingHeroResultBlock({
  showResult,
  resultVisible,
}: {
  showResult: boolean;
  resultVisible: boolean;
}) {
  return (
    <div className="w-full min-w-0">
      {showResult ? (
        <div
          className={`mb-2 flex w-full items-start gap-2.5 sm:mb-2.5 transition-all duration-[800ms] ease-out motion-reduce:transition-none ${
            resultVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
          aria-hidden={!resultVisible}
        >
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
          <p className="text-base font-semibold leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-lg [word-break:keep-all]">
            양식이 다른 여러 파일을 올려도{' '}
            <span className="font-bold text-blue-600 dark:text-blue-400">자동으로 하나의 파일로 변환</span>
            됩니다.
          </p>
        </div>
      ) : null}
      <LandingHeroExcelResult showResult={showResult} resultVisible={resultVisible} />
    </div>
  );
}

/** 실서비스·/landing-test 공통 히어로 */
export default function LandingHeroSection() {
  const heroScan = useLandingHeroScanCycle();

  return (
    <section className="blue-unified-theme relative overflow-hidden">
      <LandingHeroBackgroundImage />
      <div className={`${landingContainerClass} relative z-10 py-12 sm:py-16 lg:py-20`}>
        <div
          className="flex w-full min-w-0 flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-x-12"
          style={
            {
              '--landing-hero-kakao-top-offset': `${LANDING_HERO_KAKAO_TOP_OFFSET}px`,
              '--landing-hero-visual-height': `${LANDING_HERO_VISUAL_HEIGHT}px`,
            } as CSSProperties
          }
        >
          <div className="order-1 flex min-w-0 w-full flex-col text-left lg:min-h-[var(--landing-hero-visual-height)] lg:justify-between lg:pt-[var(--landing-hero-kakao-top-offset)]">
            <div className="flex max-w-xl flex-col gap-[3.75rem] sm:gap-[4.5rem]">
              <h1 className="text-[clamp(1.25rem,2.4vw,1.875rem)] font-bold leading-snug tracking-normal text-zinc-900 dark:text-zinc-100 [word-break:keep-all] lg:whitespace-nowrap">
                <span className="text-blue-600 dark:text-blue-400">&quot;빠른 주문 정리&quot;</span>{' '}
                쇼핑몰, 카톡주문을 쉽게 정리합니다.
              </h1>
              <p className="pl-4 text-base font-semibold leading-relaxed text-zinc-700 dark:text-zinc-300 sm:pl-5 sm:text-lg lg:pl-6 [word-break:keep-all]">
                스토어, 쿠팡, 자사몰, 카페24 등 여러 쇼핑몰 주문 파일을 올리면
                <br className="hidden sm:block" />
                CJ, 롯데, 한진, 로젠 등 여러 택배사 업로드 양식에 맞게 정리합니다.
              </p>
            </div>

            <div className="mt-6 hidden w-full min-w-0 lg:mt-0 lg:block">
              <LandingHeroResultBlock showResult={heroScan.showResult} resultVisible={heroScan.resultVisible} />
            </div>
          </div>

          <div className="order-2 flex min-w-0 shrink-0 justify-center lg:justify-end">
            <LandingHeroVisualStack scanCycleKey={heroScan.cycleKey} isScanning={heroScan.isScanning} />
          </div>

          <div className="order-3 w-full min-w-0 lg:hidden">
            <LandingHeroResultBlock showResult={heroScan.showResult} resultVisible={heroScan.resultVisible} />
          </div>
        </div>
      </div>
    </section>
  );
}
