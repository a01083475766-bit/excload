import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { buildCourierDownloadRedownloadRows } from '@/app/lib/order-integration/courier-download/redownload-courier-download-bundle';
import { prisma } from '@/app/lib/prisma';

/**
 * 택배양식 Bundle 재다운로드 (OrderSync 스냅샷 기준 기본 열).
 * GET .../courier-download-bundles/{bundleId}/redownload
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

    const { bundleId } = await params;
    const result = await buildCourierDownloadRedownloadRows(prisma, {
      userId: auth.userId,
      bundleId,
    });

    if (!result.ok) {
      const status = result.reason === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ error: result.message }, { status });
    }

    const worksheet = XLSX.utils.json_to_sheet(result.rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '주문');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const fileName = `${result.fileStem}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
        'X-Exported-Count': String(result.exportedCount),
        'X-Skipped-Pii-Cleared': String(result.skippedPiiCleared),
        'X-Skipped-Missing-Order': String(result.skippedMissingOrder),
      },
    });
  } catch (error) {
    console.error(
      '[CourierDownloadBundles] redownload failed:',
      error instanceof Error ? error.message : 'failed',
    );
    return NextResponse.json({ error: 'Failed to redownload bundle.' }, { status: 500 });
  }
}
