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
import { authOptions } from '@/app/lib/auth';
import { run as runOrderPipeline } from '@/app/pipeline/order/order-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';
import { isExcloudPipelineDebugServer } from '@/app/lib/excloud-pipeline-debug';

/**
 * API Route Handler
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const referer = request.headers.get('referer') || '';
    const trialHeader = request.headers.get('x-excload-trial');
    const isTrialReferer =
      referer.includes('/trial') ||
      referer.includes('/excload') ||
      /https?:\/\/[^/]+\/?(?:\?|#|$)/.test(referer);
    const allowAnonymousTrial = trialHeader === '1' || isTrialReferer;

    if (!session && !allowAnonymousTrial) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const prompt = (body as { prompt?: string | null })?.prompt;
    const { fileSessionId, ...cleanInputFile } = body;
    
    // CleanInputFile 검증
    if (!cleanInputFile || !Array.isArray(cleanInputFile.headers) || !Array.isArray(cleanInputFile.rows)) {
      return NextResponse.json(
        { error: 'CleanInputFile 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }
    
    console.log('[Stage2 INPUT]', {
      prompt,
      type: typeof prompt,
      length: prompt?.length,
    });

    // Stage2 Order Pipeline 실행
    let result;
    try {
      result = await runOrderPipeline(cleanInputFile as CleanInputFile, fileSessionId);
    } catch (error) {
      console.error('[Stage2 ERROR FULL]', error);
      throw error;
    }

    console.log('[Stage2 OUTPUT]', result);

    if (isExcloudPipelineDebugServer() && result?.rows?.length) {
      const row0 = result.rows[0] as Record<string, string>;
      console.log('[EXCLOUD DEBUG ② 서버] Stage2 rows[0] — 핵심 기준헤더', {
        받는사람: row0['받는사람'],
        받는사람전화1: row0['받는사람전화1'],
        받는사람전화2: row0['받는사람전화2'],
        받는사람우편번호: row0['받는사람우편번호'],
        받는사람주소1: row0['받는사람주소1'],
        받는사람주소2: row0['받는사람주소2'],
        상품명: row0['상품명'],
        수량: row0['수량'],
      });
      console.log('[EXCLOUD DEBUG ② 서버] Stage2 rows[0] — 전체(JSON)', JSON.stringify(row0, null, 2));
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
