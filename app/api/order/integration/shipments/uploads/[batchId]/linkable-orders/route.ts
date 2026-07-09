import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import {
  loadLinkableOrdersForShipmentUploadBatch,
  parseLinkableOrdersLimit,
  parseLinkableOrdersQuery,
  validateLinkableOrdersBatchId,
  type LinkableOrdersLoadClient,
} from '@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch';
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
    const validatedBatchId = validateLinkableOrdersBatchId(batchId);
    if (typeof validatedBatchId !== 'string') {
      return NextResponse.json({ error: validatedBatchId.error }, { status: 400 });
    }

    const url = new URL(request.url);
    const parsedLimit = parseLinkableOrdersLimit(url.searchParams.get('limit'));
    if (typeof parsedLimit !== 'number') {
      return NextResponse.json({ error: parsedLimit.error }, { status: 400 });
    }

    const q = parseLinkableOrdersQuery(url.searchParams.get('q'));

    const result = await loadLinkableOrdersForShipmentUploadBatch(
      prisma as unknown as LinkableOrdersLoadClient,
      {
        userId,
        batchId: validatedBatchId,
        q,
        limit: parsedLimit,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadLinkableOrders] failed:', errorMessage);
    return NextResponse.json(
      { error: '연결 가능한 주문 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
