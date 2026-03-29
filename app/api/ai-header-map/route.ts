/**
 * EXCLOAD AI 헤더 매핑 API Route
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage1 Template Pipeline 전용
 * 
 * POST /api/ai-header-map
 * body: { unknownHeaders: string[] }
 * 
 * 매핑 실패한 헤더를 AI에게 전달하여 기준헤더로 매핑합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callOpenAI } from '@/app/lib/ai/openai-client';
import { BASE_HEADERS, BASE_HEADER_COUNT } from '@/app/pipeline/base/base-headers';

/**
 * API Route Handler
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { unknownHeaders } = body;
    
    if (!Array.isArray(unknownHeaders) || unknownHeaders.length === 0) {
      return NextResponse.json(
        { error: 'unknownHeaders는 비어있지 않은 배열이어야 합니다.' },
        { status: 400 }
      );
    }
    
    // BaseHeaderKey 목록을 system prompt에 포함
    const baseHeaderList = BASE_HEADERS.join(', ');
    
    const prompt = `다음 택배사 헤더들을 한글 기준헤더로 매핑하세요.

**기준헤더 목록 (${BASE_HEADER_COUNT}개):**
${baseHeaderList}

**매핑할 헤더:**
${unknownHeaders.join(', ')}

**응답 형식 (JSON):**
{
  "헤더명1": "한글기준헤더1",
  "헤더명2": "한글기준헤더2",
  ...
}

**규칙:**
1. 각 헤더를 가장 적합한 한글 기준헤더로 매핑하세요.
2. 매핑이 불가능한 헤더는 제외하세요.
3. JSON 형식으로만 응답하세요.
4. 기준헤더는 정확히 일치해야 합니다.`;

    const aiResponse = await callOpenAI(prompt);
    
    // JSON 파싱
    let mappingResult: Record<string, string>;
    try {
      mappingResult = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('[AI 헤더 매핑] JSON 파싱 실패:', parseError);
      return NextResponse.json(
        { error: '헤더 매핑 결과를 처리할 수 없습니다.' },
        { status: 500 }
      );
    }
    
    // 응답 검증: 모든 값이 유효한 한글 기준헤더인지 확인
    const validMapping: Record<string, string> = {};
    for (const [header, baseHeader] of Object.entries(mappingResult)) {
      if (typeof baseHeader === 'string' && BASE_HEADERS.includes(baseHeader as any)) {
        validMapping[header] = baseHeader;
      }
    }
    
    return NextResponse.json(validMapping);
  } catch (error) {
    console.error('[AI 헤더 매핑] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
