import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import { toSafeShipmentMatchLogMessage } from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import { validateShipmentUploadBatchId } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import {
  runShipmentTransmissionDryRun,
  type RunShipmentTransmissionDryRunClient,
} from '@/app/lib/order-integration/transmission/dry-run';
import { parseTransmitDryRunBody } from '@/app/lib/order-integration/transmission/parse-transmit-dry-run-body';
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

async function readOptionalJsonBody(request: Request): Promise<
  | { ok: true; raw: unknown }
  | { ok: false; error: string }
> {
  const contentLength = request.headers.get('content-length');
  if (contentLength === '0') {
    return { ok: true, raw: null };
  }

  const text = await request.text();
  if (!text.trim()) {
    return { ok: true, raw: null };
  }

  try {
    return { ok: true, raw: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: '요청 본문 JSON을 파싱할 수 없습니다.' };
  }
}

/**
 * POST /api/order/integration/shipments/uploads/[batchId]/transmit/dry-run
 * Read-only eligibility + candidate preview. No DB writes / external transmit.
 */
export async function POST(
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

    const bodyRead = await readOptionalJsonBody(request);
    if (!bodyRead.ok) {
      return NextResponse.json({ error: bodyRead.error }, { status: 400 });
    }

    const parsed = parseTransmitDryRunBody(bodyRead.raw);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await runShipmentTransmissionDryRun(
      prisma as unknown as RunShipmentTransmissionDryRunClient,
      {
        userId,
        batchId: validatedBatchId,
        matchIds: parsed.body.matchIds,
        retryFailed: parsed.body.retryFailed,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    const errorMessage = toSafeShipmentMatchLogMessage(error);
    console.error('[ShipmentTransmissionDryRun] failed:', errorMessage);
    return NextResponse.json(
      { error: '송장전송 dry-run 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
