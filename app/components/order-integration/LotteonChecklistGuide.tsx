'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, Expand, X } from 'lucide-react';
import {
  LOTTEON_GUIDE_FOOTER,
  getLotteonGuideSteps,
  type LotteonChecklistStep,
} from '@/app/lib/order-integration/lotteon-visual-guide';

type Props = {
  density?: 'compact' | 'roomy';
  className?: string;
};

/** 롯데ON: 직접입력·IP 단일 경로 → 「네, 다음」쌓기 */
export function LotteonChecklistGuide({ density = 'roomy', className = '' }: Props) {
  const steps = getLotteonGuideSteps();
  const [confirmed, setConfirmed] = useState(0);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);

  const allDone = confirmed >= steps.length;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [confirmed]);

  function reset() {
    setConfirmed(0);
  }

  function goToStep(stepIndex: number) {
    setConfirmed(Math.max(0, Math.min(stepIndex, steps.length - 1)));
  }

  function confirmNext() {
    setConfirmed((n) => n + 1);
  }

  function goPrev() {
    if (allDone) {
      setConfirmed(steps.length - 1);
      return;
    }
    if (confirmed <= 0) return;
    setConfirmed((n) => n - 1);
  }

  const imageHeightPx = density === 'roomy' ? 420 : 240;
  const yesBtn =
    'inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700';
  const prevBtn =
    'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50';
  const secondaryBtn =
    'inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50';

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  function GuideImage({
    src,
    alt,
    heightPx,
  }: {
    src: string;
    alt: string;
    heightPx?: number;
  }) {
    const h = heightPx ?? imageHeightPx;
    return (
      <button
        type="button"
        onClick={() => setPreview({ src, alt })}
        className="group relative flex w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 text-left transition hover:border-blue-400"
        style={{ height: h }}
        title="클릭하면 크게 보기"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 가이드 캡처 */}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain"
          style={{ maxHeight: h }}
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white opacity-90 group-hover:opacity-100">
          <Expand className="h-3.5 w-3.5" aria-hidden />
          크게 보기
        </span>
      </button>
    );
  }

  function renderDone(step: LotteonChecklistStep, displayNo: number, onJump: () => void) {
    return (
      <button
        type="button"
        key={`done-${step.id}`}
        onClick={onJump}
        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
        title="이 단계로 돌아가기"
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="h-3.5 w-3.5" aria-hidden />
          </span>
          <p className="text-xs font-semibold text-zinc-800">
            {displayNo}. {step.title}
            <span className="ml-2 font-normal text-zinc-500">완료 · 클릭하면 이동</span>
          </p>
        </div>
      </button>
    );
  }

  function renderActive(
    step: LotteonChecklistStep,
    stepNo: number,
    onYes: () => void,
    showPrev: boolean,
  ) {
    return (
      <div
        ref={activeRef}
        key={`active-${step.id}`}
        className="rounded-lg border border-blue-200 bg-white px-3 py-3 shadow-sm"
      >
        <p className="text-xs font-semibold text-blue-800">
          {stepNo}. {step.title}
        </p>

        <ol className="mt-2 space-y-1 rounded-md border border-zinc-100 bg-zinc-50 px-2.5 py-2">
          {step.howTo.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-zinc-800">
              {line}
            </li>
          ))}
        </ol>

        {step.externalHref && step.externalLabel ? (
          <a
            href={step.externalHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            {step.externalLabel}
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        ) : null}

        <div className="mt-2">
          <GuideImage src={step.imageSrc} alt={step.imageAlt} heightPx={step.imageHeightPx} />
        </div>

        {step.tip ? (
          <p className="mt-2 text-xs leading-relaxed text-zinc-600">{step.tip}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900">{step.question}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showPrev ? (
              <button type="button" onClick={goPrev} className={prevBtn}>
                이전
              </button>
            ) : null}
            <button type="button" onClick={onYes} className={yesBtn}>
              네, 다음
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {confirmed > 0 ? (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={reset} className={secondaryBtn}>
            처음부터
          </button>
        </div>
      ) : null}

      <div className="space-y-2.5">
        {steps.slice(0, confirmed).map((step, i) => renderDone(step, i + 1, () => goToStep(i)))}

        {!allDone && confirmed < steps.length
          ? renderActive(steps[confirmed]!, confirmed + 1, confirmNext, confirmed > 0)
          : null}

        {allDone ? (
          <div
            ref={activeRef}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3"
          >
            <p className="text-sm font-semibold text-emerald-900">설정 따라하기를 모두 마쳤습니다</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-800/90">{LOTTEON_GUIDE_FOOTER}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={goPrev} className={prevBtn}>
                이전
              </button>
              <button type="button" onClick={reset} className={secondaryBtn}>
                다시 보기
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {preview && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex flex-col bg-black/90"
              role="dialog"
              aria-modal="true"
              aria-label="이미지 크게 보기"
              onClick={() => setPreview(null)}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5">
                <p className="min-w-0 truncate text-xs text-white/80">{preview.alt}</p>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md bg-white px-3 text-xs font-semibold text-zinc-800 shadow transition hover:bg-zinc-100"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" aria-hidden />
                  닫기
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
                <div className="h-[70%] w-[70%]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 정적 가이드 캡처 */}
                  <img
                    src={preview.src}
                    alt={preview.alt}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
