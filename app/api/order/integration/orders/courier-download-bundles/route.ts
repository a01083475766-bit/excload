import { NextResponse } from 'next/server';

import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { parseCourierDownloadBundleBody } from '@/app/lib/order-integration/courier-download/parse-courier-download-bundle-body';
import {
  formatCourierDownloadBundleLabel,
  listActiveCourierDownloadBundles,
  persistCourierDownloadBundle,
} from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';
import { prisma } from '@/app/lib/prisma';

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

/** 미만료 Bundle 목록 */
export async function GET() {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

    const bundles = await listActiveCourierDownloadBundles(prisma, { userId: auth.userId });
    return NextResponse.json({ success: true, bundles });
  } catch (error) {
    console.error(
      '[CourierDownloadBundles] list failed:',
      error instanceof Error ? error.message : 'failed',
    );
    return NextResponse.json({ error: 'Failed to list download bundles.' }, { status: 500 });
  }
}

/**
 * 택배양식 다운로드 응답 직전에 Bundle/WorkItem 생성.
 * (브라우저 파일 저장 여부는 알 수 없으므로 서버 생성 성공 = 다운로드 성공으로 해석)
 */
export async function POST(request: Request) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

    const parsed = parseCourierDownloadBundleBody(await readJson(request));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await persistCourierDownloadBundle(prisma, {
      userId: auth.userId,
      courierTemplateLabel: parsed.body.courierTemplateLabel,
      items: parsed.body.items,
    });

    return NextResponse.json({
      success: true,
      bundle: {
        id: result.bundleId,
        expiresAt: result.expiresAt,
        rowCount: result.rowCount,
        apiCount: result.apiCount,
        manualCount: result.manualCount,
        label: formatCourierDownloadBundleLabel({
          createdAt: new Date(),
          rowCount: result.rowCount,
          apiCount: result.apiCount,
          manualCount: result.manualCount,
        }),
      },
    });
  } catch (error) {
    console.error(
      '[CourierDownloadBundles] create failed:',
      error instanceof Error ? error.message : 'failed',
    );
    return NextResponse.json({ error: 'Failed to create download bundle.' }, { status: 500 });
  }
}
