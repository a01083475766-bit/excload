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
 * — 코어 29필드는 일반 추출, 물류 보조 9필드는 원문에 라벨·명확한 표현이 있을 때만 채움(프롬프트 [F]).
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
필드는 **코어 ${CORE_BASE_HEADER_COUNT}개(주문·배송·상품 본문)** + **물류 보조 ${auxiliaryCount}개** = 총 ${BASE_HEADER_COUNT}개다. JSON 키는 모두 포함하되, **보조 필드는 아래 [F] 규칙을 지킨다.**
반드시 JSON 객체 1개만 반환한다. 설명/코드블록/주석 금지.

[출력 형식 — 키 이름·개수는 아래 예시와 정확히 일치]
${ordersJsonExample}

[절대 규칙]
1) 모든 필드를 반드시 포함한다.
2) null/undefined/숫자형 금지. 모든 값은 문자열.
3) 모르면 "" 사용.
4) orders는 최소 1개 이상(빈 배열 금지).

[핵심 추출 규칙]
A. 받는사람/전화/주소
- "수취인/받는분/이름" 계열 → 받는사람
- "연락처/휴대폰/전화번호" 계열 → 받는사람전화1
- 가장 긴 상세 주소를 받는사람주소1에 넣는다.
- 동/호/상세호수만 명확히 분리 가능할 때만 받는사람주소2 사용.

B. 상품/옵션/수량 (같은 입력이면 항상 같은 칸에 넣을 것 — 여기서 왔다 갔다 하면 안 됨)
- 상품명: 주소·전화·배송요청 문구는 절대 넣지 말 것.
- **무게·용량·규격 단위가 품명에 붙은 판매 단위**이면 **상품명에 통째로** 둔다. **상품옵션으로 쪼개지 말 것.**
  - 단위 예: kg, g, mg, t, L, mL, cc, ml, 등(원문 표기 유지).
  - 예: "소금2kg" → 상품명="소금2kg", 상품옵션="", 수량="1"
  - 예: "사과 1kg" / "사과1kg" → 상품명="사과1kg" 또는 "사과 1kg"(원문에 가깝게), 상품옵션="", 수량="1"
  - 예: "물500ml" → 상품명="물500ml", 수량="1"
- **색상·맛·향·모델명·사이즈(의류·신발 등)** 같이 **고르는 속성**은 상품옵션으로 둔다(단, 위 무게·용량 판매 단위 규칙과 겹치면 **판매 단위 규칙 우선**).
  예: "무선 블랙 마우스" → 상품명="무선 마우스", 상품옵션="블랙"
- **한 상품**에 서로 다른 고르는 옵션이 2개면 상품옵션, 상품옵션1에 순서대로.
- **수량**: 원문에 "2개/3세트/수량:5" 등 **주문 수량**이 명시되면 그 숫자. **없으면 "1"** (위 판매 단위 kg·L 등은 수량이 아니라 상품명의 일부).
- **여러 품목**이 한 주문이면 상품명을 "/"로 연결하고, 상품옵션도 "/"로 맞추고(없으면 ""), 수량은 "/"로 각각 또는 합리적으로 하나의 필드에 맞출 것.
- 상품명과 상품옵션에 **같은 내용을 중복** 넣지 말 것.

C. 배송메시지
- "문앞/부재시/경비실/요청사항/배송요청" 계열 문구는 배송메시지.

D. 보내는사람
- 발신인/보내는사람이 명시된 경우만 채움. 없으면 "".

E. 일자
- 원문에 "주문일자"만 있으면 주문일시에 넣는다.

