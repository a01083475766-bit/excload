/**
 * EXCLOAD AI Gateway API Route
 * 
 * ⚠️ CONSTITUTION.md v4.2 준수
 * 모든 AI 호출의 단일 통로
 * 
 * POST /api/ai-gateway
 * body: { type: 'normalize-29' | 'header-map' | 'extract' | 'ocr', ... }
 * 
 * 모든 AI 호출은 이 게이트웨이를 통해서만 실행됩니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { normalizeNormalize29Order } from '@/app/lib/normalize-29/normalize-order-object';
import {
  BASE_HEADERS,
} from '@/app/pipeline/base/base-headers';
import { isExcloudPipelineDebugServer } from '@/app/lib/excloud-pipeline-debug';
import { buildNormalize29SystemPrompt } from '@/app/lib/normalize-29/prompts';
import { getNormalize29AiCallParams } from '@/app/lib/normalize-29/ai-call-params';

const enableAIDebugLog = process.env.AI_DEBUG_LOG === 'true';

/** AI normalize-29: 대량 건·긴 응답 대기 (플랫폼 한도 내) */
export const maxDuration = 300;
export const runtime = 'nodejs';

/** 클라이언트가 text 또는 originalText만 보내는 경우 모두 수용 */
function resolveNormalize29InboundText(body: Record<string, unknown>): string {
  const t = body.text;
  const o = body.originalText;
  if (typeof t === 'string' && t.trim() !== '') return t;
  if (typeof o === 'string' && o.trim() !== '') return o;
  return '';
}

/**
 * AI가 원문 전체를 받는사람주소1·상품명에 동일하게 넣은 경우 → 내부메모로만 보관
 * (휴리스틱 분리는 서버 fallback 전용 — 정상 AI 응답 후처리에서는 사용하지 않음)
 */
function collapseDuplicateFullLineDump(
  order: Record<string, string>,
  userText: string
): Record<string, string> {
  const u = userText.trim();
  if (!u || u.length < 8) return order;
  const a = (order['받는사람주소1'] || '').trim();
  const p = (order['상품명'] || '').trim();
  if (a === p && a === u) {
    const prevMemo = (order['내부메모'] || '').trim();
    return {
      ...order,
      받는사람주소1: '',
      상품명: '',
      내부메모: prevMemo ? `${prevMemo} | 주소·상품 중복 원문: ${u}` : `주소·상품 중복 원문: ${u}`,
    };
  }
  return order;
}

/**
 * AI Gateway 요청 타입
 */
type AIGatewayRequest = 
  | { type: 'normalize-29'; text?: string; originalText?: string; engineHint?: unknown }
  | { type: 'header-map'; unknownHeaders: string[]; baseHeaders: readonly string[] }
  | { type: 'extract'; originalText: string; remainingText: string; engineConfirmed: boolean; hints: any }
  | { type: 'ocr'; image: string }
  | { type: 'normalize'; originalText: string; engineHint: Record<string, any> };

/**
 * AI Gateway API Route Handler
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type } = body;
    const session = await getServerSession(authOptions);
    const trialHeader = request.headers.get('x-excload-trial');
    const isTrialRequest = trialHeader === '1';
    const allowAnonymousTrialTypes = new Set([
      'normalize-29',
      'header-map',
      'extract',
      'normalize',
    ]);
    const allowAnonymousTrialByEnv = process.env.AI_ALLOW_ANONYMOUS_TRIAL === 'true';
    const allowAnonymousTrial =
      allowAnonymousTrialByEnv &&
      isTrialRequest &&
      typeof type === 'string' &&
      allowAnonymousTrialTypes.has(type);

    if (!session && !allowAnonymousTrial) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session && allowAnonymousTrial && enableAIDebugLog) {
      console.log('[AI Gateway] trial anonymous request allowed:', { type });
    }

    // AI 활성화 여부 확인
    if (process.env.NEXT_PUBLIC_AI_ENABLED !== 'true') {
      if (type === 'normalize-29') {
        return NextResponse.json(
          {
            error: '현재 분석 기능을 사용할 수 없습니다.',
            errorCode: 'AI_UNAVAILABLE',
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: '현재 분석 기능을 사용할 수 없습니다.' }, { status: 400 });
    }

    // 환경변수 확인
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (type === 'normalize-29') {
        return NextResponse.json(
          {
            error: '시스템 설정 오류가 발생했습니다.',
            errorCode: 'AI_UNAVAILABLE',
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: '시스템 설정 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 타입별 라우팅
    switch (type) {
      case 'normalize-29':
        return await handleNormalize29(body, apiKey);
      case 'header-map':
        return await handleHeaderMap(body, apiKey);
      case 'extract':
        return await handleExtract(body, apiKey);
      case 'normalize':
        return await handleNormalize(body, apiKey);
      case 'ocr':
        return await handleOCR(body, apiKey);
      default:
        return NextResponse.json(
          { error: '지원하지 않는 요청 유형입니다.' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[AI Gateway] Error:', error);
    return NextResponse.json(
      { error: '시스템 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * normalize-29 핸들러
 * 텍스트 주문 변환: 텍스트를 기준헤더(BASE_HEADERS) 구조의 orders 배열로 변환
 * - 원문 우선, 불확실 값은 빈 문자열 유지
 * - 확장/정산/식별자 계열은 라벨 기반 보수 추출
 *
 * ⚠️ 헌법 준수: 서버 내부에서 직접 import하여 호출 가능하도록 export
 */
