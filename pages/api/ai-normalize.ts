import type { NextApiRequest, NextApiResponse } from 'next';
import { NORMALIZATION_SYSTEM_PROMPT, createNormalizationUserPrompt } from '@/app/lib/refinement-engine/hint-engine/e-prime-ai';

// [ENV_CHECK] 서버 실행 시 환경변수 로딩 여부 확인
console.log("[ENV_CHECK]", {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "SET" : "UNDEFINED",
  AI_ENABLED: process.env.AI_ENABLED,
  AI_MODEL: process.env.AI_MODEL,
  NODE_ENV: process.env.NODE_ENV,
});

// 환경변수 누락 시 즉시 에러
if (!process.env.OPENAI_API_KEY) {
  console.error("[ENV_CHECK] ❌ OPENAI_API_KEY가 설정되지 않았습니다. 환경 변수를 설정해주세요.");
}

/**
 * API route for AI normalization of entity information
 * 
 * 요구사항:
 * - originalText와 engineHint를 받아 모든 엔티티 정보를 정규화
 * - 이름, 전화번호, 주소, 상품, 옵션, 요청사항, 수량을 정규화하여 반환
 */

type NormalizationRequest = {
  originalText: string;
  engineHint: Record<string, any>;
};

type NormalizationResponse = {
  status: 'OK' | 'ERROR';
  name?: string;
  phone?: string;
  address?: string;
  product?: string;
  option?: string;
  request?: string;
  quantity?: number | null;
};

