'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProtectedFileKind } from '@/app/lib/excel/protected-file-types';
import {
  EXCLOAD_MODAL_BODY,
  EXCLOAD_MODAL_BTN_PRIMARY,
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_OVERLAY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

export type ExcelProtectedFileModalMode = 'password' | 'unsupported';

type PasswordModalProps = {
  mode: 'password';
  fileName: string;
  kind: ProtectedFileKind;
  wrongPassword: boolean;
  attemptCount: number;
  isSubmitting: boolean;
  onSubmit: (password: string) => void;
  onUploadCancel: () => void;
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
        className={`${EXCLOAD_MODAL_OVERLAY} z-[10000]`}
        role="presentation"
        onClick={props.onClose}
      >
        <div
          className={`${EXCLOAD_MODAL_PANEL} max-w-[440px]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="excel-protected-unsupported-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-100 px-6 pb-4 pt-5">
            <h3 id="excel-protected-unsupported-title" className={EXCLOAD_MODAL_TITLE}>
              열 수 없는 파일 형식입니다
            </h3>
          </div>
          <div className={`space-y-3 px-6 py-5 ${EXCLOAD_MODAL_BODY}`}>
            <p>
              <span className="font-medium text-zinc-800">{props.fileName}</span>
            </p>
            <p>{props.message}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Excel에서 <span className="font-medium">다른 이름으로 저장</span> → 일반 .xlsx
              </li>
              <li>회사 보안·DRM·전용 뷰어 파일은 Excel에서 일반 파일로 저장한 뒤 업로드</li>
              <li>ZIP은 압축을 푼 뒤 엑셀만 올려 주세요</li>
            </ul>
          </div>
          <div className="border-t border-zinc-100 px-6 py-4">
            <button
              type="button"
              className={`${EXCLOAD_MODAL_BTN_PRIMARY} w-full`}
              onClick={props.onClose}
            >
              확인
            </button>
          </div>
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
  onUploadCancel,
}: Omit<PasswordModalProps, 'mode'>) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [wrongPassword]);

  const kindLabel = kind === 'zip' ? 'ZIP 압축 파일' : '엑셀 파일';

  return (
    <div className={`${EXCLOAD_MODAL_OVERLAY} z-[10000]`} role="presentation">
      <div
        className={`${EXCLOAD_MODAL_PANEL} max-w-[440px]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-protected-password-title"
      >
        <div className="border-b border-zinc-100 px-6 pb-4 pt-5">
          <h3 id="excel-protected-password-title" className={EXCLOAD_MODAL_TITLE}>
            {kindLabel} 비밀번호가 필요합니다
          </h3>
        </div>
        <div className={`space-y-3 px-6 py-5 ${EXCLOAD_MODAL_BODY}`}>
          <p>
            <span className="font-medium text-zinc-800">{fileName}</span>
          </p>
          <p>
            쇼핑몰·ERP에서 안내한 비밀번호를 입력해 주세요. 비밀번호는 파일을 여는 데만 사용하며
            저장하지 않습니다.
          </p>

          {wrongPassword && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              비밀번호가 올바르지 않습니다. 다시 입력해 주세요.
            </p>
          )}

          {attemptCount >= 3 && (
            <p className="text-xs leading-relaxed text-zinc-500">
              계속 실패하면 Excel에서 비밀번호를 해제한 뒤 일반 엑셀(.xlsx)로 저장하여 다시 올려
              주세요.
            </p>
          )}

          <form
            className="block"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              if (password.trim() && !isSubmitting) {
                onSubmit(password);
              }
            }}
          >
            <label
              htmlFor="excload-excel-file-unlock-password"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              비밀번호
            </label>
            <input
              ref={inputRef}
              id="excload-excel-file-unlock-password"
              name="excload-excel-file-unlock"
              type="password"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              aria-describedby="excload-excel-file-password-hint"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
            />
            <span id="excload-excel-file-password-hint" className="sr-only">
              엑셀·ZIP 파일 열기용 비밀번호이며, 로그인 비밀번호가 아닙니다.
            </span>
          </form>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4">
          <button
            type="button"
            className={EXCLOAD_MODAL_BTN_SECONDARY}
            onClick={onUploadCancel}
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            type="button"
            className={EXCLOAD_MODAL_BTN_PRIMARY}
            disabled={!password.trim() || isSubmitting}
            onClick={() => {
              if (password.trim() && !isSubmitting) onSubmit(password);
            }}
          >
            {isSubmitting ? '여는 중…' : '열기'}
          </button>
        </div>
      </div>
    </div>
  );
}
