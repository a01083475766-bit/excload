import { Resend } from 'resend';

export interface PasswordResetMailPayload {
  email: string;
  code: string;
  expireMinutes: number;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

function getEmailFromAddress() {
  return process.env.PASSWORD_RESET_EMAIL_FROM || process.env.EMAIL_FROM || '';
}

export async function sendPasswordResetCodeEmail(payload: PasswordResetMailPayload) {
  const resend = getResendClient();
  const from = getEmailFromAddress();
  if (!resend || !from) {
    console.warn('[Password Reset Mail] skipped: missing RESEND_API_KEY or EMAIL_FROM');
    return { sent: false, reason: 'MAIL_CONFIG_MISSING' as const };
  }

  try {
    await resend.emails.send({
      from,
      to: payload.email,
      subject: '[엑클로드] 비밀번호 재설정 코드',
      text: `비밀번호 재설정 인증코드: ${payload.code}\n\n${payload.expireMinutes}분 내에 입력해주세요.\n요청하지 않았다면 이 메일을 무시하세요.`,
    });
    return { sent: true as const };
  } catch (error) {
    console.error('[Password Reset Mail] send failed:', error);
    return { sent: false, reason: 'MAIL_SEND_FAILED' as const };
  }
}
