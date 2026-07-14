import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  FEEDBACK_TRIAL_POINTS,
  isValidFeedbackConversionResult,
  isValidFeedbackFeature,
  MIN_FEEDBACK_CONTENT_LENGTH,
  FEEDBACK_REPLY_ALREADY_USED_TRIAL,
  FEEDBACK_REPLY_DURING_TRIAL,
  FEEDBACK_REPLY_GENERIC,
  FEEDBACK_REPLY_PAID_USER,
} from '@/app/lib/feedback-event/constants';
import {
  buildTrialSystemReply,
  grantFeedbackTrial,
  hasProEntitlement,
  isFeedbackTrialActive,
} from '@/app/lib/feedback-event/entitlement';
import { invalidateAnonymousStatusCache } from '@/app/lib/feedback-event/anonymous-status-cache';
import { invalidatePublicBoardCache } from '@/app/lib/feedback-event/public-board-cache';
import { getFeedbackViewerFromRequest } from '@/app/lib/feedback-event/viewer';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import { serviceBlockedResponse } from '@/app/lib/user-access-guard';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.xls', '.csv']);

export async function POST(request: NextRequest) {
  try {
    const config = await getFeedbackEventConfig();
    if (!config.isActive) {
      return NextResponse.json(
        { error: '베타 피드백 접수 기간이 종료되었습니다.' },
        { status: 403 },
      );
    }

    const viewer = await getFeedbackViewerFromRequest(request);
    if (!viewer.email && !viewer.userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const form = await request.formData();
    const featureUsed = String(form.get('featureUsed') ?? '').trim();
    const conversionResult = String(form.get('conversionResult') ?? '').trim();
    const content = String(form.get('content') ?? '').trim();
    const publicConsent = form.get('publicConsent') === 'true' || form.get('publicConsent') === 'on';
    const fileField = form.get('attachment');

    if (!isValidFeedbackFeature(featureUsed)) {
      return NextResponse.json({ error: '사용한 기능을 선택해 주세요.' }, { status: 400 });
    }
    if (!isValidFeedbackConversionResult(conversionResult)) {
      return NextResponse.json({ error: '변환 결과를 선택해 주세요.' }, { status: 400 });
    }

    if (content.length < MIN_FEEDBACK_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `내용을 ${MIN_FEEDBACK_CONTENT_LENGTH}자 이상 입력해 주세요.` },
        { status: 400 },
      );
    }

    if (!publicConsent && fileField && typeof fileField !== 'string' && fileField.size > 0) {
      return NextResponse.json(
        { error: '비공개 글의 안전한 파일 첨부 기능은 준비 중입니다. 첨부 없이 등록해 주세요.' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: viewer.userId ? { id: viewer.userId } : { email: viewer.email! },
      select: {
        id: true,
        plan: true,
        feedbackTrialUsed: true,
        feedbackTrialEndsAt: true,
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
          { error: '첨부는 이미지·엑셀·CSV 파일만 가능합니다.' },
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

    const isPaid = isPaidDbPlan(user.plan);
    const shouldGrantTrial =
      !isPaid && !user.feedbackTrialUsed && !hasProEntitlement(user);

    let trialGranted = false;
    let systemReply: string | null = null;
    let trialEndsAt: Date | null = null;

    if (shouldGrantTrial) {
      const granted = await grantFeedbackTrial(user.id);
      trialGranted = true;
      trialEndsAt = granted.endsAt;
      systemReply = buildTrialSystemReply(granted.endsAt);
    } else if (isPaid) {
      systemReply = FEEDBACK_REPLY_PAID_USER;
    } else if (
      user.feedbackTrialUsed &&
      isFeedbackTrialActive(user.feedbackTrialEndsAt)
    ) {
      systemReply = FEEDBACK_REPLY_DURING_TRIAL;
    } else if (user.feedbackTrialUsed) {
      systemReply = FEEDBACK_REPLY_ALREADY_USED_TRIAL;
    } else {
      systemReply = FEEDBACK_REPLY_GENERIC;
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
        trialGranted,
        systemReply,
      },
    });

    invalidatePublicBoardCache();
    invalidateAnonymousStatusCache();

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      trialGranted,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      points: trialGranted ? FEEDBACK_TRIAL_POINTS : undefined,
      systemReply,
    });
  } catch (error) {
    console.error('[FeedbackEventSubmit]', error);
    return NextResponse.json({ error: '제출 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
