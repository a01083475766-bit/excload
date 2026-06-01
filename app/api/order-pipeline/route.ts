/**
 * EXCLOAD Order Pipeline API Route
 * 
 * ⚠️ CONSTITUTION.md v4.1 준수
 * Stage2 Order Pipeline 전용
 * 
 * POST /api/order-pipeline
 * body: CleanInputFile
 * 
 * 모든 주문 입력을 기준헤더로 통일합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createHash } from 'crypto';
import { authOptions } from '@/app/lib/auth';
import { checkOrderPipelineRateLimit } from '@/app/lib/api-rate-limit';
import { getClientIp } from '@/app/lib/client-ip';
import { serviceBlockedResponse } from '@/app/lib/user-access-guard';
import { run as runOrderPipeline } from '@/app/pipeline/order/order-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';
import type { MappingResult } from '@/app/pipeline/template/map-template-to-base';
import { isExcloudPipelineDebugServer } from '@/app/lib/excloud-pipeline-debug';
import { TRIAL_ACCESS_LIMITS_ENABLED } from '@/app/lib/trial-access';

function hashIp(ip: string): string {
  const salt = process.env.TRIAL_IP_SALT ?? 'excload-trial-ip-v1';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

async function allowAnonymousByTrialIpRecord(request: NextRequest): Promise<boolean> {
  if (!TRIAL_ACCESS_LIMITS_ENABLED) {
    return false;
  }

  try {
    const ip = getClientIp(request);
    const ipHash = hashIp(ip);
    const { prisma } = await import('@/app/lib/prisma');
    const row = await prisma.trialIpAccess.findUnique({
      where: { ipHash },
      select: { count: true },
    });
    return (row?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * API Route Handler
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const allowAnonymousTrial = await allowAnonymousByTrialIpRecord(request);
    const isTrialRequest = request.headers.get('x-excload-trial') === '1';

    if (!session && !allowAnonymousTrial && !isTrialRequest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const prompt = (body as { prompt?: string | null })?.prompt;
    const { fileSessionId, reuseHeaderMapping, ...cleanInputFile } = body as Record<string, unknown> & {
      fileSessionId?: string;
      reuseHeaderMapping?: unknown;
    };

    const isChunkFollowUp =
      reuseHeaderMapping !== undefined &&
      reuseHeaderMapping !== null &&
      typeof reuseHeaderMapping === 'object' &&
      !Array.isArray(reuseHeaderMapping);

    const rateLimited = checkOrderPipelineRateLimit(
      request,
      session?.user?.email ?? undefined,
      isChunkFollowUp ? 'chunkFollowUp' : 'full',
    );
    if (rateLimited) {
      return rateLimited;
    }

    if (session?.user?.email) {
      const { prisma } = await import('@/app/lib/prisma');
      const pipelineUser = await prisma.user.findUnique({
        where: { email: session.user.email.trim().toLowerCase() },
        select: {
          isBlocked: true,
          abuseFlag: true,
          blockReason: true,
        },
      });
      if (pipelineUser) {
        const blockedResponse = serviceBlockedResponse(pipelineUser);
        if (blockedResponse) return blockedResponse;
      }
    }

    // CleanInputFile 검증
    if (!cleanInputFile || !Array.isArray(cleanInputFile.headers) || !Array.isArray(cleanInputFile.rows)) {
      return NextResponse.json(
        { error: 'CleanInputFile 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    if (reuseHeaderMapping !== undefined && reuseHeaderMapping !== null) {
      const rh = reuseHeaderMapping as Partial<MappingResult>;
      const headers = cleanInputFile.headers as string[];
      if (
        !Array.isArray(rh.mappedBaseHeaders) ||
        !Array.isArray(rh.unknownHeaders) ||
        rh.mappedBaseHeaders.length !== headers.length
      ) {
        return NextResponse.json(
          {
            error:
              'reuseHeaderMapping이 올바르지 않거나 mappedBaseHeaders 길이가 headers와 일치하지 않습니다.',
          },
          { status: 400 },
        );
      }
    }
    
    if (isExcloudPipelineDebugServer()) {
      console.log('[Stage2 INPUT META]', {
        promptType: typeof prompt,
        promptLength: prompt?.length ?? 0,
        hasFileSessionId: Boolean(fileSessionId),
      });
    }

    // Stage2 Order Pipeline 실행
    let result;
    try {
      result = await runOrderPipeline(
        cleanInputFile as unknown as CleanInputFile,
        fileSessionId,
        reuseHeaderMapping
          ? { reuseHeaderMapping: reuseHeaderMapping as MappingResult }
          : undefined,
      );
    } catch (error) {
      console.error('[Stage2 ERROR]');
      throw error;
    }

    if (isExcloudPipelineDebugServer()) {
      console.log('[Stage2 OUTPUT META]', {
        rowCount: Array.isArray(result?.rows) ? result.rows.length : 0,
        baseHeaderCount: Array.isArray(result?.baseHeaders) ? result.baseHeaders.length : 0,
        unknownHeaderCount: Array.isArray(result?.unknownHeaders) ? result.unknownHeaders.length : 0,
      });
    }

    if (isExcloudPipelineDebugServer() && result?.rows?.length) {
      console.log('[EXCLOUD DEBUG ② 서버] Stage2 rows[0] 존재', {
        rowCount: result.rows.length,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Order Pipeline API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
