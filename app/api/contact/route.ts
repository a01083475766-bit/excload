import { NextRequest, NextResponse } from 'next/server';
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  getInquiryTypeLabel,
  isAllowedContactAttachment,
  isValidContactEmail,
  safeAttachmentFilename,
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
              '첨부파일은 이미지, PDF, 엑셀, CSV, 텍스트(.txt) 형식만 가능하며 5MB 이하여야 합니다.',
          },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await fileField.arrayBuffer());
      attachment = {
        filename: safeAttachmentFilename(fileField.name),
        contentBase64: buffer.toString('base64'),
      };
    }

    let inquiryId: string | null = null;
    try {
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
          attachmentName:
            attachment?.filename ??
            (fileField instanceof File && fileField.size > 0
              ? fileField.name.slice(0, 200)
              : null),
          status: 'NEW',
          mailSent: false,
        },
      });
      inquiryId = inquiry.id;
    } catch (dbError) {
      console.error('[Contact API] DB save failed (mail will still be attempted):', dbError);
    }

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
      if (inquiryId) {
        await prisma.contactInquiry
          .update({
            where: { id: inquiryId },
            data: { mailSent: true },
          })
          .catch((e) => console.error('[Contact API] mailSent update failed:', e));
      }
      return NextResponse.json({
        success: true,
        message: '문의가 접수되었습니다. 입력하신 이메일로 접수 확인 메일을 보내드렸습니다.',
        inquiryId,
        dbSaved: !!inquiryId,
      });
    }

    if (result.reason === 'MAIL_CONFIG_MISSING') {
      return NextResponse.json(
        {
          error:
            inquiryId
              ? '문의는 접수되었으나 메일 발송 설정이 완료되지 않았습니다. 관리자가 확인 후 연락드리겠습니다.'
              : '메일 발송 설정(RESEND_API_KEY, EMAIL_FROM)이 필요합니다. Vercel 환경 변수를 확인해 주세요.',
          inquiryId,
          mailSent: false,
          dbSaved: !!inquiryId,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: inquiryId
          ? '문의는 접수되었으나 확인 메일 발송에 실패했습니다. 관리자가 확인 후 연락드리겠습니다.'
          : '메일 발송에 실패했습니다. 잠시 후 다시 시도하거나 sacom5766@naver.com 으로 직접 문의해 주세요.',
        inquiryId,
        mailSent: false,
        dbSaved: !!inquiryId,
      },
      { status: 502 }
    );
  } catch (error) {
    console.error('[Contact API] error:', error);
    const detail = error instanceof Error ? error.message : String(error);
    const isDbTableMissing =
      detail.includes('ContactInquiry') ||
      detail.includes('does not exist') ||
      detail.includes('P2021');

    return NextResponse.json(
      {
        error: isDbTableMissing
          ? '문의 저장 DB가 아직 준비되지 않았습니다. 운영 DB에 ContactInquiry 마이그레이션을 적용해 주세요.'
          : '문의 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        code: isDbTableMissing ? 'DB_NOT_READY' : 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
