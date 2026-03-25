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
      // AI 비활성화 시 빈 응답 반환
      if (type === 'normalize-29') {
        return NextResponse.json({ orders: [] });
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
  const { text } = body;

  if (!text || typeof text !== 'string') {
    return NextResponse.json(
      { error: 'text is required' },
      { status: 400 }
    );
  }

  const systemPrompt = `
너는 주문 텍스트를 분석하여 "29개 기준헤더 구조"의 orders 배열 JSON으로 변환하는 시스템이다.

[출력 규칙]

반드시 아래 JSON 형식만 반환한다.

{
 "orders":[
  {
   "주문번호":"",
   "보내는사람":"",
   "보내는사람전화1":"",
   "보내는사람전화2":"",
   "보내는사람우편번호":"",
   "보내는사람주소1":"",
   "보내는사람주소2":"",
   "받는사람":"",
   "받는사람전화1":"",
   "받는사람전화2":"",
   "받는사람우편번호":"",
   "받는사람주소1":"",
   "받는사람주소2":"",
   "주문자":"",
   "주문자연락처":"",
   "주문일시":"",
   "결제금액":"",
   "상품명":"",
   "추가상품":"",
   "상품옵션":"",
   "상품옵션1":"",
   "수량":"",
   "배송메시지":"",
   "운임구분":"",
   "운임":"",
   "운송장번호":"",
   "창고메모":"",
   "내부메모":"",
   "출고번호":""
  }
 ]
}

기본 규칙

- 모든 필드는 반드시 포함
- 모르는 값은 "" 사용
- null / undefined 금지
- 숫자도 문자열
- JSON 외 텍스트 출력 금지

[주소]

주소는 분리하지 않는다.
전체 주소는 주소1에 넣는다.
동/호만 명확하면 주소2 사용.

[주문 분리]

다음 경우 새 주문

- 이름 전화 주소 세트 반복
- 주소 변경
- 번호 목록
- 줄바꿈 구분

[상품 해석 규칙]

상품명 내부 단위는 분해하지 않는다.
예: 사시미2팩 / 연어1kg / 참치1팩 은 하나의 상품이다.

옵션으로 보이는 단어가 상품 뒤에 붙으면 상품옵션으로 처리한다.
예:
사시미2팩 붉은색
→ 상품명: 사시미2팩
→ 상품옵션: 붉은색

상품 단위 확장
팩 kg g 그램 ml 리터 세트 박스 봉 묶음 통 병 캔

수량 단위 확장
개 ea EA 장

예:
사시미2팩 3개
→ 상품명: 사시미2팩
→ 수량: 3

연어 1kg 2개
→ 상품명: 연어1kg
→ 수량: 2  

[다중 상품]

한 주문에 상품이 여러 개이면

상품들을 "/" 로 연결하여 하나의 상품명으로 만든다.

예

사시미2팩 연어1kg 참치1팩

→ 상품명: 사시미2팩/연어1kg/참치1팩

[받는사람]

일반 주문은 받는사람 기준이다.
이름 전화 주소가 하나면 받는사람.

[보내는사람]

보내는사람이 명시된 경우만 입력

발신인
보내는사람
발송인

없으면 "" 처리.

[공통 발신인]

다음 문맥이면 모든 주문 동일 적용

공통 발신인
모든 주문 동일 발송인
○○에서 발송
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
    const content = data?.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { orders: [] };
    }

    return NextResponse.json(parsed);
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
