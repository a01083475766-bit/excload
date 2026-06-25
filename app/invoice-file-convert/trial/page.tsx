import { redirect } from 'next/navigation';

/** 송장변환 체험판 — 미리보기 중심, 엑셀 다운로드는 가입 후 이용 */
export default function InvoiceFileConvertTrialPage() {
  redirect('/invoice-file-convert?trial=1');
}
