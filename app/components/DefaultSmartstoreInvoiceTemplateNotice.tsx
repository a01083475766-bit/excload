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
  const firstLine = '스마트스토어에서 많이 사용하는 기본 송장 업로드 양식으로 설정되어 있습니다.';
  const remainingBanner = DEFAULT_SMARTSTORE_INVOICE_INTRO_COPY.banner
    .replace(firstLine, '')
    .trim();
  const [beforeFixed, afterFixed] =
    remainingBanner.split('「고정 입력 정보 설정」');

  return (
    <div
      className="w-full mt-3 rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/30"
      role="status"
    >
      <p className="text-xs leading-relaxed text-blue-800 dark:text-blue-200">
        {firstLine}
        <br />
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
