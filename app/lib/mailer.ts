import { Resend } from 'resend';

export interface PasswordResetMailPayload {
  email: string;
  code: string;
  expireMinutes: number;
}

export interface SignupVerificationMailPayload {
  email: string;
  code: string;
  expireMinutes: number;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  // 운영 비밀키 원문 노출 방지를 위해 값 자체 대신 설정 여부만 로그로 남긴다.
  console.log('RESEND_API_KEY:', apiKey ? '[SET]' : undefined);
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

function getEmailFromAddress() {
  return process.env.PASSWORD_RESET_EMAIL_FROM || process.env.EMAIL_FROM || '';
}

export async function sendPasswordResetCodeEmail(payload: PasswordResetMailPayload) {
  console.log('MAILER FUNCTION START');
  console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'SET' : 'UNDEFINED');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
  const resend = getResendClient();
  const from = getEmailFromAddress();
  if (!resend || !from) {
    console.warn('[Password Reset Mail] skipped: missing RESEND_API_KEY or EMAIL_FROM');
    return { sent: false, reason: 'MAIL_CONFIG_MISSING' as const };
  }

  try {
    console.log('SENDING EMAIL NOW');
    const subject = '[엑클로드] 비밀번호 재설정 인증코드 안내';
    const html = `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
  <h2 style="margin-bottom:10px;">🔐 비밀번호 재설정 안내</h2>
  <p>안녕하세요, <strong>엑클로드(EXCLOAD)</strong> 입니다.</p>
  <p>비밀번호 재설정을 위한 인증코드를 안내드립니다.</p>

  <div style="margin:20px 0; padding:20px; text-align:center; background:#f5f7ff; border-radius:10px; border:1px solid #dfe3ff;">
    <div style="font-size:14px; color:#666;">인증코드</div>
    <div style="font-size:32px; font-weight:bold; letter-spacing:5px; margin:10px 0; color:#3b5cff;">
      ${payload.code}
    </div>
  </div>

  <p>⏳ <strong>${payload.expireMinutes}분 이내</strong>에 엑클로드 비밀번호 재설정 화면에 인증코드를 입력해주세요.</p>
  <hr style="margin:25px 0;" />
  <p style="font-size:14px; color:#555;">
    📦 엑클로드는 주문 데이터를 자동으로 변환하여<br />
    택배 업로드 파일을 간편하게 만들어주는 서비스입니다.
  </p>
  <p style="font-size:14px; color:#555;">
    사용 중 불편한 점이나 문의사항이 있으시면 언제든지 연락해주세요.
  </p>
  <p style="font-size:14px;">
    👉 <a href="https://www.excload.com" target="_blank" rel="noopener noreferrer">엑클로드 바로가기</a>
  </p>
  <hr style="margin:25px 0;" />
  <p style="font-size:12px; color:#888;">
    ⚠️ 본 요청을 하지 않으셨다면 이 메일을 무시하셔도 됩니다.<br />
    해당 코드는 타인과 공유하지 마세요.
  </p>
  <p style="font-size:12px; color:#888; margin-top:8px;">
    본 메일은 발신전용으로 회신이 불가합니다.
  </p>
</div>
`.trim();
    const text = [
      '[엑클로드] 비밀번호 재설정 인증코드 안내',
      '',
      '안녕하세요, 엑클로드(EXCLOAD) 입니다.',
      '비밀번호 재설정을 위한 인증코드를 안내드립니다.',
      '',
      `인증코드: ${payload.code}`,
      `${payload.expireMinutes}분 내에 엑클로드 비밀번호 재설정 화면에 인증코드를 입력해주세요.`,
      '',
      '엑클로드 바로가기: https://www.excload.com',
      '',
      '본 요청을 하지 않으셨다면 이 메일을 무시하셔도 됩니다.',
      '본 메일은 발신전용으로 회신이 불가합니다.',
    ].join('\n');

    console.log('[Password Reset Mail] send() called:', {
      to: payload.email,
      from,
    });
    await resend.emails.send({
      from,
      to: payload.email,
      subject,
      text,
      html,
    });
    return { sent: true as const };
  } catch (error) {
    console.error('[Password Reset Mail] send failed:', error);
    return { sent: false, reason: 'MAIL_SEND_FAILED' as const };
  }
}

export async function sendSignupVerificationCodeEmail(payload: SignupVerificationMailPayload) {
  const resend = getResendClient();
  const from = getEmailFromAddress();
  if (!resend || !from) {
    console.warn('[Signup Mail] skipped: missing RESEND_API_KEY or EMAIL_FROM');
    return { sent: false, reason: 'MAIL_CONFIG_MISSING' as const };
  }

  try {
    await resend.emails.send({
      from,
      to: payload.email,
      subject: '[엑클로드] 회원가입 인증코드 안내',
      text: [
        '[엑클로드] 회원가입 인증코드 안내',
        '',
        `인증코드: ${payload.code}`,
        `${payload.expireMinutes}분 내에 회원가입 화면에 입력해주세요.`,
        '',
        '본 메일은 발신전용으로 회신이 불가합니다.',
      ].join('\n'),
      html: `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
  <h2 style="margin-bottom:10px;">✅ 회원가입 인증 안내</h2>
  <p>안녕하세요, <strong>엑클로드(EXCLOAD)</strong> 입니다.</p>
  <p>회원가입 인증코드를 안내드립니다.</p>
  <div style="margin:20px 0; padding:20px; text-align:center; background:#f5f7ff; border-radius:10px; border:1px solid #dfe3ff;">
    <div style="font-size:14px; color:#666;">인증코드</div>
    <div style="font-size:32px; font-weight:bold; letter-spacing:5px; margin:10px 0; color:#3b5cff;">
      ${payload.code}
    </div>
  </div>
  <p>⏳ <strong>${payload.expireMinutes}분 이내</strong>에 회원가입 화면에 인증코드를 입력해주세요.</p>
  <p style="font-size:12px; color:#888; margin-top:14px;">본 메일은 발신전용으로 회신이 불가합니다.</p>
</div>
`.trim(),
    });
    return { sent: true as const };
  } catch (error) {
    console.error('[Signup Mail] send failed:', error);
    return { sent: false, reason: 'MAIL_SEND_FAILED' as const };
  }
}
