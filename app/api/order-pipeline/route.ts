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
import { run as runOrderPipeline } from '@/app/pipeline/order/order-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';

/**
 * API Route Handler
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileSessionId, ...cleanInputFile } = body;
    
    // CleanInputFile 검증
    if (!cleanInputFile || !Array.isArray(cleanInputFile.headers) || !Array.isArray(cleanInputFile.rows)) {
      return NextResponse.json(
        { error: 'CleanInputFile 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }
    
    // Stage2 Order Pipeline 실행
    const result = await runOrderPipeline(cleanInputFile as CleanInputFile, fileSessionId);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Order Pipeline API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
