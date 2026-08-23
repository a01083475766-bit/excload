/** Injectable email provider for voucher code delivery (Resend in prod, mock in tests). */

export type VoucherEmailSendRequest = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type VoucherEmailSendResult =
  | { ok: true; messageId: string }
  | { ok: false; errorCode: string };

export interface VoucherEmailProvider {
  send(request: VoucherEmailSendRequest): Promise<VoucherEmailSendResult>;
}

export function createMockVoucherEmailProvider(opts?: {
  failEmails?: Set<string>;
  failAll?: boolean;
}): VoucherEmailProvider & {
  sent: VoucherEmailSendRequest[];
} {
  const sent: VoucherEmailSendRequest[] = [];
  return {
    sent,
    async send(request) {
      if (opts?.failAll || opts?.failEmails?.has(request.to.trim().toLowerCase())) {
        return { ok: false, errorCode: 'MOCK_PROVIDER_FAIL' };
      }
      sent.push(request);
      return { ok: true, messageId: `mock_${sent.length}` };
    },
  };
}
