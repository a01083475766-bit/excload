import { NextRequest, NextResponse } from 'next/server';
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  getInquiryTypeLabel,
  isAllowedContactAttachment,
  isValidContactEmail,
} from '@/app/lib/contact-inquiry';
import { sendContactInquiryEmails } from '@/app/lib/mailer';
import { prisma } from '@/app/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const type = String(form.get('type') ?? 'general').trim();
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const subject = String(form.get('subject') ?? '').trim();
    const message = String(form.get('message') ?? '').trim();
    const company = String(form.get('company') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();

    if (!name || name.length > 80) {
      return NextResponse.json({ error: '이름을 확인해 주세요.' }, { status: 400 });
    }
    if (!isValidContactEmail(email)) {
      return NextResponse.json({ error: '이메일 형식을 확인해 주세요.' }, { status: 400 });
    }
    if (!subject || subject.length > 200) {
      return NextResponse.json({ error: '제목을 확인해 주세요.' }, { status: 400 });
    }
    if (!message || message.length > CONTACT_MESSAGE_MAX_LENGTH) {
      return NextResponse.json(
        { error: `문의 내용을 ${CONTACT_MESSAGE_MAX_LENGTH}자 이내로 입력해 주세요.` },
        { status: 400 }
      );
    }

    const typeLabel = getInquiryTypeLabel(type);
    let attachment: { filename: string; contentBase64: string } | undefined;

    const fileField = form.get('attachment');
    if (fileField instanceof File && fileField.size > 0) {
      if (!isAllowedContactAttachment(fileField)) {
        return NextResponse.json(
          {
            error:
              '첨부파일은 이미지, PDF, 엑셀, CSV, 텍스트 형식만 가능하며 5MB 이하여야 합니다.',
          },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await fileField.arrayBuffer());
      attachment = {
        filename: fileField.name.slice(0, 200),
        contentBase64: buffer.toString('base64'),
      };
    }

    const inquiry = await prisma.contactInquiry.create({
      data: {
        type,
        typeLabel,
        name,
        email,
        subject,
        message,
        company: type === 'business' && company ? company : null,
        phone: type === 'business' && phone ? phone : null,
        attachmentName: attachment?.filename ?? null,
        status: 'NEW',
        mailSent: false,
      },
    });

    const result = await sendContactInquiryEmails({
      type,
      typeLabel,
      name,
      email,
      subject,
      message,
      company: type === 'business' ? company : undefined,
      phone: type === 'business' ? phone : undefined,
      attachment,
    });

    if (result.sent) {
      await prisma.contactInquiry.update({
        where: { id: inquiry.id },
        data: { mailSent: true },
      });
    } else if (result.reason === 'MAIL_CONFIG_MISSING') {
      return NextResponse.json(
        {
          error:
            '문의는 접수되었으나 메일 발송 설정이 완료되지 않았습니다. 관리자가 확인 후 연락드리겠습니다.',
          inquiryId: inquiry.id,
          mailSent: false,
        },
        { status: 503 }
      );
    } else {
      return NextResponse.json(
        {
          error:
            '문의는 접수되었으나 확인 메일 발송에 실패했습니다. 관리자가 확인 후 연락드리겠습니다.',
          inquiryId: inquiry.id,
          mailSent: false,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '문의가 접수되었습니다. 입력하신 이메일로 접수 확인 메일을 보내드렸습니다.',
      inquiryId: inquiry.id,
    });
  } catch (error) {
    console.error('[Contact API] error:', error);
    return NextResponse.json({ error: '문의 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
