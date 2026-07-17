'use client';

import { useEffect, useState } from 'react';

type SecretInputProps = {
  id: string;
  /** 필드 라벨 (예: "Client Secret (애플리케이션 시크릿)") */
  label: string;
  /** 부모가 보관하는 새 시크릿 입력값 */
  value: string;
  onChange: (value: string) => void;
  /** 저장된 시크릿 존재 여부 (예: savedAccount?.hasClientSecret) */
  hasSaved: boolean;
  /** 저장된 시크릿 마스킹 값 */
  savedMasked?: string;
  /** 미저장 상태 placeholder */
  newPlaceholder: string;
  inputClass: string;
  /** 진행 중 액션 등으로 버튼 비활성화 */
  disabled?: boolean;
  /**
   * 값이 바뀌면 편집 상태를 잠금으로 되돌린다.
   * 보통 savedAccount 객체를 그대로 넘긴다 (저장/해제/재조회 시 참조가 바뀜).
   */
  resetSignal?: unknown;
  /** 확인창·안내 문구에 쓸 짧은 이름 (기본: label) */
  confirmLabel?: string;
  /**
   * 비밀값 여부 (기본 true).
   * false면 Client ID처럼 민감하지 않은 값으로 취급해
   * 입력을 마스킹(●)하지 않고, 잠금 상태에서 저장된 값을 그대로 보여준다.
   */
  secret?: boolean;
};

/**
 * 저장된 값을 잠금(읽기 전용)으로 두고, 「변경」→확인을 거쳐야만 새 값을 입력하게 한다.
 * 실수 입력/붙여넣기로 기존 값이 덮어써지는 것을 방지한다.
 * 시크릿(기본)은 마스킹하고, secret=false면 저장된 값을 그대로 노출한다.
 */
export function SecretInput({
  id,
  label,
  value,
  onChange,
  hasSaved,
  savedMasked,
  newPlaceholder,
  inputClass,
  disabled = false,
  resetSignal,
  confirmLabel,
  secret = true,
}: SecretInputProps) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [resetSignal]);

  const locked = hasSaved && !editing;
  const name = confirmLabel ?? label;
  const lockedDisplay = secret ? `저장됨: ${savedMasked || '********'}` : savedMasked || '';

  const buttonClass =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';

  function startChange() {
    if (
      !window.confirm(
        `저장된 ${name}을(를) 변경하시겠습니까?\n변경하려면 새 값을 입력한 뒤 저장해야 합니다.`,
      )
    ) {
      return;
    }
    onChange('');
    setEditing(true);
  }

  function cancelChange() {
    onChange('');
    setEditing(false);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {locked ? (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="text"
            value={lockedDisplay}
            readOnly
            aria-label={`저장된 ${name} (잠금)`}
            className={`${inputClass} bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400`}
          />
          <button type="button" disabled={disabled} onClick={startChange} className={buttonClass}>
            변경
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type={secret ? 'password' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={secret ? 'new-password' : 'off'}
            placeholder={hasSaved ? `새 ${name} 입력` : newPlaceholder}
            className={inputClass}
          />
          {hasSaved ? (
            <button type="button" disabled={disabled} onClick={cancelChange} className={buttonClass}>
              변경 취소
            </button>
          ) : null}
        </div>
      )}
      <p className="mt-1 text-xs text-zinc-500">
        {locked
          ? secret
            ? '저장된 값은 보호됩니다. 변경하려면 「변경」을 누르세요.'
            : '저장된 값입니다. 변경하려면 「변경」을 누르세요.'
          : hasSaved
            ? '새 값을 입력한 뒤 저장하세요. 취소하면 기존 값이 그대로 유지됩니다.'
            : secret
              ? '저장 후에는 전체가 노출되지 않습니다.'
              : '저장 후에는 「변경」을 눌러야 수정할 수 있습니다.'}
      </p>
    </div>
  );
}