// Next.js Pages API에서 JSON body 파싱 활성화
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<NormalizationResponse>) {
  // [API_ROUTE] 실행 경로 확인 - /api/ai-gateway 단일 통로 내부에서만 사용되는 normalize 핸들러 (legacy 경로)
  // [방어] Pages API / App Router 혼재 방어: Pages API가 우선 처리되므로 충돌 없음
  // /api/ai-gateway 기반 단일 통로 원칙을 따르되, 내부 핸들러로만 사용됨
  console.log('[API_ROUTE] ========== ai-normalize API 호출 ==========');
  console.log('[API_ROUTE] 실행 경로: /api/ai-gateway → normalize 핸들러 (Pages API 내부)');
  console.log('[API_ROUTE] 요청 시각:', new Date().toISOString());
  console.log('[API_ROUTE] 요청 메서드:', req.method);
  
  // POST 메서드만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'ERROR' });
  }

  // [PAYLOAD_COMPARISON] 요청 시작 - 엑셀 페이지 vs test 페이지 비교
  console.log('[PAYLOAD_COMPARISON] ========== 요청 시작 ==========');
  console.log('[PAYLOAD_COMPARISON] 요청 시각:', new Date().toISOString());
  
  // [진단] POST 함수 시작 시점 환경 변수 확인
  console.log('[진단] POST 함수 시작 - 줄 28');
  console.log('[진단] process.env.OPENAI_API_KEY 존재 여부:', typeof process.env.OPENAI_API_KEY !== 'undefined' ? '존재' : '없음', '값:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'undefined/null');
  console.log('[진단] process.env.AI_ENABLED 값:', process.env.AI_ENABLED);
  
  // [PAYLOAD_COMPARISON] AI_ENABLED 분기 확인
  const aiEnabled = process.env.AI_ENABLED;
  console.log('[PAYLOAD_COMPARISON] 3) AI_ENABLED 분기 확인:');
  console.log('[PAYLOAD_COMPARISON]   - AI_ENABLED 값:', aiEnabled);
  console.log('[PAYLOAD_COMPARISON]   - AI_ENABLED 타입:', typeof aiEnabled);
  console.log('[PAYLOAD_COMPARISON]   - AI_ENABLED === undefined:', aiEnabled === undefined);
  console.log('[PAYLOAD_COMPARISON]   - AI_ENABLED === null:', aiEnabled === null);
  console.log('[PAYLOAD_COMPARISON]   - AI_ENABLED === "true":', aiEnabled === 'true');
  console.log('[PAYLOAD_COMPARISON]   - AI_ENABLED === "false":', aiEnabled === 'false');
  console.log('[PAYLOAD_COMPARISON]   - AI_ENABLED truthy 체크:', !!aiEnabled);
  
  try {
    // [PAYLOAD_COMPARISON] 요청 body 파싱 전
    console.log('[PAYLOAD_COMPARISON] req.body 접근 전');
    
    const body: NormalizationRequest = req.body;
    
    // [PAYLOAD_COMPARISON] 요청 body 전체 로그
    console.log('[PAYLOAD_COMPARISON] ========== 요청 Body 분석 ==========');
    console.log('[PAYLOAD_COMPARISON] body 전체:', JSON.stringify(body, null, 2));
    console.log('[PAYLOAD_COMPARISON] body 타입:', typeof body);
    console.log('[PAYLOAD_COMPARISON] body === null:', body === null);
    console.log('[PAYLOAD_COMPARISON] body === undefined:', body === undefined);
    
    const { originalText, engineHint } = body;
    
    // [PAYLOAD_COMPARISON] 1) originalText 존재 여부 확인
    console.log('[PAYLOAD_COMPARISON] 1) originalText 존재 여부:');
    console.log('[PAYLOAD_COMPARISON]   - originalText 값:', originalText);
    console.log('[PAYLOAD_COMPARISON]   - originalText 타입:', typeof originalText);
    console.log('[PAYLOAD_COMPARISON]   - originalText === undefined:', originalText === undefined);
    console.log('[PAYLOAD_COMPARISON]   - originalText === null:', originalText === null);
    console.log('[PAYLOAD_COMPARISON]   - originalText 존재 여부 (truthy):', !!originalText);
    console.log('[PAYLOAD_COMPARISON]   - originalText 길이:', typeof originalText === 'string' ? originalText.length : 'N/A');
    console.log('[PAYLOAD_COMPARISON]   - originalText 미리보기:', typeof originalText === 'string' ? originalText.substring(0, 100) : 'N/A');
    
    // [PAYLOAD_COMPARISON] 2) engineHint 구조 차이 확인
    console.log('[PAYLOAD_COMPARISON] 2) engineHint 구조 차이:');
    console.log('[PAYLOAD_COMPARISON]   - engineHint 값:', engineHint);
    console.log('[PAYLOAD_COMPARISON]   - engineHint 타입:', typeof engineHint);
    console.log('[PAYLOAD_COMPARISON]   - engineHint === undefined:', engineHint === undefined);
    console.log('[PAYLOAD_COMPARISON]   - engineHint === null:', engineHint === null);
    console.log('[PAYLOAD_COMPARISON]   - engineHint === {}:', JSON.stringify(engineHint) === '{}');
    console.log('[PAYLOAD_COMPARISON]   - engineHint JSON:', JSON.stringify(engineHint, null, 2));
    console.log('[PAYLOAD_COMPARISON]   - engineHint 키 목록:', engineHint ? Object.keys(engineHint) : 'N/A');
    console.log('[PAYLOAD_COMPARISON]   - engineHint.engine 존재:', engineHint && 'engine' in engineHint);
    if (engineHint && 'engine' in engineHint) {
      console.log('[PAYLOAD_COMPARISON]   - engineHint.engine 값:', JSON.stringify(engineHint.engine, null, 2));
      console.log('[PAYLOAD_COMPARISON]   - engineHint.engine 타입:', typeof engineHint.engine);
      if (engineHint.engine && typeof engineHint.engine === 'object') {
        console.log('[PAYLOAD_COMPARISON]   - engineHint.engine 키 목록:', Object.keys(engineHint.engine));
      }
    }

    // 입력 검증
    // [PAYLOAD_COMPARISON] 4) undefined/null 값으로 throw 되는 지점 확인 - originalText 검증
    console.log('[PAYLOAD_COMPARISON] 4) undefined/null 값 검증 - originalText 검증 단계:');
    console.log('[PAYLOAD_COMPARISON]   - !originalText 결과:', !originalText);
    console.log('[PAYLOAD_COMPARISON]   - typeof originalText !== "string" 결과:', typeof originalText !== 'string');
    console.log('[PAYLOAD_COMPARISON]   - 검증 통과 여부:', !(!originalText || typeof originalText !== 'string'));
    
    if (!originalText || typeof originalText !== 'string') {
      console.log('[PAYLOAD_COMPARISON] ❌ originalText 검증 실패 - 400 에러 반환');
      console.log('[PAYLOAD_COMPARISON]   - originalText가 없거나 문자열이 아님');
      return res.status(400).json({
        status: 'ERROR',
      } as NormalizationResponse);
    }
    
    console.log('[PAYLOAD_COMPARISON] ✅ originalText 검증 통과');

    // AI API 호출
    // [PAYLOAD_COMPARISON] callAIForNormalization 호출 전 파라미터 확인
    console.log('[PAYLOAD_COMPARISON] callAIForNormalization 호출 전:');
    console.log('[PAYLOAD_COMPARISON]   - originalText:', originalText ? originalText.substring(0, 50) + '...' : 'undefined/null');
    console.log('[PAYLOAD_COMPARISON]   - engineHint:', JSON.stringify(engineHint));
    
    const aiResult = await callAIForNormalization(
      originalText,
      engineHint
    );
    
    console.log('[PAYLOAD_COMPARISON] callAIForNormalization 호출 후 결과:', JSON.stringify(aiResult, null, 2));

    console.log('[PAYLOAD_COMPARISON] ========== 요청 종료 (성공) ==========');
    console.log('[PAYLOAD_COMPARISON] 최종 응답:', JSON.stringify(aiResult, null, 2));
    
    return res.status(200).json(aiResult);
  } catch (error) {
    // [PAYLOAD_COMPARISON] 4) undefined/null 값으로 throw 되는 지점 확인 - catch 블록
    console.error('[PAYLOAD_COMPARISON] ❌ POST 함수 catch 블록 진입 - 에러 발생');
    console.error('[PAYLOAD_COMPARISON] 4) undefined/null 값으로 throw 되는 지점:');
    console.error('[PAYLOAD_COMPARISON]   - 에러 발생 위치: POST 함수 내부');
    console.error('[PAYLOAD_COMPARISON]   - 에러 타입:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[PAYLOAD_COMPARISON]   - 에러 메시지:', error instanceof Error ? error.message : String(error));
    console.error('[PAYLOAD_COMPARISON]   - 에러 스택:', error instanceof Error ? error.stack : '없음');
    console.error('[PAYLOAD_COMPARISON]   - 에러 객체:', error);
    
    console.error('[진단] 줄 50 - POST 함수 catch 블록');
    console.error('[진단] 에러 발생 위치: POST 함수 내부');
    console.error('[진단] 에러 타입:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[진단] 에러 메시지:', error instanceof Error ? error.message : String(error));
    console.error('[진단] 에러 스택:', error instanceof Error ? error.stack : '없음');
    console.error('[ai-normalize] Error:', error);
    
    console.log('[PAYLOAD_COMPARISON] ========== 요청 종료 (에러) ==========');
    
    return res.status(500).json({
      status: 'ERROR',
    } as NormalizationResponse);
  }
}