export async function handleNormalize29(
  body: Record<string, unknown>,
  apiKey: string
): Promise<NextResponse> {
  const text = resolveNormalize29InboundText(body);
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const stripCodeFence = (input: string) =>
    input
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

  const extractJsonObject = (input: string): string => {
    const first = input.indexOf('{');
    const last = input.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return input.slice(first, last + 1);
    }
    return input;
  };

  const normalizeOrderObject = normalizeNormalize29Order;
  const systemPrompt = buildNormalize29SystemPrompt();
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const { maxTokens } = getNormalize29AiCallParams();

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Gateway] normalize-29 API error:', {
        status: response.status,
        errorText,
      });
      return NextResponse.json(
        {
          error: '텍스트 분석에 실패했습니다.',
          errorCode: 'AI_API_ERROR',
        },
        { status: 500 },
      );
    }

    const data = await response.json();
    const aiText = data?.choices?.[0]?.message?.content || '{}';
    if (isExcloudPipelineDebugServer() && enableAIDebugLog) {
      console.log('[AI Gateway] normalize-29 raw response received');
    }

    let parsed: { orders?: unknown };
    try {
      parsed = JSON.parse(stripCodeFence(aiText));
    } catch {
      try {
        parsed = JSON.parse(extractJsonObject(stripCodeFence(aiText)));
      } catch {
        console.warn('[AI Gateway] normalize-29 JSON parse failed');
        return NextResponse.json(
          {
            error: '텍스트 분석 결과를 읽지 못했습니다.',
            errorCode: 'AI_PARSE_FAILED',
          },
          { status: 502 },
        );
      }
    }

    let orders = Array.isArray(parsed?.orders) ? parsed.orders : [];
    orders = orders
      .filter((order: unknown) => order && typeof order === 'object' && !Array.isArray(order))
      .map((order: Record<string, unknown>) => normalizeOrderObject(order))
      .map((order: Record<string, string>) => collapseDuplicateFullLineDump(order, text));

    if (!Array.isArray(orders) || orders.length === 0) {
      console.warn('[AI Gateway] normalize-29 empty orders');
      return NextResponse.json(
        {
          error: '주문 정보를 추출하지 못했습니다.',
          errorCode: 'AI_EMPTY_ORDERS',
        },
        { status: 502 },
      );
    }

    if (enableAIDebugLog) {
      console.log('[AI Gateway] normalize-29 summary', {
        ordersCount: orders.length,
        promptProfile: 'parcel',
      });
    }

    return NextResponse.json({
      orders,
      meta: {
        usedFallback: false,
        promptProfile: 'parcel',
      },
    });
  } catch (error) {
    console.error('[AI Gateway] normalize-29 error:', error);
    return NextResponse.json(
      {
        error: 'normalize-29 failed',
        errorCode: 'AI_API_ERROR',
      },
      { status: 500 },
    );
  }
}

/**
 * header-map 핸들러
 * 헤더 매핑: unknownHeaders를 baseHeaders로 매핑
 * 
 * ⚠️ 헌법 준수: 서버 내부에서 직접 import하여 호출 가능하도록 export
 */
export async function handleHeaderMap(
  body: { type: 'header-map'; unknownHeaders: string[]; baseHeaders: readonly string[] },
  apiKey: string
): Promise<NextResponse> {
  const { unknownHeaders, baseHeaders } = body;
  
  if (!Array.isArray(unknownHeaders) || unknownHeaders.length === 0) {
  return NextResponse.json(
      { error: 'unknownHeaders는 비어있지 않은 배열이어야 합니다.' },
      { status: 400 }
    );
  }
  
  // BaseHeaderKey 목록을 system prompt에 포함
  const baseHeaderList = baseHeaders.join(', ');
  
  const prompt = `다음 택배사 헤더들을 한글 기준헤더로 매핑하세요.

**기준헤더 목록 (${baseHeaders.length}개):**
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

  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `당신은 주문/물류 템플릿 헤더를 시스템 기준헤더(BASE_HEADERS)로 매핑하는 전문가입니다.

입력은 "매핑 실패한 원본 헤더(unknownHeaders)" 입니다.
목표는 각 원본 헤더를 BASE_HEADERS 중 가장 적합한 하나로 매핑하는 것입니다.

[절대 규칙]
1) BASE_HEADERS 목록에 있는 값만 반환한다. 새 헤더 생성 금지.
2) 응답은 JSON 객체만 반환한다. 설명/주석/코드블록 금지.
3) 헤더 의미가 불명확하면 억지로 매핑하지 말고 해당 키를 결과에서 제외한다.
4) 동일한 원본 헤더는 항상 동일한 기준헤더로 매핑한다.
5) 라벨 의미 우선, 문자열 유사도는 보조로만 사용한다.

