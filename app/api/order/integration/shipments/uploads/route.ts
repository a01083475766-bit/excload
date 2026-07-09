import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import {
  parseShipmentMatchUploadScope,
  toSafeShipmentMatchLogMessage,
} from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { uploadAndPersistShipmentFile } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';
import type { ShipmentUploadPersistPrismaClient } from '@/app/lib/order-integration/shipments/persist-shipment-upload-batch';
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

export async function POST(request: Request) {
  try {
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

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
