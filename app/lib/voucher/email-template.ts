import { maskEmail } from '@/app/lib/voucher/campaign';

export const WADIZ_VOUCHER_EMAIL_SUBJECT = '[엑클로드] 와디즈 이용권 코드를 보내드립니다';
export const WADIZ_REDEEM_URL = 'https://www.excload.com/redeem/wadiz-2026-01';
export const WADIZ_CONTACT_URL = 'https://www.excload.com/contact';
export const WADIZ_REDEEM_OPEN_LABEL = '2026년 10월 1일';

export type VoucherEmailCodeLine = {
  externalOrderId: string;
  unitIndex: number;
  rewardLabel: string;
  voucherCode: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function redeemAvailabilityMessage(redeemFrom: Date | null, now = new Date()): string {
  if (redeemFrom && now.getTime() < redeemFrom.getTime()) {
    return `${WADIZ_REDEEM_OPEN_LABEL}부터 등록할 수 있습니다`;
  }
  return '지금 등록할 수 있습니다';
}

export function buildWadizVoucherEmail(input: {
  buyerName: string | null;
  codes: VoucherEmailCodeLine[];
  redeemFrom: Date | null;
  now?: Date;
}): { subject: string; text: string; html: string } {
  const now = input.now ?? new Date();
  const name = (input.buyerName || '').trim() || '고객';
  const availability = redeemAvailabilityMessage(input.redeemFrom, now);
  const rewardLabels = [...new Set(input.codes.map((c) => c.rewardLabel).filter(Boolean))];
  const rewardText = rewardLabels.length ? rewardLabels.join(', ') : '와디즈 이용권';

  const codeLines = input.codes.map(
    (c, i) =>
      `${i + 1}. [${c.rewardLabel || '이용권'}] ${c.voucherCode} (주문 ${c.externalOrderId} / #${c.unitIndex})`,
  );

  const text = [
    WADIZ_VOUCHER_EMAIL_SUBJECT,
    '',
    `${name}님, 안녕하세요.`,
    '엑클로드(EXCLOAD)입니다.',
    '',
    `와디즈에서 구매하신 리워드(${rewardText})에 대한 이용권 코드를 안내드립니다.`,
    '',
    '■ 이용권 코드',
    ...codeLines,
    '',
    '■ 이용권 등록하기',
    '회원가입 또는 로그인 후 아래 주소에서 코드를 등록해 주세요.',
    `등록 페이지: ${WADIZ_REDEEM_URL}`,
    '',
    `■ 등록 안내: ${availability}`,
    `등록 가능일: ${WADIZ_REDEEM_OPEN_LABEL}`,
    '',
    '2026년 9월 30일까지는 오픈 베타 무료 기간이며,',
    '이 기간에는 와디즈 리워드 이용기간이 차감되지 않습니다.',
    '',
    `문의: ${WADIZ_CONTACT_URL}`,
    '',
    '본 메일은 발신전용입니다. 비밀번호 등 민감정보는 포함되어 있지 않습니다.',
  ].join('\n');

  const codeHtml = input.codes
    .map(
      (c) => `
  <li style="margin:0 0 8px;">
    <div style="font-size:13px;color:#666;">${escapeHtml(c.rewardLabel || '이용권')} · 주문 ${escapeHtml(c.externalOrderId)} / #${c.unitIndex}</div>
    <div style="font-size:20px;font-weight:bold;letter-spacing:1px;font-family:ui-monospace,monospace;margin-top:4px;">${escapeHtml(c.voucherCode)}</div>
  </li>`,
    )
    .join('');

  const html = `
<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:560px;">
  <h2 style="margin:0 0 12px;font-size:18px;">와디즈 이용권 코드 안내</h2>
  <p style="margin:0 0 12px;">${escapeHtml(name)}님, 안녕하세요.<br/>엑클로드(EXCLOAD)입니다.</p>
  <p style="margin:0 0 16px;">와디즈에서 구매하신 리워드(<strong>${escapeHtml(rewardText)}</strong>)에 대한 이용권 코드를 안내드립니다.</p>
  <p style="margin:0 0 8px;font-size:13px;color:#666;">이용권 코드</p>
  <ul style="margin:0 0 20px;padding-left:18px;">${codeHtml}</ul>
  <div style="margin:0 0 20px;padding:16px;border:1px solid #d4d4d8;border-radius:8px;background:#fafafa;">
    <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#18181b;">이용권 등록하기</p>
    <p style="margin:0 0 14px;font-size:13px;color:#52525b;">회원가입 또는 로그인 후 코드를 입력해 주세요.</p>
    <a href="${WADIZ_REDEEM_URL}" target="_blank" rel="noopener noreferrer"
       style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">
      등록 페이지 열기
    </a>
    <p style="margin:12px 0 0;font-size:11px;color:#71717a;word-break:break-all;">
      ${WADIZ_REDEEM_URL}
    </p>
  </div>
  <p style="margin:0 0 8px;"><strong>${escapeHtml(availability)}</strong></p>
  <p style="margin:0 0 12px;font-size:14px;">등록 가능일: ${WADIZ_REDEEM_OPEN_LABEL}</p>
  <p style="margin:0 0 16px;font-size:14px;color:#444;">
    2026년 9월 30일까지는 오픈 베타 무료 기간이며,<br/>
    이 기간에는 와디즈 리워드 이용기간이 차감되지 않습니다.
  </p>
  <p style="margin:0 0 8px;font-size:13px;">문의: <a href="${WADIZ_CONTACT_URL}">${WADIZ_CONTACT_URL}</a></p>
  <p style="margin:16px 0 0;font-size:11px;color:#888;">본 메일은 발신전용입니다. 비밀번호 등 민감정보는 포함되어 있지 않습니다.</p>
</div>
`.trim();

  return { subject: WADIZ_VOUCHER_EMAIL_SUBJECT, text, html };
}

/** Safe for admin UI / logs — never full address */
export function maskBuyerEmailForUi(email: string | null | undefined): string {
  if (!email?.trim()) return '—';
  try {
    return maskEmail(email.trim());
  } catch {
    return '***';
  }
}
