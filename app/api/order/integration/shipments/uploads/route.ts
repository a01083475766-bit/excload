import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

import {
  parseShipmentMatchUploadScope,
  toSafeShipmentMatchLogMessage,
} from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { uploadAndPersistShipmentFile } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';
import type { ShipmentUploadPersistPrismaClient } from '@/app/lib/order-integration/shipments/persist-shipment-upload-batch';
import { prisma } from '@/app/lib/prisma';


export async function POST(request: Request) {
  try {
    const auth = await requireOrderIntegrationUser();
    if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;
    const userId = auth.userId;

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: '업로드할 송장 파일이 필요합니다.' }, { status: 400 });
    }

    const scopeResult = parseShipmentMatchUploadScope({
      userId,
      provider: formData.get('provider')?.toString() ?? null,
      integrationAccountId: formData.get('integrationAccountId')?.toString() ?? null,
      batchId: formData.get('batchId')?.toString() ?? null,
      allowedProviders: Object.values(OrderIntegrationProvider),
    });

    if ('error' in scopeResult) {
      return NextResponse.json({ error: scopeResult.error }, { status: 400 });
    }

    const fileHash = formData.get('fileHash')?.toString()?.trim() || null;
    const downloadBundleRaw = formData.get('downloadBundleId')?.toString()?.trim() || '';
    // 빈 문자열 / none / null → 해당 다운로드 없음
    const downloadBundleId =
      !downloadBundleRaw || downloadBundleRaw === 'none' || downloadBundleRaw === 'null'
        ? null
        : downloadBundleRaw;

    if (downloadBundleId) {
      const bundle = await prisma.courierDownloadBundle.findFirst({
        where: {
          id: downloadBundleId,
          userId,
          expiresAt: { gte: new Date() },
        },
        select: { id: true },
      });
      if (!bundle) {
        return NextResponse.json(
          { error: '선택한 택배양식 다운로드 기록을 찾을 수 없거나 만료되었습니다.' },
          { status: 400 },
        );
      }
    }

    const buffer = await fileEntry.arrayBuffer();
    const result = await uploadAndPersistShipmentFile({
      file: {
        name: fileEntry.name,
        type: fileEntry.type,
        size: fileEntry.size,
        buffer,
      },
      scope: scopeResult,
      snapshotClient: prisma,
      persistClient: prisma as unknown as ShipmentUploadPersistPrismaClient,
      fileHash,
      downloadBundleId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadPersist] failed:', errorMessage);
    return NextResponse.json(
      { error: '송장 업로드 저장 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
