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
import {
  buildNormalize29HeuristicFallbackRow,
  sanitizeNormalize29Order,
  enrichNormalizedOrderWithHeuristicLine,
  tryHeuristicSplitOneLineKoreanOrder,
} from '@/app/lib/heuristic-korean-order-line';
import {
  BASE_HEADERS,
  BASE_HEADER_COUNT,
  CORE_BASE_HEADER_COUNT,
  buildNormalize29OrdersJsonExample,
} from '@/app/pipeline/base/base-headers';

/** 클라이언트가 text 또는 originalText만 보내는 경우 모두 수용 */
function resolveNormalize29InboundText(body: Record<string, unknown>): string {
  const t = body.text;
  const o = body.originalText;
  if (typeof t === 'string' && t.trim() !== '') return t;
  if (typeof o === 'string' && o.trim() !== '') return o;
  return '';
}

/**
 * AI가 원문 전체를 받는사람주소1·상품명에 동일하게 넣은 경우 → 휴리스틱 분리 또는 내부메모로만 보관
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
    const h = tryHeuristicSplitOneLineKoreanOrder(u);
    if (h) {
      return {
        ...order,
        받는사람: h.받는사람,
        받는사람전화1: h.받는사람전화1,
        받는사람주소1: h.받는사람주소1,
        상품명: h.품명,
      };
    }
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
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type } = body;

    // AI 활성화 여부 확인
    if (process.env.NEXT_PUBLIC_AI_ENABLED !== 'true') {
      // AI 비활성화여도 normalize-29는 최소 1건 fallback을 반환
      if (type === 'normalize-29') {
        const fallbackText = resolveNormalize29InboundText(body);
        return NextResponse.json({
          orders: [sanitizeNormalize29Order(buildNormalize29HeuristicFallbackRow(fallbackText))],
          meta: {
            usedFallback: true,
            fallbackReason: 'ai_disabled',
          },
        });
      }
      return NextResponse.json({ error: '현재 분석 기능을 사용할 수 없습니다.' }, { status: 400 });
    }

    // 환경변수 확인 (normalize-29만 키 없을 때 휴리스틱 fallback으로 200 — 나머지 타입은 500)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (type === 'normalize-29') {
        const fallbackText = resolveNormalize29InboundText(body);
        return NextResponse.json({
          orders: [sanitizeNormalize29Order(buildNormalize29HeuristicFallbackRow(fallbackText))],
          meta: {
            usedFallback: true,
            fallbackReason: 'no_openai_api_key',
          },
        });
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

  let fallbackReason: 'none' | 'json_parse_failed' | 'empty_orders' = 'none';

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

  const normalizeOrderObject = (order: Record<string, any>): Record<string, string> => {
    const normalized: Record<string, string> = {};
    for (const header of BASE_HEADERS) {
      const value = order?.[header];
      normalized[header] = value == null ? '' : String(value).trim();
    }
    if (!normalized['수량']) {
      normalized['수량'] = '1';
    }
    return normalized;
  };

  const ordersJsonExample = buildNormalize29OrdersJsonExample();

  const auxiliaryCount = BASE_HEADER_COUNT - CORE_BASE_HEADER_COUNT;

  const systemPrompt = `
너는 한국어 주문 텍스트를 기준헤더 JSON으로 변환하는 파서다.
전체 필드는 총 ${BASE_HEADER_COUNT}개이며(코어 ${CORE_BASE_HEADER_COUNT} / 확장 ${auxiliaryCount}),
반드시 JSON 객체 1개만 반환한다. 설명/코드블록/주석 금지.

[출력 형식 — 키 이름·개수는 아래 예시와 정확히 일치]
${ordersJsonExample}

[절대 규칙]
1) 모든 필드를 반드시 포함한다.
2) null/undefined/숫자형 금지. 모든 값은 문자열.
3) 모르면 "" 사용.
4) orders는 최소 1개 이상(빈 배열 금지).
5) 원문에 없는 정보 생성 금지.

[우선 추출 대상 (일반 주문 텍스트)]
- 받는사람, 받는사람전화1, 받는사람주소1/2, 주문자, 주문자연락처
- 상품명, 상품옵션, 상품옵션1, 수량
- 배송메시지, 주문일시
- 결제금액 (원문에 금액 라벨이 명확할 때)

[핵심 추출 규칙]
A. 수취인/주소
- "수취인/받는분/이름" 계열 → 받는사람
- "연락처/휴대폰/전화번호" 계열 → 받는사람전화1
- 가장 긴 상세 주소를 받는사람주소1에 넣고, 동/호 등만 명확하면 받는사람주소2 사용.

B. 상품/옵션/수량
- 상품명에 주소/전화/배송요청 문구를 넣지 말 것.
- 무게·용량·규격 단위(kg, g, L, ml 등)가 품명에 붙은 판매 단위면 상품명에 통째로 둔다.
- 색상/사이즈/맛/모델명 등 선택 속성은 상품옵션(필요 시 상품옵션1).
- 수량 미기재 시 "1".
- 여러 품목은 "/"로 같은 순서로 정렬(상품명/옵션/수량 모두 일관성 유지).

C. 배송메시지
- "문앞/부재시/경비실/요청사항/배송요청" 계열 문구를 배송메시지에 넣는다.
- 단순 채널 메타(예: 앱명/플랫폼 표식)처럼 보이면 배송메시지 대신 빈 값 우선.

D. 결제/운임 분리 (중요)
- 결제구분: 신용카드/가상계좌/포인트/후불 등 결제수단·결제형태.
- 운임구분: 선불/착불/지불조건 등 택배 운임 지불 방식.
- 주문배송비: 주문서/쇼핑몰에 표시된 배송비 금액.
- 운임: 실제 물류·택배 계약 운임.
- 위 네 필드는 서로 대체하지 말 것. 불명확하면 "".

E. 확장 필드 보수 추출 (매우 중요)
- 아래 계열은 라벨/키워드가 명확할 때만 채운다. 아니면 반드시 "".
  - 주문 상태·식별자: 주문상태, 상품주문번호, 제휴주문번호, 관리상품번호, 판매상품번호, 주문ID
  - 할인/정산: 판매자할인, 지원할인, 쿠폰명, 쿠폰할인, 포인트, 결제구분
  - 배송 확장: 택배사, 택배사코드, 출고발송일, 배송완료일, 구매확정일자, 배송첨부파일
  - 물류 보조: 상품코드, 옵션코드, 센터코드, 박스수량, 출고타입, 출고요청일, 출고지시사항
- 라벨 없는 숫자/코드만 덩그러니 있으면 어떤 확장 필드에도 억지로 넣지 않는다.

[주문 분리 규칙]
- 이름+전화+주소 세트가 반복되거나 주소가 바뀌면 새 주문으로 분리.
- 애매하면 1건으로 두되 필드 오염(주소를 상품명에 넣기 등) 금지.

[정리 규칙]
- 전화번호는 가능한 원문 형태 유지(예: 010-1234-5678).
- 라벨 문자(예: "이름:", "주소:") 제거 후 공백 정리.
`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0,
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
        { error: '텍스트 분석에 실패했습니다.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const aiText = data?.choices?.[0]?.message?.content || '{}';
    console.log('[AI RAW RESPONSE]', aiText);

    let parsed;
    try {
      const cleaned = stripCodeFence(aiText);
      parsed = JSON.parse(cleaned);
    } catch {
      try {
        const extracted = extractJsonObject(stripCodeFence(aiText));
        parsed = JSON.parse(extracted);
      } catch {
        parsed = { orders: [] };
        fallbackReason = 'json_parse_failed';
      }
    }

    let orders = Array.isArray(parsed?.orders) ? parsed.orders : [];
    orders = orders
      .filter((order: any) => order && typeof order === 'object' && !Array.isArray(order))
      .map((order: Record<string, any>) => normalizeOrderObject(order))
      .map((order: Record<string, string>) => collapseDuplicateFullLineDump(order, text))
      .map((order: Record<string, string>) => enrichNormalizedOrderWithHeuristicLine(order, text));

    if (!Array.isArray(orders) || orders.length === 0) {
      console.warn('[FALLBACK - NORMALIZE29] orders 비어있음 → 휴리스틱 fallback 행 생성');
      if (fallbackReason === 'none') {
        fallbackReason = 'empty_orders';
      }

      orders = [normalizeOrderObject(buildNormalize29HeuristicFallbackRow(text))];
    }

    console.log('[PARSED ORDERS]', orders);
    console.log('[PARSED ORDERS LENGTH]', orders.length);
    console.log('[FINAL RETURN ORDERS]', orders);
    console.log('[NORMALIZE29 META]', {
      usedFallback: fallbackReason !== 'none',
      fallbackReason,
    });

    return NextResponse.json({
      orders,
      meta: {
        usedFallback: fallbackReason !== 'none',
        fallbackReason,
      },
    });
  } catch (error) {
    console.error('[AI Gateway] normalize-29 error:', error);
    return NextResponse.json(
      { error: 'normalize-29 failed' },
      { status: 500 }
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

    // OpenAI 응답 로그 출력
    console.log('[AI Gateway] header-map OpenAI Raw Response:', {
      content,
      contentLength: content.length,
      contentType: typeof content,
    });

    // JSON 파싱
    let mappingResult: Record<string, string>;
    try {
      mappingResult = JSON.parse(content);
      console.log('[AI Gateway] header-map Parsed JSON:', mappingResult);
    } catch (parseError) {
      console.error('[AI Gateway] header-map JSON 파싱 실패:', parseError);
      console.error('[AI Gateway] header-map Raw Content:', content);
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

    // 검증 결과 로그 출력
    console.log('[AI Gateway] header-map Validation Result:', {
      totalMappings: Object.keys(mappingResult).length,
      validMappings: Object.keys(validMapping).length,
      invalidMappings: invalidHeaders.length,
      invalidHeaders,
      validMapping,
    });

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
