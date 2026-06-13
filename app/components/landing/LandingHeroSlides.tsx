'use client';

import Image from 'next/image';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  MessageCircle,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const SLIDE_INTERVAL_MS = 4500;

/** 본문 슬라이드 — 3520×1216 원본 (표시 max 1152px) */
const BODY_WIDTH = 3520;
const BODY_HEIGHT = 1216;

const slides = [
  {
    src: '/landing/hero-slides/2-1.png',
    alt: '복잡한 설정 없이 주문 파일 첨부, 확인, 다운로드 3단계로 끝',
  },
  {
    src: '/landing/hero-slides/2-2.png',
    alt: '카톡·문자 주문 복사 후 붙여넣기로 엑셀 변환 완료',
  },
  {
    src: '/landing/hero-slides/2-3.png',
    alt: '배울 필요 없이 누구나 바로 사용, 사용법이 정말 쉽습니다',
  },
  {
    src: '/landing/hero-slides/2-4.png',
    alt: '월 4,000원 합리적인 가격으로 시작',
  },
  {
    src: '/landing/hero-slides/2-5.png',
    alt: 'EXCLOAD 주문 엑셀 자동 변환 및 택배사 양식 변환 서비스 소개',
  },
] as const;

const arrowBtnClass =
  'absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-md backdrop-blur-sm transition hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-11 sm:w-11';

const footerItems = [
  {
    Icon: FileSpreadsheet,
    label: '엑셀 주문파일 지원',
    iconClassName: 'text-emerald-600 dark:text-emerald-500',
  },
  {
    Icon: MessageCircle,
    label: '카톡·문자 주문 자동 인식',
    iconClassName: 'text-blue-600 dark:text-blue-400',
  },
  {
    Icon: Table2,
    label: '다양한 주문 파일 지원',
    iconClassName: 'text-blue-600 dark:text-blue-400',
  },
  {
    Icon: Download,
    label: '택배사 & 물류 양식 변환',
    iconClassName: 'text-blue-600 dark:text-blue-400',
  },
  {
    Icon: ShieldCheck,
    label: '안전한 데이터 처리',
    iconClassName: 'text-blue-600 dark:text-blue-400',
  },
] as const;

function LandingHeroFooterBar() {
  return (
    <div
      className="border-t border-zinc-200/90 bg-white px-3 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:px-4 sm:py-3.5"
      aria-label="엑클로드 주요 기능"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 sm:gap-x-0">
        {footerItems.map((item, idx) => (
          <div key={item.label} className="flex items-center">
            {idx > 0 ? (
              <span
                className="mx-2 hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:mx-3 md:inline-block"
                aria-hidden
              />
            ) : null}
            <div className="flex items-center gap-1.5 px-1 sm:gap-2 sm:px-2">
              <item.Icon
                className={`h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px] ${item.iconClassName}`}
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="whitespace-nowrap text-[11px] font-medium text-zinc-800 dark:text-zinc-200 sm:text-xs md:text-sm">
                {item.label}
              </span>
            </div>
          </div>
        ))}

        <span
          className="mx-2 hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:mx-3 md:inline-block"
          aria-hidden
        />
        <span className="px-2 text-sm font-bold tracking-tight text-blue-600 dark:text-blue-400 sm:text-base">
          EXCLOAD
        </span>
      </div>
    </div>
  );
}

/** 안내문과 대화형 안내창 사이 — 본문 5장 순환 + 하단 고정 문구 */
export function LandingHeroSlides() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  const goTo = useCallback((idx: number) => {
    setActiveIdx((idx + slides.length) % slides.length);
    setTimerKey((k) => k + 1);
  }, []);

  const goPrev = useCallback(() => goTo(activeIdx - 1), [activeIdx, goTo]);
  const goNext = useCallback(() => goTo(activeIdx + 1), [activeIdx, goTo]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, timerKey]);

  return (
    <div className="mx-auto mb-4 w-full max-w-6xl overflow-hidden rounded-2xl" aria-label="서비스 안내 슬라이드">
      {/* 본문 — 5장 순환 */}
      <div
        className="relative w-full overflow-hidden bg-white dark:bg-zinc-900"
        style={{ aspectRatio: `${BODY_WIDTH} / ${BODY_HEIGHT}` }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {slides.map((slide, idx) => (
          <Image
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            fill
            quality={100}
            priority={idx === 0}
            sizes="(max-width: 1152px) 100vw, 1152px"
            className={`object-contain object-center transition-opacity duration-500 ease-in-out ${
              idx === activeIdx ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />
        ))}

        <button
          type="button"
          onClick={goPrev}
          className={`${arrowBtnClass} left-2 sm:left-3`}
          aria-label="이전 안내"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </button>
        <button
          type="button"
          onClick={goNext}
          className={`${arrowBtnClass} right-2 sm:right-3`}
          aria-label="다음 안내"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      <LandingHeroFooterBar />
    </div>
  );
}
