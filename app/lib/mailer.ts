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

export interface ContactInquiryMailPayload {
  type: string;
  typeLabel: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  company?: string;
  phone?: string;
  attachment?: { filename: string; contentBase64: string };
}

export async function sendContactInquiryEmails(payload: ContactInquiryMailPayload) {
  const resend = getResendClient();
  const from = getEmailFromAddress();
  const adminTo =
    process.env.CONTACT_ADMIN_EMAIL?.trim() || 'sacom5766@naver.com';

  if (!resend || !from) {
    console.warn('[Contact Inquiry Mail] skipped: missing RESEND_API_KEY or EMAIL_FROM');
    return { sent: false, reason: 'MAIL_CONFIG_MISSING' as const };
  }

  const extraLines: string[] = [];
  if (payload.company?.trim()) extraLines.push(`회사명: ${payload.company.trim()}`);
  if (payload.phone?.trim()) extraLines.push(`연락처: ${payload.phone.trim()}`);

  const bodyText = [
    `문의 유형: ${payload.typeLabel}`,
    `이름: ${payload.name}`,
    `이메일: ${payload.email}`,
    ...extraLines,
    '',
    '--- 문의 내용 ---',
    payload.message,
  ].join('\n');

  const bodyHtml = `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
  <h2 style="margin-bottom:12px;">엑클로드 고객문의</h2>
  <table style="border-collapse:collapse; font-size:14px;">
    <tr><td style="padding:4px 12px 4px 0; color:#666;">유형</td><td><strong>${escapeHtml(payload.typeLabel)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0; color:#666;">이름</td><td>${escapeHtml(payload.name)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0; color:#666;">이메일</td><td><a href="mailto:${escapeHtml(payload.email)}">${escapeHtml(payload.email)}</a></td></tr>
    ${payload.company?.trim() ? `<tr><td style="padding:4px 12px 4px 0; color:#666;">회사명</td><td>${escapeHtml(payload.company.trim())}</td></tr>` : ''}
    ${payload.phone?.trim() ? `<tr><td style="padding:4px 12px 4px 0; color:#666;">연락처</td><td>${escapeHtml(payload.phone.trim())}</td></tr>` : ''}
    <tr><td style="padding:4px 12px 4px 0; color:#666;">제목</td><td>${escapeHtml(payload.subject)}</td></tr>
  </table>
  <hr style="margin:20px 0; border:none; border-top:1px solid #eee;" />
  <p style="font-size:14px; white-space:pre-wrap;">${escapeHtml(payload.message)}</p>
  ${payload.attachment ? `<p style="font-size:12px; color:#666; margin-top:16px;">첨부: ${escapeHtml(payload.attachment.filename)}</p>` : ''}
</div>
`.trim();

  const attachments = payload.attachment
    ? [{ filename: payload.attachment.filename, content: payload.attachment.contentBase64 }]
    : undefined;

  const adminSubject = `[엑클로드 문의] ${payload.typeLabel} — ${payload.subject}`;
  const adminMailBase = {
    from,
    to: adminTo,
    replyTo: payload.email,
    subject: adminSubject,
    text: `${adminSubject}\n\n${bodyText}`,
    html: bodyHtml,
  };

  try {
    try {
      await resend.emails.send({
        ...adminMailBase,
        attachments,
      });
    } catch (adminErr) {
      if (!attachments) throw adminErr;
      console.warn('[Contact Inquiry Mail] admin send with attachment failed, retrying without:', adminErr);
      await resend.emails.send(adminMailBase);
    }

    try {
      await resend.emails.send({
        from,
        to: payload.email,
        subject: '[엑클로드] 문의가 접수되었습니다',
        text: [
          `${payload.name}님, 안녕하세요.`,
          '',
          '엑클로드 고객문의가 정상적으로 접수되었습니다.',
          `문의 유형: ${payload.typeLabel}`,
          `제목: ${payload.subject}`,
          '',
          '영업일 기준 1일 이내 순차적으로 답변드리겠습니다.',
          '(주말·공휴일 접수 건은 다음 영업일부터 처리됩니다.)',
          '',
          '감사합니다.',
          '엑클로드 팀',
        ].join('\n'),
        html: `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
  <p>${escapeHtml(payload.name)}님, 안녕하세요.</p>
  <p>엑클로드 고객문의가 <strong>정상적으로 접수</strong>되었습니다.</p>
  <ul style="font-size:14px; color:#444;">
    <li>문의 유형: ${escapeHtml(payload.typeLabel)}</li>
    <li>제목: ${escapeHtml(payload.subject)}</li>
  </ul>
  <p style="font-size:14px;">영업일 기준 <strong>1일 이내</strong> 순차적으로 답변드리겠습니다.<br />
  (주말·공휴일 접수 건은 다음 영업일부터 처리됩니다.)</p>
  <p style="font-size:12px; color:#888; margin-top:20px;">본 메일은 발신전용입니다.</p>
</div>
`.trim(),
      });
    } catch (confirmErr) {
      console.warn('[Contact Inquiry Mail] customer confirmation failed (admin mail sent):', confirmErr);
    }

    return { sent: true as const };
  } catch (error) {
    console.error('[Contact Inquiry Mail] admin send failed:', error);
    return { sent: false, reason: 'MAIL_SEND_FAILED' as const };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
