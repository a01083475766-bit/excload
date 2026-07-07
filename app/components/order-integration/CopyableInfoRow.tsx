'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = {
  label: string;
  value: string;
  placeholder?: string;
};

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
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
        <dd
          className={`mt-0.5 break-all text-sm font-semibold tabular-nums ${
            canCopy ? 'text-zinc-900 dark:text-zinc-100' : 'text-amber-700 dark:text-amber-300'
          }`}
        >
          {displayValue}
        </dd>
      </div>
      <button
        type="button"
        disabled={!canCopy}
        onClick={() => void handleCopy()}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}
