import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import {
  MIN_FEEDBACK_CONTENT_LENGTH,
  normalizeFeedbackCategory,
  normalizeFeedbackConversionResult,
} from '@/app/lib/feedback-event/constants';
import { invalidatePublicBoardCache } from '@/app/lib/feedback-event/public-board-cache';
import { getFeedbackViewerFromRequest } from '@/app/lib/feedback-event/viewer';
import { validateFeedbackAttachmentPolicy } from '@/app/lib/feedback-event/attachment-policy';
import { serviceBlockedResponse } from '@/app/lib/user-access-guard';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.xls', '.csv']);

export async function POST(request: NextRequest) {
  try {
    const viewer = await getFeedbackViewerFromRequest(request);
    if (!viewer.email && !viewer.userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const form = await request.formData();
    const featureUsed = normalizeFeedbackCategory(String(form.get('featureUsed') ?? '').trim());
    const conversionResult = normalizeFeedbackConversionResult(
      String(form.get('conversionResult') ?? '').trim(),
    );
    const content = String(form.get('content') ?? '').trim();
    const publicConsent = form.get('publicConsent') === 'true' || form.get('publicConsent') === 'on';
    const fileField = form.get('attachment');

    if (content.length < MIN_FEEDBACK_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `내용을 ${MIN_FEEDBACK_CONTENT_LENGTH}자 이상 입력해 주세요.` },
        { status: 400 },
      );
    }

    const attachmentPolicy = validateFeedbackAttachmentPolicy({
      publicConsent,
      attachment: fileField as { size: number } | string | null,
    });
    if (!attachmentPolicy.ok) {
      return NextResponse.json(
        { error: attachmentPolicy.error },
        { status: attachmentPolicy.status },
      );
    }

    const user = await prisma.user.findUnique({
      where: viewer.userId ? { id: viewer.userId } : { email: viewer.email! },
      select: {
        id: true,
        isBlocked: true,
        abuseFlag: true,
        blockReason: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const blockedResponse = serviceBlockedResponse(user);
    if (blockedResponse) return blockedResponse;

    let attachmentName: string | null = null;
    let attachmentUrl: string | null = null;
    if (fileField && typeof fileField !== 'string' && fileField.size > 0) {
      if (fileField.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: '첨부 파일은 5MB 이하만 가능합니다.' }, { status: 400 });
      }
      const ext = path.extname(fileField.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json(
          { error: '첨부는 이미지, 엑셀, CSV 파일만 가능합니다.' },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await fileField.arrayBuffer());
      const safeName = `${crypto.randomUUID()}${ext}`;
      const dir = path.join(process.cwd(), 'public', 'uploads', 'feedback');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, safeName), buf);
      attachmentName = fileField.name;
      attachmentUrl = `/uploads/feedback/${safeName}`;
    }

    const submission = await prisma.feedbackSubmission.create({
      data: {
        userId: user.id,
        featureUsed,
        conversionResult,
        content,
        publicConsent,
        attachmentName,
        attachmentUrl,
      },
    });

    invalidatePublicBoardCache();

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
    });
  } catch (error) {
    console.error('[FeedbackSubmit]', error);
    return NextResponse.json({ error: '제출 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
