import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { canViewFeedbackPost } from '@/app/lib/feedback-event/permissions';
import {
  getFeedbackViewerFromRequest,
  resolveFeedbackViewerUserId,
} from '@/app/lib/feedback-event/viewer';
import { getPrivateFeedbackAttachmentObjectKey } from '@/app/lib/feedback-event/attachment-reference';
import { downloadFeedbackAttachmentObject } from '@/app/lib/feedback-event/attachment-storage';

type RouteCtx = { params: Promise<{ id: string }> };

function attachmentContentType(objectKey: string): string {
  if (objectKey.endsWith('.png')) return 'image/png';
  if (objectKey.endsWith('.jpg')) return 'image/jpeg';
  if (objectKey.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function contentDisposition(fileName: string | null): string {
  const safeName = (fileName || 'attachment').replace(/[\r\n\0]/g, '').slice(0, 255);
  return `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  try {
    const viewer = await getFeedbackViewerFromRequest(request);
    const myUserId = await resolveFeedbackViewerUserId(viewer);
    if (!viewer.email && !myUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const post = await prisma.feedbackSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        publicConsent: true,
        attachmentName: true,
        attachmentUrl: true,
      },
    });

    if (!post || !canViewFeedbackPost(post, myUserId, viewer.isAdmin)) {
      return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const objectKey = getPrivateFeedbackAttachmentObjectKey(post.attachmentUrl);
    if (!objectKey) {
      return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const object = await downloadFeedbackAttachmentObject(objectKey);
    if (!object) {
      return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const headers = new Headers({
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': contentDisposition(post.attachmentName),
      'Content-Type': attachmentContentType(objectKey),
      'X-Content-Type-Options': 'nosniff',
    });
    if (object.contentLength) headers.set('Content-Length', object.contentLength);

    return new NextResponse(object.body, { status: 200, headers });
  } catch (error) {
    console.error('[FeedbackAttachmentGET]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '첨부파일을 불러오지 못했습니다.' }, { status: 500 });
  }
}
