'use client';

import { DEFAULT_SMARTSTORE_INVOICE_INTRO_COPY } from '@/app/lib/default-smartstore-invoice-template';

interface DefaultSmartstoreInvoiceTemplateNoticeProps {
  onRegisterCustom?: () => void;
  onOpenFixedInput?: () => void;
}

export function DefaultSmartstoreInvoiceTemplateNotice({
  onRegisterCustom,
  onOpenFixedInput,
}: DefaultSmartstoreInvoiceTemplateNoticeProps) {
  const [beforeFixed, afterFixed] =
    DEFAULT_SMARTSTORE_INVOICE_INTRO_COPY.banner.split('「고정 입력 정보 설정」');

  return (
    <div
      className="w-full mt-3 rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/30"
      role="status"
    >
      <p className="text-xs leading-relaxed text-blue-800 dark:text-blue-200">
        {beforeFixed}
        {onOpenFixedInput ? (
          <button
            type="button"
            onClick={onOpenFixedInput}
            className="font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
          >
            고정 입력 정보 설정
          </button>
        ) : (
          <span className="font-medium">「고정 입력 정보 설정」</span>
        )}
        {afterFixed.split('「쇼핑몰 송장 업로드 양식 등록」')[0]}
        {onRegisterCustom ? (
          <button
            type="button"
            onClick={onRegisterCustom}
            className="font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
          >
            쇼핑몰 송장 업로드 양식 등록
          </button>
        ) : (
          <span className="font-medium">「쇼핑몰 송장 업로드 양식 등록」</span>
        )}
        {afterFixed.split('「쇼핑몰 송장 업로드 양식 등록」')[1]}
      </p>
    </div>
  );
}
