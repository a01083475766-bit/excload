import { Resend } from 'resend';
import type {
  VoucherEmailProvider,
  VoucherEmailSendRequest,
  VoucherEmailSendResult,
} from '@/app/lib/voucher/email-provider';

function getFromAddress(): string {
  return (
    process.env.VOUCHER_EMAIL_FROM?.trim() ||
    process.env.PASSWORD_RESET_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    ''
  );
}

/**
 * Resend adapter for voucher emails.
 * Reuses project RESEND_API_KEY / EMAIL_FROM (optional VOUCHER_EMAIL_FROM override).
 */
export function createResendVoucherEmailProvider(): VoucherEmailProvider {
  return {
    async send(request: VoucherEmailSendRequest): Promise<VoucherEmailSendResult> {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      const from = getFromAddress();
      if (!apiKey || !from) {
        return { ok: false, errorCode: 'MAIL_CONFIG_MISSING' };
      }
      try {
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
          from,
          to: request.to,
          subject: request.subject,
          text: request.text,
          html: request.html,
        });
        if (result.error) {
          return { ok: false, errorCode: 'MAIL_SEND_FAILED' };
        }
        const messageId = result.data?.id || `resend_${Date.now()}`;
        return { ok: true, messageId };
      } catch {
        // Do not log recipient or body (may contain codes)
        return { ok: false, errorCode: 'MAIL_SEND_FAILED' };
      }
    },
  };
}
