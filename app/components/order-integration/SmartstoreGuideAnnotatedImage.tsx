'use client';

type GuideHighlight = {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
  tone: 'input' | 'click' | 'check';
};

type Props = {
  src: string;
  alt: string;
  highlights?: GuideHighlight[];
  heightPx?: number;
};

const TONE: Record<GuideHighlight['tone'], string> = {
  input: 'border-sky-500 bg-sky-500/15',
  click: 'border-amber-500 bg-amber-500/15',
  check: 'border-emerald-500 bg-emerald-500/15',
};

/** (선택) 이미지 위 % 테두리 — 현재 따라하기는 표시가 들어간 캡처를 주로 사용 */
export function SmartstoreGuideAnnotatedImage({
  src,
  alt,
  highlights = [],
  heightPx = 240,
}: Props) {
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
      style={{ height: heightPx }}
    >
      <div className="relative inline-block max-w-full" style={{ maxHeight: heightPx }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="block max-w-full"
          style={{ maxHeight: heightPx, width: 'auto', height: 'auto' }}
        />
        {highlights.map((h) => (
          <div
            key={`${h.label}-${h.top}-${h.left}`}
            className={`pointer-events-none absolute rounded-sm border-[2.5px] ${TONE[h.tone]}`}
            style={{
              top: `${h.top}%`,
              left: `${h.left}%`,
              width: `${h.width}%`,
              height: `${h.height}%`,
            }}
          >
            <span className="absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-800 shadow-sm">
              {h.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
