import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import { validateShipmentUploadMatchId } from '@/app/lib/order-integration/shipments/confirm-shipment-upload-match';
import {
  excludeShipmentUploadMatch,
  type ExcludeShipmentUploadMatchClient,
} from '@/app/lib/order-integration/shipments/exclude-shipment-upload-match';
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

async function parseExcludeReason(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    const body = (await request.json()) as { reason?: string };
    return body.reason?.trim() || null;
  } catch {
    return null;
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

    const reason = await parseExcludeReason(request);

    const result = await excludeShipmentUploadMatch(
      prisma as unknown as ExcludeShipmentUploadMatchClient,
      {
        userId,
        batchId: validatedBatchId,
        matchId: validatedMatchId,
        reason,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentUploadMatchExclude] failed:', errorMessage);
    return NextResponse.json(
      { error: '매칭 제외 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
