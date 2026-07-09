import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import {
  buildShipmentUploadExportRows,
  type BuildShipmentUploadExportRowsClient,
} from '@/app/lib/order-integration/shipments/build-shipment-upload-export-rows';
import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import {
  buildShipmentUploadExportCsvContent,
  buildShipmentUploadExportFileName,
  buildShipmentUploadExportXlsxBuffer,
  parseShipmentUploadExportFormat,
  parseShipmentUploadExportIntegrationAccountId,
  parseShipmentUploadExportProvider,
  resolveShipmentUploadExportGroupsForDownload,
} from '@/app/lib/order-integration/shipments/render-shipment-upload-export-file';
import { prisma } from '@/app/lib/prisma';

async function resolveAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim();
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { batchId } = await params;
    const validatedBatchId = validateShipmentUploadBatchId(batchId);
    if (typeof validatedBatchId !== 'string') {
      return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
    }

    const url = new URL(request.url);
    const parsedFormat = parseShipmentUploadExportFormat(url.searchParams.get('format'));
    if (typeof parsedFormat !== 'string') {
      return NextResponse.json({ error: parsedFormat.error }, { status: 400 });
    }

    const parsedProviderResult = parseShipmentUploadExportProvider(url.searchParams.get('provider'));
    if (
      typeof parsedProviderResult === 'object' &&
      parsedProviderResult !== null &&
      'error' in parsedProviderResult
    ) {
      return NextResponse.json({ error: parsedProviderResult.error }, { status: 400 });
    }

    const parsedProvider = parsedProviderResult;

    const hasIntegrationAccountFilter = url.searchParams.has('integrationAccountId');
    const integrationAccountId = hasIntegrationAccountFilter
      ? parseShipmentUploadExportIntegrationAccountId(url.searchParams.get('integrationAccountId'))
      : null;

    const exportResult = await buildShipmentUploadExportRows(
      prisma as unknown as BuildShipmentUploadExportRowsClient,
      {
        userId,
        batchId: validatedBatchId,
      },
    );

    if (!exportResult.success) {
      return NextResponse.json({ error: exportResult.error }, { status: exportResult.status });
    }

    const groupResult = resolveShipmentUploadExportGroupsForDownload({
      groups: exportResult.body.groups,
      format: parsedFormat,
      provider: parsedProvider,
      integrationAccountId,
      hasIntegrationAccountFilter,
    });

    if (!groupResult.ok) {
      return NextResponse.json({ error: groupResult.error }, { status: groupResult.status });
    }

    const fileName = buildShipmentUploadExportFileName({
      format: parsedFormat,
      batchId: exportResult.body.batchId,
      provider:
        parsedFormat === 'csv'
          ? (groupResult.groups[0]?.provider ?? parsedProvider)
          : null,
    });

    if (parsedFormat === 'xlsx') {
      const buffer = buildShipmentUploadExportXlsxBuffer(groupResult.groups);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    const csvContent = buildShipmentUploadExportCsvContent(groupResult.groups);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadExport] failed:', errorMessage);
    return NextResponse.json(
      { error: '송장 업로드용 파일 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
