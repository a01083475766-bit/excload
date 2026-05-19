'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProtectedFileKind } from '@/app/lib/excel/protected-file-types';

export type ExcelProtectedFileModalMode = 'password' | 'unsupported';

type PasswordModalProps = {
  mode: 'password';
  fileName: string;
  kind: ProtectedFileKind;
  wrongPassword: boolean;
  attemptCount: number;
  isSubmitting: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
};

type UnsupportedModalProps = {
  mode: 'unsupported';
  fileName: string;
  message: string;
  onClose: () => void;
};

export type ExcelProtectedFileModalProps = PasswordModalProps | UnsupportedModalProps;

export function ExcelProtectedFileModal(props: ExcelProtectedFileModalProps) {
  if (props.mode === 'unsupported') {
    return (
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4"
        role="presentation"
        onClick={props.onClose}
      >
        <div
          className="w-full max-w-[440px] rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-700"
          role="dialog"
          aria-modal="true"
          aria-labelledby="excel-protected-unsupported-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3
            id="excel-protected-unsupported-title"
            className="mb-3 text-lg font-semibold text-gray-900 dark:text-zinc-100"
          >
            열 수 없는 파일 형식입니다
          </h3>
          <p className="mb-2 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
            <span className="font-medium text-gray-800 dark:text-zinc-200">{props.fileName}</span>
          </p>
          <p className="mb-6 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
            {props.message}
          </p>
          <ul className="mb-6 list-disc space-y-1.5 pl-5 text-sm text-gray-600 dark:text-zinc-400">
            <li>
              Excel에서 <span className="font-medium">다른 이름으로 저장</span> → 일반 .xlsx
            </li>
            <li>회사 보안·DRM·전용 뷰어 파일은 Excel에서 일반 파일로 저장한 뒤 업로드</li>
            <li>ZIP은 압축을 푼 뒤 엑셀만 올려 주세요</li>
          </ul>
          <button
            type="button"
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            onClick={props.onClose}
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  return <PasswordModalContent {...props} />;
}

function PasswordModalContent({
  fileName,
  kind,
  wrongPassword,
  attemptCount,
  isSubmitting,
  onSubmit,
  onCancel,
}: Omit<PasswordModalProps, 'mode'>) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [wrongPassword]);

  const kindLabel = kind === 'zip' ? 'ZIP 압축 파일' : '엑셀 파일';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[440px] rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900 dark:ring-1 dark:ring-zinc-700"
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-protected-password-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="excel-protected-password-title"
          className="mb-2 text-lg font-semibold text-gray-900 dark:text-zinc-100"
        >
          {kindLabel} 비밀번호가 필요합니다
        </h3>
        <p className="mb-1 text-sm text-gray-600 dark:text-zinc-400">
          <span className="font-medium text-gray-800 dark:text-zinc-200">{fileName}</span>
        </p>
        <p className="mb-4 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
          쇼핑몰·ERP에서 안내한 비밀번호를 입력해 주세요. 비밀번호는 파일을 여는 데만 사용하며
          저장하지 않습니다.
        </p>

        {wrongPassword && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            비밀번호가 올바르지 않습니다. 다시 입력해 주세요.
          </p>
        )}

        {attemptCount >= 3 && (
          <p className="mb-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            계속 실패하면 Excel에서 비밀번호를 해제한 뒤 일반 엑셀(.xlsx)로 저장하여 다시 올려
            주세요.
          </p>
        )}

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-zinc-300">
            비밀번호
          </span>
          <input
            ref={inputRef}
            type="password"
            autoComplete="off"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password.trim() && !isSubmitting) {
                onSubmit(password);
              }
            }}
            disabled={isSubmitting}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
            onClick={() => onSubmit(password)}
            disabled={!password.trim() || isSubmitting}
          >
            {isSubmitting ? '확인 중…' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
