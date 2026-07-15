import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';

import {
  matchUploadedShipmentFile,
  parseShipmentMatchUploadScope,
  toSafeShipmentMatchLogMessage,
} from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
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

    const buffer = await fileEntry.arrayBuffer();
    const result = await matchUploadedShipmentFile({
      file: {
        name: fileEntry.name,
        type: fileEntry.type,
        size: fileEntry.size,
        buffer,
      },
      scope: scopeResult,
      client: prisma,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentMatchUpload] failed:', errorMessage);
    return NextResponse.json(
      { error: '송장 매칭 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
