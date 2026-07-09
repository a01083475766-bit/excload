import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import { validateShipmentUploadMatchId } from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import {
  linkShipmentUploadMatch,
  validateShipmentMatchLinkOrderSyncOrderId,
  type LinkShipmentUploadMatchClient,
} from '@/app/lib/order-integration/shipments/link-shipment-upload-match';
import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
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

async function parseLinkRequestBody(
  request: Request,
): Promise<{ orderSyncOrderId: string } | { error: string }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { error: 'orderSyncOrderId가 필요합니다.' };
  }

  try {
    const body = (await request.json()) as { orderSyncOrderId?: string };
    const validated = validateShipmentMatchLinkOrderSyncOrderId(body.orderSyncOrderId);
    if (typeof validated !== 'string') {
      return { error: validated.error };
    }
    return { orderSyncOrderId: validated };
  } catch {
    return { error: 'orderSyncOrderId가 필요합니다.' };
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string; matchId: string }> },
) {
  try {
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { batchId, matchId } = await params;
    const validatedBatchId = validateShipmentUploadBatchId(batchId);
    if (typeof validatedBatchId !== 'string') {
      return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
    }

    const validatedMatchId = validateShipmentUploadMatchId(matchId);
    if (typeof validatedMatchId !== 'string') {
      return NextResponse.json({ error: validatedMatchId.error }, { status: 400 });
    }

    const parsedBody = await parseLinkRequestBody(request);
    if ('error' in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    }

    const result = await linkShipmentUploadMatch(
      prisma as unknown as LinkShipmentUploadMatchClient,
      {
        userId,
        batchId: validatedBatchId,
        matchId: validatedMatchId,
        orderSyncOrderId: parsedBody.orderSyncOrderId,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadMatchLink] failed:', errorMessage);
    return NextResponse.json(
      { error: '매칭 수동 연결 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
