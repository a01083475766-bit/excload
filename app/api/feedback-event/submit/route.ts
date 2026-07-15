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
import { validateFeedbackImageFile } from '@/app/lib/feedback-event/attachment-file';
import {
  buildFeedbackAttachmentObjectKey,
  buildPrivateFeedbackAttachmentReference,
  isValidFeedbackSubmissionId,
} from '@/app/lib/feedback-event/attachment-reference';
import {
  deleteFeedbackAttachmentObject,
  uploadFeedbackAttachmentObject,
} from '@/app/lib/feedback-event/attachment-storage';
import { serviceBlockedResponse } from '@/app/lib/user-access-guard';
import crypto from 'crypto';

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
    const requestedSubmissionId = String(form.get('submissionId') ?? '').trim();

    if (requestedSubmissionId && !isValidFeedbackSubmissionId(requestedSubmissionId)) {
      return NextResponse.json({ error: '잘못된 등록 요청입니다.' }, { status: 400 });
    }
    const submissionId = requestedSubmissionId || crypto.randomUUID();

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

    const existingSubmission = await prisma.feedbackSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true },
    });
    if (existingSubmission) {
      if (existingSubmission.userId !== user.id) {
        return NextResponse.json({ error: '중복된 등록 요청입니다.' }, { status: 409 });
      }
      return NextResponse.json({ success: true, submissionId: existingSubmission.id });
    }

    let attachmentName: string | null = null;
    let attachmentUrl: string | null = null;
    let uploadedObjectKey: string | null = null;
    if (fileField && typeof fileField !== 'string' && fileField.size > 0) {
      const validated = await validateFeedbackImageFile(fileField);
      if (!validated.ok) {
        return NextResponse.json(
          { error: validated.error },
          { status: validated.status },
        );
      }

      const objectKey = buildFeedbackAttachmentObjectKey({
        userId: user.id,
        submissionId,
        extension: validated.file.extension,
      });
      try {
        await uploadFeedbackAttachmentObject({
          objectKey,
          bytes: validated.file.bytes,
          contentType: validated.file.contentType,
        });
        uploadedObjectKey = objectKey;
      } catch (error) {
        try {
          await deleteFeedbackAttachmentObject(objectKey);
        } catch {
          // 업로드 응답 유실 가능성에 대한 best-effort 정리
        }
        console.error('[FeedbackSubmitAttachmentUpload]', error instanceof Error ? error.message : error);
        return NextResponse.json(
          { error: '첨부파일 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
          { status: 503 },
        );
      }

      attachmentName = validated.file.originalName.replace(/[\r\n\0]/g, '').trim().slice(0, 255);
      attachmentUrl = buildPrivateFeedbackAttachmentReference(objectKey);
    }

    let submission;
    try {
      submission = await prisma.feedbackSubmission.create({
        data: {
          id: submissionId,
          userId: user.id,
          featureUsed,
          conversionResult,
          content,
          publicConsent,
          attachmentName,
          attachmentUrl,
        },
      });
    } catch (error) {
      if (uploadedObjectKey) {
        try {
          await deleteFeedbackAttachmentObject(uploadedObjectKey);
        } catch (cleanupError) {
          console.error(
            '[FeedbackSubmitAttachmentCleanup]',
            cleanupError instanceof Error ? cleanupError.message : cleanupError,
          );
        }
      }
      throw error;
    }

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
