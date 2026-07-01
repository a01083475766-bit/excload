'use client';

import { useEffect, useRef, useState } from 'react';
import {
  hasTrialFirstPreviewFormatNoticeBeenShown,
  markTrialFirstPreviewFormatNoticeShown,
  type TrialFirstPreviewFormatNoticeScope,
} from '@/app/lib/trial-first-preview-format-notice';

type UseTrialFirstPreviewFormatNoticeOptions = {
  enabled: boolean;
  previewRowCount: number;
  courierHeaderCount: number;
  templateModalOpen: boolean;
  scope: TrialFirstPreviewFormatNoticeScope;
};

export function useTrialFirstPreviewFormatNotice({
  enabled,
  previewRowCount,
  courierHeaderCount,
  templateModalOpen,
  scope,
}: UseTrialFirstPreviewFormatNoticeOptions) {
  const [open, setOpen] = useState(false);
  const prevPreviewRowCountRef = useRef(0);
  const templateModalWasOpenedRef = useRef(false);

  useEffect(() => {
    if (templateModalOpen) {
      templateModalWasOpenedRef.current = true;
    }
  }, [templateModalOpen]);

  useEffect(() => {
    if (!enabled) {
      prevPreviewRowCountRef.current = previewRowCount;
      return;
    }

    const prevCount = prevPreviewRowCountRef.current;
    prevPreviewRowCountRef.current = previewRowCount;

    if (prevCount > 0 || previewRowCount === 0 || courierHeaderCount === 0) {
      return;
    }

    if (hasTrialFirstPreviewFormatNoticeBeenShown(scope)) {
      return;
    }

    if (templateModalWasOpenedRef.current) {
      markTrialFirstPreviewFormatNoticeShown(scope);
      return;
    }

    markTrialFirstPreviewFormatNoticeShown(scope);
    setOpen(true);
  }, [enabled, previewRowCount, courierHeaderCount, scope]);

  const close = () => setOpen(false);

  return { open, close };
}