F. 물류 보조 필드 (상품코드, 옵션코드, 센터코드, 박스수량, 출고타입, 출고요청일, 주문ID, 출고지시사항, 판매처)
- **코어 ${CORE_BASE_HEADER_COUNT}개**는 이름·주소·상품·수량 등 일반 주문 텍스트에서 추출한다.
- **보조 ${auxiliaryCount}개는 추측 금지.** 원문에 **그 필드에 해당하는 말(라벨·키워드)이 붙어 있거나, 줄에서 명확히 무엇인지 읽을 수 있을 때만** 값을 넣는다. **라벨 없이 숫자·코드만 덩그러니 있고 의미가 불명확하면 반드시 ""** (어느 보조 필드에도 억지로 넣지 말 것).
- **신호가 있을 때만 매핑 예시** (값 앞·뒤 또는 같은 줄에 아래 같은 표현이 있어야 함):
  - 상품코드 / SKU / 품목코드 / 상품코드: / 바코드(상품 식별으로 쓰인 경우) → 상품코드
  - 옵션코드 / 서브SKU / 옵션코드: → 옵션코드
  - 센터코드 / 창고코드 → 센터코드
  - 박스수량 / 합포·박스 수량(문맥상 박스 개수) → 박스수량
  - 출고타입 / 출고유형(일반·긴급 등) → 출고타입
  - 출고요청일 / 출고 요청일자 → 출고요청일
  - 주문ID / 몰 주문ID / 쇼핑몰 주문번호(ID) (**주문번호**와 구분되는 ID일 때) → 주문ID
  - 출고지시 / 피킹지시 / 창고지시 → 출고지시사항 (일반 "문앞 배송" 등은 배송메시지)
  - 판매처 / 채널 / 몰명 → 판매처
- **주문번호** 필드는 기존 규칙대로; 보조의 주문ID와 혼동하지 말 것. 불명확하면 주문ID는 "".

[주문 분리 규칙]
- 이름+전화+주소 세트가 반복되거나 주소가 바뀌면 새 주문으로 분리.
- 분리가 애매하면 1건으로 만들되, 필드 오염(주소를 상품명에 넣기 등)은 금지.

[정리 규칙]
- 전화번호는 가능한 원문 형태 유지(예: 010-1234-5678).
- 불필요한 라벨 문자(예: "이름:", "주소:")는 값에서 제거.
- 공백 정리 후 반환.

[한 줄·라벨 없는 입력 예시 — 반드시 필드 분리]
입력: 김철수 서울시 강남구 테헤란로 123 010-1234-5678 사과1kg
→ 받는사람="김철수", 받는사람전화1="010-1234-5678", 받는사람주소1="서울시 강남구 테헤란로 123", 상품명="사과1kg", 상품옵션="", 수량="1"
(1kg는 판매 단위이므로 상품명에 포함. 수량 별도 없으면 1)
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
            content: `당신은 주문 엑셀 파일의 헤더를
시스템의 기준헤더(BASE_HEADERS)로 매핑하는 전문가입니다.

입력은 판매자 주문 데이터 파일의 헤더입니다.

목표
주어진 헤더들을 의미적으로 분석하여
시스템의 BASE_HEADERS 중 가장 적합한 하나로 매핑합니다.

중요 규칙

1. 반드시 BASE_HEADERS 목록 중 하나로만 매핑합니다.
새로운 헤더를 생성하거나 수정하지 않습니다.

2. 헤더의 단어 자체가 아니라 의미를 기준으로 판단합니다.

예
배송받는곳 → 받는사람주소1
수령지 → 받는사람주소1
받는분 → 받는사람
연락처 → 받는사람전화1

3. 단어가 정확히 일치하지 않아도 의미가 같으면 매핑합니다.

예

주소 의미
배송지
수령지
도착지
받을곳
배송받는곳
받는주소
→ 받는사람주소1

사람 의미
수령인
받는분
고객명
구매자
수취인
→ 받는사람

전화 의미
연락처
휴대폰
핸드폰
전화번호
→ 받는사람전화1

우편번호 의미
우편번호
ZIP
postcode
→ 받는사람우편번호

4. 발송 관련 단어는 보내는사람 계열로 매핑합니다.

예
발송인
보내는분
출고지
판매자
공급자
→ 보내는사람

5. 상품 관련 단어

상품
제품
상품명칭
상품이름
품목
→ 상품명

옵션
선택옵션
상품옵션
→ 상품옵션

수량
개수
주문수량
주문개수
→ 수량

6. 주소 / 전화 / 우편번호 계열은 기본 필드만 사용합니다.

주소 → 주소1
전화 → 전화1

주소2 또는 전화2는 임의 생성하지 않습니다.

7. 확실하지 않은 경우
가장 의미가 가까운 기준헤더를 선택합니다.
매핑을 포기하지 않습니다.

8. BASE_HEADERS 목록에 없는 값은 절대 반환하지 않습니다.

9. 응답은 JSON 형식으로만 반환합니다.
설명 텍스트는 출력하지 않습니다.`,
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
