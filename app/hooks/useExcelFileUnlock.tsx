'use client';

import { useCallback, useRef, useState } from 'react';
import { ExcelProtectedFileModal } from '@/app/components/ExcelProtectedFileModal';
import {
  ExcelUnlockCancelledError,
  ExcelUnsupportedProtectedError,
  ExcelWrongPasswordError,
} from '@/app/lib/excel/protected-file-types';
import {
  decryptUploadedExcelFile,
  probeExcelUploadFile,
} from '@/app/lib/excel/unlock-office-file';
import type { ProtectedFileKind } from '@/app/lib/excel/protected-file-types';

type PasswordModalState = {
  mode: 'password';
  file: File;
  fileName: string;
  kind: ProtectedFileKind;
  buffer: ArrayBuffer;
  wrongPassword: boolean;
  attemptCount: number;
  isSubmitting: boolean;
};

type UnsupportedModalState = {
  mode: 'unsupported';
  fileName: string;
  message: string;
};

type PendingResolve = {
  resolve: (buffer: ArrayBuffer) => void;
  reject: (error: Error) => void;
};

export function useExcelFileUnlock() {
  const [modal, setModal] = useState<PasswordModalState | UnsupportedModalState | null>(null);
  const pendingRef = useRef<PendingResolve | null>(null);
  const passwordFlowRef = useRef<{
    file: File;
    kind: ProtectedFileKind;
    buffer: ArrayBuffer;
    attemptCount: number;
  } | null>(null);

  const closeModal = useCallback(() => {
    setModal(null);
    passwordFlowRef.current = null;
  }, []);

  const rejectPending = useCallback(
    (error: Error) => {
      pendingRef.current?.reject(error);
      pendingRef.current = null;
      closeModal();
    },
    [closeModal],
  );

  const resolvePending = useCallback(
    (buffer: ArrayBuffer) => {
      pendingRef.current?.resolve(buffer);
      pendingRef.current = null;
      closeModal();
    },
    [closeModal],
  );

  const openPasswordModal = useCallback(
    (file: File, kind: ProtectedFileKind, buffer: ArrayBuffer) => {
      passwordFlowRef.current = { file, kind, buffer, attemptCount: 0 };
      setModal({
        mode: 'password',
        file,
        fileName: file.name,
        kind,
        buffer,
        wrongPassword: false,
        attemptCount: 0,
        isSubmitting: false,
      });
    },
    [],
  );

  const openUnsupportedModal = useCallback((fileName: string, message: string) => {
    setModal({ mode: 'unsupported', fileName, message });
  }, []);

  const handlePasswordSubmit = useCallback(
    async (password: string) => {
      const flow = passwordFlowRef.current;
      if (!flow || !modal || modal.mode !== 'password') return;

      setModal((prev) =>
        prev && prev.mode === 'password'
          ? { ...prev, isSubmitting: true, wrongPassword: false }
          : prev,
      );

      try {
        const decrypted = await decryptUploadedExcelFile(
          flow.buffer,
          flow.kind,
          password,
          flow.kind === 'zip' ? flow.file : undefined,
        );
        resolvePending(decrypted);
      } catch (error) {
        if (error instanceof ExcelWrongPasswordError) {
          const nextAttempt = flow.attemptCount + 1;
          passwordFlowRef.current = { ...flow, attemptCount: nextAttempt };
          setModal((prev) =>
            prev && prev.mode === 'password'
              ? {
                  ...prev,
                  wrongPassword: true,
                  attemptCount: nextAttempt,
                  isSubmitting: false,
                }
              : prev,
          );
          return;
        }

        if (error instanceof ExcelUnsupportedProtectedError) {
          passwordFlowRef.current = null;
          openUnsupportedModal(flow.file.name, error.message);
          return;
        }

        rejectPending(
          error instanceof Error
            ? error
            : new Error('파일을 열 수 없습니다.'),
        );
      }
    },
    [modal, openUnsupportedModal, rejectPending, resolvePending],
  );

  const handlePasswordCancel = useCallback(() => {
    rejectPending(new ExcelUnlockCancelledError());
  }, [rejectPending]);

  const handleUnsupportedClose = useCallback(() => {
    rejectPending(new ExcelUnlockCancelledError());
  }, [rejectPending]);

  const unlockExcelFile = useCallback(
    (file: File): Promise<ArrayBuffer> => {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        pendingRef.current = { resolve, reject };

        void (async () => {
          try {
            const probe = await probeExcelUploadFile(file);

            if (probe.action === 'use_plain') {
              resolvePending(probe.buffer);
              return;
            }

            if (probe.action === 'unsupported') {
              openUnsupportedModal(file.name, probe.message);
              return;
            }

            openPasswordModal(file, probe.kind, probe.buffer);
          } catch (error) {
            rejectPending(
              error instanceof Error
                ? error
                : new Error('파일을 확인할 수 없습니다.'),
            );
          }
        })();
      });
    },
    [openPasswordModal, openUnsupportedModal, rejectPending, resolvePending],
  );

  const excelProtectedFileModal =
    modal == null ? null : modal.mode === 'unsupported' ? (
      <ExcelProtectedFileModal
        mode="unsupported"
        fileName={modal.fileName}
        message={modal.message}
        onClose={handleUnsupportedClose}
      />
    ) : (
      <ExcelProtectedFileModal
        mode="password"
        fileName={modal.fileName}
        kind={modal.kind}
        wrongPassword={modal.wrongPassword}
        attemptCount={modal.attemptCount}
        isSubmitting={modal.isSubmitting}
        onSubmit={(pw) => void handlePasswordSubmit(pw)}
        onCancel={handlePasswordCancel}
      />
    );

  return { unlockExcelFile, excelProtectedFileModal };
}
