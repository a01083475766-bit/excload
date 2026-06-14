'use client';

import { DEFAULT_CJ_INTRO_COPY } from '@/app/lib/default-cj-courier-template';

type DefaultCjTemplateNoticeVariant = 'courier' | 'logistics';

interface DefaultCjTemplateNoticeProps {
  variant: DefaultCjTemplateNoticeVariant;
  onRegisterCustom?: () => void;
}

export function DefaultCjTemplateNotice({
  variant,
  onRegisterCustom,
}: DefaultCjTemplateNoticeProps) {
  const message =
    variant === 'logistics'
      ? DEFAULT_CJ_INTRO_COPY.bannerLogistics
      : DEFAULT_CJ_INTRO_COPY.bannerCourier;

  return (
    <div
      className="w-full mt-3 rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/30"
      role="status"
    >
      <p className="text-xs leading-relaxed text-blue-800 dark:text-blue-200">
        {message.split('「업로드 양식 등록」')[0]}
        {onRegisterCustom ? (
          <button
            type="button"
            onClick={onRegisterCustom}
            className="font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
          >
            업로드 양식 등록
          </button>
        ) : (
          <span className="font-medium">「업로드 양식 등록」</span>
        )}
        {message.split('「업로드 양식 등록」')[1]}
      </p>
    </div>
  );
}