/**
 * AI API를 호출하여 엔티티 정보 정규화
 */
async function callAIForNormalization(
  originalText: string,
  engineHint: Record<string, any>
): Promise<NormalizationResponse> {
  // [PAYLOAD_COMPARISON] callAIForNormalization 함수 시작
  console.log('[PAYLOAD_COMPARISON] ========== callAIForNormalization 함수 시작 ==========');
  console.log('[PAYLOAD_COMPARISON] 파라미터 확인:');
  console.log('[PAYLOAD_COMPARISON]   - originalText 타입:', typeof originalText);
  console.log('[PAYLOAD_COMPARISON]   - originalText 값:', originalText ? originalText.substring(0, 50) + '...' : 'undefined/null');
  console.log('[PAYLOAD_COMPARISON]   - engineHint 타입:', typeof engineHint);
  console.log('[PAYLOAD_COMPARISON]   - engineHint 값:', JSON.stringify(engineHint));
  
  // [진단] callAIForNormalization 함수 시작 - 줄 64
  console.log('[진단] callAIForNormalization 함수 시작 - 줄 64');
  
  // [환경변수 점검] 사용 중인 env 키 목록 출력
  const envKeys = ['OPENAI_API_KEY', 'AI_ENABLED', 'AI_API_URL', 'AI_MODEL'];
  console.log('[환경변수 점검] 사용 중인 env 키 목록:', envKeys.join(', '));
  
  // [환경변수 점검] OPENAI_API_KEY / AI_ENABLED 값이 undefined인지 명확히 로그
  console.log('[환경변수 점검] OPENAI_API_KEY:', process.env.OPENAI_API_KEY === undefined ? 'undefined' : 'defined');
  console.log('[환경변수 점검] AI_ENABLED:', process.env.AI_ENABLED === undefined ? 'undefined' : 'defined', '값:', process.env.AI_ENABLED);
  
  // 환경 변수에서 AI 설정 확인
  const apiKey = process.env.OPENAI_API_KEY;
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  // [PAYLOAD_COMPARISON] 3) AI_ENABLED 분기 통과 여부 확인 - apiKey 체크
  console.log('[PAYLOAD_COMPARISON] 3) AI_ENABLED 분기 통과 여부 - apiKey 체크:');
  console.log('[PAYLOAD_COMPARISON]   - apiKey 값:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined/null');
  console.log('[PAYLOAD_COMPARISON]   - apiKey 타입:', typeof apiKey);
  console.log('[PAYLOAD_COMPARISON]   - apiKey === undefined:', apiKey === undefined);
  console.log('[PAYLOAD_COMPARISON]   - apiKey === null:', apiKey === null);
  console.log('[PAYLOAD_COMPARISON]   - apiKey truthy 체크:', !!apiKey);

  // [진단] 환경 변수 확인 - 줄 69-71
  console.log('[진단] 줄 69 - apiKey 값:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined/null');
  console.log('[진단] 줄 70 - apiUrl 값:', apiUrl);
  console.log('[진단] 줄 71 - model 값:', model);
  console.log('[진단] 줄 73 - apiKey 존재 여부 체크:', !!apiKey);

  // [PAYLOAD_COMPARISON] 4) undefined/null 값으로 throw 되는 지점 확인 - apiKey 검증
  if (!apiKey) {
    console.log('[PAYLOAD_COMPARISON] ❌ apiKey가 없어서 ERROR 반환');
    console.log('[PAYLOAD_COMPARISON] 4) undefined/null 값으로 throw 되는 지점: apiKey 검증 실패');
    console.log('[진단] 줄 73-76 - apiKey가 없어서 ERROR 반환');
    throw new Error('OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.');
  }
  
  console.log('[PAYLOAD_COMPARISON] ✅ apiKey 검증 통과');

  // 프롬프트 구성
  // 시스템 프롬프트는 고정 상수로만 사용 (외부 입력 불가)
  // [진단] try/catch 밖에 있는 코드 - 줄 81-82
  console.log('[진단] 줄 81 - NORMALIZATION_SYSTEM_PROMPT 접근 전');
  let systemPrompt: string;
  let userPrompt: string;
  try {
    console.log('[진단] 줄 81 - NORMALIZATION_SYSTEM_PROMPT 값:', typeof NORMALIZATION_SYSTEM_PROMPT !== 'undefined' ? '존재' : 'undefined', '타입:', typeof NORMALIZATION_SYSTEM_PROMPT);
    systemPrompt = NORMALIZATION_SYSTEM_PROMPT;
    
    // 📌 1️⃣ SYSTEM PROMPT 전체 출력 (파일 경로와 함께)
    console.log('========================================');
    console.log('📌 1️⃣ SYSTEM PROMPT 전체 출력');
    console.log('========================================');
    console.log('📁 파일 경로: app/lib/refinement-engine/ai/normalizationPrompt.ts');
    console.log('📝 SYSTEM PROMPT 전체 내용:');
    console.log(systemPrompt);
    console.log('========================================');
    
    console.log('[진단] 줄 81 - systemPrompt 할당 완료, 값:', systemPrompt ? `${systemPrompt.substring(0, 50)}...` : 'undefined/null');
    
    console.log('[진단] 줄 82 - createNormalizationUserPrompt 호출 전');
    console.log('[진단] 줄 82 - originalText 값:', originalText ? `${originalText.substring(0, 50)}...` : 'undefined/null');
    console.log('[진단] 줄 82 - engineHint 값:', engineHint ? JSON.stringify(engineHint).substring(0, 100) : 'undefined/null');
    
    // 📌 2️⃣ USER PROMPT 생성 로직 전체 코드 출력
    console.log('========================================');
    console.log('📌 2️⃣ USER PROMPT 생성 로직 전체 코드');
    console.log('========================================');
    console.log('📁 파일 경로: app/lib/refinement-engine/hint-engine/e-prime-ai/index.ts');
    console.log('📝 함수명: createNormalizationUserPrompt');
    console.log('📝 입력 파라미터:');
    console.log('  - originalText:', originalText);
    console.log('  - engineHint:', JSON.stringify(engineHint, null, 2));
    console.log('========================================');
    
    userPrompt = createNormalizationUserPrompt(originalText, engineHint);
    
    // 📌 2️⃣ USER PROMPT 실제 전송되는 문자열 출력
    console.log('========================================');
    console.log('📌 2️⃣ USER PROMPT 실제 전송되는 문자열');
    console.log('========================================');
    console.log(userPrompt);
    console.log('========================================');
    
    console.log('[진단] 줄 82 - userPrompt 할당 완료, 값:', userPrompt ? `${userPrompt.substring(0, 50)}...` : 'undefined/null');
  } catch (error) {
    console.error('[진단] 줄 81-82 - try/catch 밖 코드에서 에러 발생!');
    console.error('[진단] 에러 위치: 줄 81 또는 82');
    console.error('[진단] 에러 타입:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[진단] 에러 메시지:', error instanceof Error ? error.message : String(error));
    console.error('[진단] 에러 스택:', error instanceof Error ? error.stack : '없음');
    throw error; // 에러를 다시 throw하여 상위 catch에서 처리
  }

  try {
    // [진단] fetch 호출 전 값 확인 - 줄 85
    console.log('[진단] 줄 85 - fetch 호출 전');
    console.log('[진단] apiUrl 값:', apiUrl);
    console.log('[진단] apiKey 값:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined/null');
    console.log('[진단] model 값:', model);
    console.log('[진단] systemPrompt 값:', systemPrompt ? `${systemPrompt.substring(0, 50)}...` : 'undefined/null');
    console.log('[진단] userPrompt 값:', userPrompt ? `${userPrompt.substring(0, 50)}...` : 'undefined/null');
    
    // [환경변수 점검] fetch 직전에 apiKey, model, apiUrl 값을 한 줄로 로그
    console.log('[환경변수 점검] fetch 직전 - apiKey:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined', 'model:', model, 'apiUrl:', apiUrl);
    
    // [진단] messages 배열 구성 확인
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    console.log('[진단] 줄 94-95 - messages 배열:', JSON.stringify(messages).substring(0, 200));
    
    // [AI_REQUEST_DEBUG] fetch 직전 실제 요청 파라미터 로그
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    const body = {
      model,
      messages,
      temperature: 0.2, // 낮은 temperature로 일관성 확보
      response_format: { type: 'json_object' }, // JSON 형식 강제
    };
    console.log("[AI_REQUEST_DEBUG]", {
      hasApiKey: !!process.env.OPENAI_API_KEY,
      model,
      endpoint: apiUrl,
      headers,
      bodyPreview: JSON.stringify(body).slice(0, 300),
    });
    
    // 타임아웃 적용 (30초)
    const TIMEOUT_MS = 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    let response: Response;
    try {
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('[callAIForNormalization] Timeout after 30 seconds');
          throw new Error('AI API 호출 타임아웃 (30초)');
        }
        throw fetchError;
      }
    } catch (error) {
      throw error;
    }
    
    // [AI_RESPONSE_DEBUG] fetch 결과 상세 로그
    console.log("[AI_RESPONSE_DEBUG]", {
      status: response.status,
      ok: response.ok,
    });
    
    // [AI_RESPONSE_TEXT] OpenAI 원문 응답 확인 (text()로 먼저 읽기)
    const text = await response.text();
    console.log("[AI_RESPONSE_TEXT]", text);
    
    // 📌 3️⃣ AI 응답 원본(JSON 파싱 전) 전체 출력
    console.log('========================================');
    console.log('📌 3️⃣ AI 응답 원본 (JSON 파싱 전)');
    console.log('========================================');
    console.log('📝 OpenAI API 원본 응답 전체:');
    console.log(text);
    console.log('========================================');
    
    console.log('[진단] 줄 100 - fetch 응답 받음, status:', response.status);

    if (!response.ok) {
      // text()는 이미 위에서 읽었으므로 재사용 불가 - 새 Response 객체 생성 필요
      // 하지만 이미 text()로 읽었으므로 errorText는 위에서 로그로 출력됨
      console.error('[callAIForNormalization] API error - status:', response.status, 'response text:', text);
      return {
        status: 'ERROR',
      };
    }

    // text()로 이미 읽었으므로 JSON 파싱
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('[callAIForNormalization] JSON parse error - 원문 text:', text);
      return {
        status: 'ERROR',
      };
    }
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        status: 'ERROR',
      };
    }

    // AI 원본 응답 로그 출력 (JSON.parse 전)
    console.log('[ai-normalize] AI 원본 응답 (JSON 문자열):', content);
    
    // 📌 3️⃣ AI 응답 원본(JSON 파싱 전) - content 부분만 출력
    console.log('========================================');
    console.log('📌 3️⃣ AI 응답 원본 (JSON 파싱 전) - content 부분');
    console.log('========================================');
    console.log('📝 AI가 반환한 content (JSON 파싱 전 원본):');
    console.log(content);
    console.log('========================================');

    // JSON 파싱
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(content);
      
      // 파싱된 응답에서 실제 포함된 필드 확인
      const includedFields = Object.keys(parsedResponse).filter(key => 
        parsedResponse[key] !== undefined && parsedResponse[key] !== null
      );
      console.log('[ai-normalize] AI 응답에 포함된 필드:', includedFields);
    } catch (parseError) {
      console.error('[callAIForNormalization] JSON parse error:', parseError);
      return {
        status: 'ERROR',
      };
    }

    // 응답 검증 및 정규화
    // 새로운 필드명(receiver_name, sender_name 등)을 기존 필드명(name, phone 등)으로 매핑
    const result: NormalizationResponse = {
      status: parsedResponse.status === 'OK' ? 'OK' : 'ERROR',
    };

    // 수신자 정보 매핑 (receiver_name -> name, receiver_phone -> phone, receiver_address -> address)
    if (parsedResponse.receiver_name !== undefined) {
      result.name = parsedResponse.receiver_name || undefined;
    } else if (parsedResponse.name !== undefined) {
      // 기존 필드명도 지원 (하위 호환성)
      result.name = parsedResponse.name || undefined;
    }
    
    if (parsedResponse.receiver_phone !== undefined) {
      result.phone = parsedResponse.receiver_phone || undefined;
    } else if (parsedResponse.phone !== undefined) {
      // 기존 필드명도 지원 (하위 호환성)
      result.phone = parsedResponse.phone || undefined;
    }
    
    if (parsedResponse.receiver_address !== undefined) {
      result.address = parsedResponse.receiver_address || undefined;
    } else if (parsedResponse.address !== undefined) {
      // 기존 필드명도 지원 (하위 호환성)
      result.address = parsedResponse.address || undefined;
    }
    
    // 상품 정보 매핑 (product_name -> product, product_option -> option, request_message -> request)
    if (parsedResponse.product_name !== undefined) {
      result.product = parsedResponse.product_name || undefined;
    } else if (parsedResponse.product !== undefined) {
      // 기존 필드명도 지원 (하위 호환성)
      result.product = parsedResponse.product || undefined;
    } else {
      result.product = undefined;
    }
    
    if (parsedResponse.product_option !== undefined) {
      result.option = parsedResponse.product_option || undefined;
    } else if (parsedResponse.option !== undefined) {
      // 기존 필드명도 지원 (하위 호환성)
      result.option = parsedResponse.option || undefined;
    } else {
      result.option = undefined;
    }
    
    if (parsedResponse.request_message !== undefined) {
      result.request = parsedResponse.request_message || undefined;
    } else if (parsedResponse.request !== undefined) {
      // 기존 필드명도 지원 (하위 호환성)
      result.request = parsedResponse.request || undefined;
    } else {
      result.request = undefined;
    }
    
    if (parsedResponse.quantity !== undefined) {
      result.quantity = parsedResponse.quantity !== null ? parsedResponse.quantity : null;
    } else {
      result.quantity = null;
    }

    console.log('[PAYLOAD_COMPARISON] ========== callAIForNormalization 함수 종료 (성공) ==========');
    console.log('[PAYLOAD_COMPARISON] 최종 결과:', JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    // [PAYLOAD_COMPARISON] 4) undefined/null 값으로 throw 되는 지점 확인 - callAIForNormalization catch
    console.error('[PAYLOAD_COMPARISON] ❌ callAIForNormalization catch 블록 진입 - 에러 발생');
    console.error('[PAYLOAD_COMPARISON] 4) undefined/null 값으로 throw 되는 지점:');
    console.error('[PAYLOAD_COMPARISON]   - 에러 발생 위치: callAIForNormalization 함수 내부');
    console.error('[PAYLOAD_COMPARISON]   - 에러 타입:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[PAYLOAD_COMPARISON]   - 에러 메시지:', error instanceof Error ? error.message : String(error));
    console.error('[PAYLOAD_COMPARISON]   - 에러 스택:', error instanceof Error ? error.stack : '없음');
    console.error('[PAYLOAD_COMPARISON]   - 에러 객체:', error);
    
    console.error('[진단] 줄 202 - callAIForNormalization catch 블록');
    console.error('[진단] 에러 발생 위치: callAIForNormalization 함수 내부');
    console.error('[진단] 에러 타입:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[진단] 에러 메시지:', error instanceof Error ? error.message : String(error));
    console.error('[진단] 에러 스택:', error instanceof Error ? error.stack : '없음');
    console.error('[callAIForNormalization] Error:', error);
    
    console.log('[PAYLOAD_COMPARISON] ========== callAIForNormalization 함수 종료 (에러) ==========');
    
    return {
      status: 'ERROR',
    };
  }
}