[의미 분리 규칙 - 매우 중요]
- 결제구분(신용카드/가상계좌/포인트 등) ≠ 운임구분(선불/착불).
- 주문배송비(주문서 표시 배송비) ≠ 운임(실제 계약 운임).
- 주문번호 ≠ 주문ID ≠ 상품주문번호/제휴주문번호.
- 택배사(이름) ≠ 택배사코드(숫자/코드).
- 배송메시지(고객 요청) ≠ 출고지시사항(창고/피킹 지시).

[우선 매핑 힌트]
- 수취인/받는분/수령인/고객명 -> 받는사람
- 연락처/휴대폰/핸드폰/전화번호 -> 받는사람전화1 (특별한 구분 없으면 전화1 우선)
- 배송지/수령지/주소 -> 받는사람주소1
- 우편번호/ZIP/postcode -> 받는사람우편번호
- 송장번호/운송장/tracking -> 운송장번호
- 배송업체/배송사/택배회사 -> 택배사
- 배송사코드/carrier code -> 택배사코드
- 주문금액/총액/실결제 -> 결제금액
- 배송비 -> 주문배송비
- 배송비구분 -> 주문배송비구분
- 선불/착불/지불조건 -> 운임구분
- 앱표식/플랫폼 표식은 배송메시지로 보내지 말고 가능한 관련 식별자/판매처를 우선 판단

[주소/전화 보수 규칙]
- 주소2, 전화2는 원본 헤더에 2/상세/보조 의미가 명확할 때만 매핑한다.
- 불명확한 단일 "주소", "전화번호"는 주소1/전화1에 매핑한다.

[반환 형식 예시]
{
  "원본헤더A": "기준헤더A",
  "원본헤더B": "기준헤더B"
}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Gateway] header-map API error:', {
        status: response.status,
        errorText,
      });
      return NextResponse.json(
        { error: '헤더 매핑에 실패했습니다.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '{}';

    // JSON 파싱
    let mappingResult: Record<string, string>;
    try {
      mappingResult = JSON.parse(content);
      if (enableAIDebugLog) {
        console.log('[AI Gateway] header-map parsed', {
          mappedCount: Object.keys(mappingResult).length,
        });
      }
    } catch (parseError) {
      console.error('[AI Gateway] header-map JSON 파싱 실패:', parseError);
      return NextResponse.json(
        { error: '헤더 매핑 결과를 처리할 수 없습니다.' },
        { status: 500 }
  );
    }

    // 응답 검증: 모든 값이 유효한 한글 기준헤더인지 확인
    const validMapping: Record<string, string> = {};
    const invalidHeaders: Array<{ header: string; baseHeader: string; reason: string }> = [];
    
    for (const [header, baseHeader] of Object.entries(mappingResult)) {
      if (typeof baseHeader !== 'string') {
        invalidHeaders.push({ header, baseHeader: String(baseHeader), reason: 'not_string' });
        continue;
      }
      
      if (!baseHeaders.includes(baseHeader as any)) {
        invalidHeaders.push({ header, baseHeader, reason: 'not_in_baseHeaders' });
        continue;
      }
      
      validMapping[header] = baseHeader;
    }

    if (enableAIDebugLog) {
      console.log('[AI Gateway] header-map validation summary:', {
        totalMappings: Object.keys(mappingResult).length,
        validMappings: Object.keys(validMapping).length,
        invalidMappings: invalidHeaders.length,
      });
    }

    return NextResponse.json(validMapping);
  } catch (error) {
    console.error('[AI Gateway] header-map error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '헤더 매핑 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * extract 핸들러
 * 텍스트 추출: 상품/옵션/수량/요청 텍스트 추출
 */
async function handleExtract(
  body: { type: 'extract'; originalText: string; remainingText: string; engineConfirmed: boolean; hints: any },
  apiKey: string
): Promise<NextResponse> {
  // TODO: 기존 ai-extract 로직 통합
  return NextResponse.json(
    { error: 'extract not implemented yet' },
    { status: 501 }
  );
}

/**
 * normalize 핸들러
 * 엔티티 정규화: 이름, 전화번호, 주소, 상품 등 정규화
 */
async function handleNormalize(
  body: { type: 'normalize'; originalText: string; engineHint: Record<string, any> },
  apiKey: string
): Promise<NextResponse> {
  // TODO: 기존 ai-normalize 로직 통합
  return NextResponse.json(
    { error: 'normalize not implemented yet' },
    { status: 501 }
  );
}

/**
 * OCR 핸들러
 * 이미지 OCR: 이미지에서 텍스트 추출
 */
async function handleOCR(
  body: { type: 'ocr'; image: string },
  apiKey: string
): Promise<NextResponse> {
  // TODO: OCR 로직 구현
  return NextResponse.json(
    { error: 'ocr not implemented yet' },
    { status: 501 }
  );
}
