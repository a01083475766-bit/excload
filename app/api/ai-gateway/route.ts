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

/**
 * AI Gateway 요청 타입
 */
type AIGatewayRequest = 
  | { type: 'normalize-29'; text: string }
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
        const fallbackText = typeof body?.text === 'string' ? body.text : '';
        return NextResponse.json({
          orders: [
            {
              "주문번호": "",
              "보내는사람": "",
              "보내는사람전화1": "",
              "보내는사람전화2": "",
              "보내는사람우편번호": "",
              "보내는사람주소1": "",
              "보내는사람주소2": "",
              "받는사람": "",
              "받는사람전화1": "",
              "받는사람전화2": "",
              "받는사람우편번호": "",
              "받는사람주소1": fallbackText,
              "받는사람주소2": "",
              "주문자": "",
              "주문자연락처": "",
              "주문일시": "",
              "결제금액": "",
              "상품명": fallbackText,
              "추가상품": "",
              "상품옵션": "",
              "상품옵션1": "",
              "수량": "1",
              "배송메시지": "",
              "운임구분": "",
              "운임": "",
              "운송장번호": "",
              "창고메모": "",
              "내부메모": "",
              "출고번호": ""
            }
          ],
        });
      }
      return NextResponse.json({ error: '현재 분석 기능을 사용할 수 없습니다.' }, { status: 400 });
    }

    // 환경변수 확인
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
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
 * 텍스트 주문 변환: 텍스트를 29개 기준헤더 구조의 orders 배열로 변환
 * 
 * ⚠️ 헌법 준수: 서버 내부에서 직접 import하여 호출 가능하도록 export
 */
export async function handleNormalize29(
  body: { type: 'normalize-29'; text: string },
  apiKey: string
): Promise<NextResponse> {
  let fallbackReason: 'none' | 'json_parse_failed' | 'empty_orders' = 'none';
  const BASE_HEADERS_29 = [
    '주문번호',
    '보내는사람',
    '보내는사람전화1',
    '보내는사람전화2',
    '보내는사람우편번호',
    '보내는사람주소1',
    '보내는사람주소2',
    '받는사람',
    '받는사람전화1',
    '받는사람전화2',
    '받는사람우편번호',
    '받는사람주소1',
    '받는사람주소2',
    '주문자',
    '주문자연락처',
    '주문일시',
    '결제금액',
    '상품명',
    '추가상품',
    '상품옵션',
    '상품옵션1',
    '수량',
    '배송메시지',
    '운임구분',
    '운임',
    '운송장번호',
    '창고메모',
    '내부메모',
    '출고번호',
  ] as const;

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
    for (const header of BASE_HEADERS_29) {
      const value = order?.[header];
      normalized[header] = value == null ? '' : String(value).trim();
    }
    if (!normalized['수량']) {
      normalized['수량'] = '1';
    }
    return normalized;
  };

  const { text } = body;

  if (!text || typeof text !== 'string') {
    return NextResponse.json(
      { error: 'text is required' },
      { status: 400 }
    );
  }

  const systemPrompt = `
너는 한국어 주문 텍스트를 29개 기준헤더 JSON으로 변환하는 파서다.
반드시 JSON 객체 1개만 반환한다. 설명/코드블록/주석 금지.

[출력 형식]
{
  "orders": [
    {
      "주문번호": "",
      "보내는사람": "",
      "보내는사람전화1": "",
      "보내는사람전화2": "",
      "보내는사람우편번호": "",
      "보내는사람주소1": "",
      "보내는사람주소2": "",
      "받는사람": "",
      "받는사람전화1": "",
      "받는사람전화2": "",
      "받는사람우편번호": "",
      "받는사람주소1": "",
      "받는사람주소2": "",
      "주문자": "",
      "주문자연락처": "",
      "주문일시": "",
      "결제금액": "",
      "상품명": "",
      "추가상품": "",
      "상품옵션": "",
      "상품옵션1": "",
      "수량": "",
      "배송메시지": "",
      "운임구분": "",
      "운임": "",
      "운송장번호": "",
      "창고메모": "",
      "내부메모": "",
      "출고번호": ""
    }
  ]
}

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

B. 상품/옵션/수량
- 상품명은 실제 품목명만 넣는다. 주소/전화/요청문구 절대 포함 금지.
- 색상/사이즈/맛/규격 등은 상품옵션으로 분리.
- 수량(개/ea/장/세트 등)은 수량에 숫자 문자열로 저장.
- 한 주문에 상품이 여러 개면 상품명을 "/"로 연결.
- 옵션이 2개면 상품옵션, 상품옵션1에 순서대로 저장.

C. 배송메시지
- "문앞/부재시/경비실/요청사항/배송요청" 계열 문구는 배송메시지.

D. 보내는사람
- 발신인/보내는사람이 명시된 경우만 채움. 없으면 "".

[주문 분리 규칙]
- 이름+전화+주소 세트가 반복되거나 주소가 바뀌면 새 주문으로 분리.
- 분리가 애매하면 1건으로 만들되, 필드 오염(주소를 상품명에 넣기 등)은 금지.

[정리 규칙]
- 전화번호는 가능한 원문 형태 유지(예: 010-1234-5678).
- 불필요한 라벨 문자(예: "이름:", "주소:")는 값에서 제거.
- 공백 정리 후 반환.
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
        temperature: 0.1,
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
      .map((order: Record<string, any>) => normalizeOrderObject(order));

    if (!Array.isArray(orders) || orders.length === 0) {
      console.warn('[FALLBACK - NORMALIZE29] orders 비어있음 → 강제 생성');
      if (fallbackReason === 'none') {
        fallbackReason = 'empty_orders';
      }

      orders = [{
        "주문번호": "",
        "보내는사람": "",
        "보내는사람전화1": "",
        "보내는사람전화2": "",
        "보내는사람우편번호": "",
        "보내는사람주소1": "",
        "보내는사람주소2": "",
        "받는사람": "",
        "받는사람전화1": "",
        "받는사람전화2": "",
        "받는사람우편번호": "",
        "받는사람주소1": body.text || "",
        "받는사람주소2": "",
        "주문자": "",
        "주문자연락처": "",
        "주문일시": "",
        "결제금액": "",
        "상품명": body.text || "",
        "추가상품": "",
        "상품옵션": "",
        "상품옵션1": "",
        "수량": "1",
        "배송메시지": "",
        "운임구분": "",
        "운임": "",
        "운송장번호": "",
        "창고메모": "",
        "내부메모": "",
        "출고번호": ""
      }].map((order) => normalizeOrderObject(order));
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

**기준헤더 목록 (29개):**
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
