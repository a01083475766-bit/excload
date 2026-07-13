'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = {
  label: string;
  value: string;
  placeholder?: string;
};

/** 가로 1행: 라벨 · 값 · 복사 */
export function CopyableInfoRow({ label, value, placeholder = '설정되지 않음' }: Props) {
  const [copied, setCopied] = useState(false);
  const displayValue = value || placeholder;
  const canCopy = Boolean(value);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.alert('복사하지 못했습니다. 텍스트를 직접 선택해서 복사해 주세요.');
    }
  }

  return (
    <div className="flex items-start gap-3 sm:items-center">
      <dt className="w-[7.25rem] shrink-0 pt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:pt-0">
        {label}
      </dt>
      <dd
        className={`min-w-0 flex-1 break-all text-sm font-semibold tabular-nums ${
          canCopy ? 'text-zinc-900 dark:text-zinc-100' : 'text-amber-700 dark:text-amber-300'
        }`}
      >
        {displayValue}
      </dd>
      <button
        type="button"
        disabled={!canCopy}
        onClick={() => void handleCopy()}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 self-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}
