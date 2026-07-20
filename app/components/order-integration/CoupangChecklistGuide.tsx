'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, Expand, X } from 'lucide-react';
import {
  COUPANG_GUIDE_FOOTER,
  COUPANG_PATH_CHOICES,
  getCoupangPathSteps,
  getCoupangStartStep,
  type CoupangChecklistStep,
  type CoupangGuidePath,
} from '@/app/lib/order-integration/coupang-visual-guide';

type Props = {
  density?: 'compact' | 'roomy';
  className?: string;
};

type Phase = 'start' | 'choose' | 'steps';

/** 쿠팡 초보용 따라하기: 시작 → 2갈래 → 「네, 다음」쌓기 */
export function CoupangChecklistGuide({ density = 'roomy', className = '' }: Props) {
  const startStep = getCoupangStartStep();
  const [phase, setPhase] = useState<Phase>('start');
  const [path, setPath] = useState<CoupangGuidePath | null>(null);
  const [confirmed, setConfirmed] = useState(0);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);

  const pathSteps = path ? getCoupangPathSteps(path) : [];
  const allDone = phase === 'steps' && path !== null && confirmed >= pathSteps.length;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [phase, confirmed, path]);

  function reset() {
    setPhase('start');
    setPath(null);
    setConfirmed(0);
  }

  function goToStart() {
    setPhase('start');
    setPath(null);
    setConfirmed(0);
  }

  function goToChoose() {
    setPhase('choose');
    setConfirmed(0);
  }

  function goToPathStep(stepIndex: number) {
    if (!path) return;
    setPhase('steps');
    setConfirmed(Math.max(0, Math.min(stepIndex, pathSteps.length - 1)));
  }

  function finishStart() {
    setPhase('choose');
  }

  function choosePath(next: CoupangGuidePath) {
    setPath(next);
    setConfirmed(0);
    setPhase('steps');
  }

  function confirmNext() {
    setConfirmed((n) => n + 1);
  }

  function goPrev() {
    if (phase === 'choose') {
      goToStart();
      return;
    }
    if (phase === 'steps') {
      if (allDone) {
        setConfirmed(pathSteps.length - 1);
        return;
      }
      if (confirmed <= 0) {
        goToChoose();
        return;
      }
      setConfirmed((n) => n - 1);
    }
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

  function renderDone(step: CoupangChecklistStep, displayNo: number, onJump: () => void) {
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
    step: CoupangChecklistStep,
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
      {phase !== 'start' ? (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={reset} className={secondaryBtn}>
            처음부터
          </button>
        </div>
      ) : null}

      <div className="space-y-2.5">
        {phase === 'start' ? renderActive(startStep, 1, finishStart, false) : null}

        {phase !== 'start' ? renderDone(startStep, 1, goToStart) : null}

        {phase === 'choose' ? (
          <div
            ref={activeRef}
            className="rounded-lg border border-blue-200 bg-white px-3 py-3 shadow-sm"
          >
            <p className="text-sm font-semibold text-zinc-900">지금 화면에 가까운 그림을 눌러 주세요</p>
            <p className="mt-1 text-xs text-zinc-500">
              처음 발급인지, 이미 API가 있는지에 가까운 쪽을 고르면 됩니다.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {COUPANG_PATH_CHOICES.map((choice) => (
                <div
                  key={choice.path}
                  className="flex flex-col overflow-hidden rounded-lg border border-zinc-300 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setPreview({ src: choice.imageSrc, alt: choice.imageAlt })}
                    className="group relative flex h-36 cursor-zoom-in items-center justify-center bg-zinc-100 p-1 transition hover:bg-zinc-50"
                    title="클릭하면 크게 보기"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={choice.imageSrc}
                      alt={choice.imageAlt}
                      className="max-h-full max-w-full object-contain"
                    />
                    <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      <Expand className="h-3 w-3" aria-hidden />
                      크게
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => choosePath(choice.path)}
                    className="border-t border-zinc-100 px-2.5 py-2 text-left transition hover:bg-blue-50/40"
                  >
                    <span className="text-[10px] font-semibold text-zinc-500">{choice.hint}</span>
                    <span className="mt-0.5 block text-xs font-semibold leading-snug text-zinc-900">
                      {choice.label}
                    </span>
                    <span className="mt-2 inline-flex h-7 items-center rounded-md bg-blue-600 px-2 text-[11px] font-semibold text-white">
                      이 화면으로 진행
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3">
              <button type="button" onClick={goPrev} className={prevBtn}>
                이전
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'steps' && path
          ? pathSteps
              .slice(0, confirmed)
              .map((step, i) => renderDone(step, i + 2, () => goToPathStep(i)))
          : null}

        {phase === 'steps' && path && confirmed < pathSteps.length
          ? renderActive(pathSteps[confirmed]!, confirmed + 2, confirmNext, true)
          : null}

        {allDone ? (
          <div
            ref={activeRef}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3"
          >
            <p className="text-sm font-semibold text-emerald-900">설정 따라하기를 모두 마쳤습니다</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-800/90">{COUPANG_GUIDE_FOOTER}</p>
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
