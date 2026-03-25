/**
 * EXCLOAD OpenAI 클라이언트
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage1 Template Pipeline 전용
 * 
 * OpenAI API를 호출하여 헤더 매핑을 수행합니다.
 */

/**
 * OpenAI API를 호출하여 헤더 매핑을 수행합니다.
 * 
 * @param prompt - AI에게 전달할 프롬프트
 * @returns AI 응답 텍스트
 * @throws OpenAI API 호출 실패 시 에러
 */
export async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('시스템 설정 오류가 발생했습니다.');
  }
  
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  
  const requestBody = {
    model,
    messages: [
      {
        role: 'system',
        content: '당신은 택배사 업로드 파일의 헤더를 기준헤더로 매핑하는 전문가입니다. 주어진 헤더를 29개 기준헤더 중 하나로 매핑하세요.\n\n[문맥 기반 매핑 강화 규칙 v3]\n\n당신의 역할은 택배사 업로드 파일의 헤더를\n시스템의 BASE_HEADERS 중 하나로 정확히 매핑하는 것이다.\n\n절대 추측하지 말고, 규칙에 맞는 경우에만 매핑한다.\n\n1) 모호 단어 판단 규칙\n헤더에 다음과 같은 모호한 단어가 포함될 수 있다:\n연락처, 전화, 주소, 우편번호, 성명, 이름 등\n이 경우 반드시 앞에 포함된 접두어/수식어를 기준으로 판단한다.\n\n2) 보내는사람 계열 판단 키워드\n보내는사람, 발송인, 발송자, 출고지, 판매자, 공급자\n→ 보내는사람 관련 BASE_HEADERS로 매핑한다.\n\n3) 받는사람 계열 판단 키워드\n받는사람, 수취인, 고객, 구매자, 배송지\n→ 받는사람 관련 BASE_HEADERS로 매핑한다.\n\n4) 구조 규칙\nBASE_HEADERS 구조:\n- 보내는사람\n- 보내는사람전화1 / 보내는사람전화2\n- 보내는사람주소1 / 보내는사람주소2\n- 보내는사람우편번호\n- 받는사람\n- 받는사람전화1 / 받는사람전화2\n- 받는사람주소1 / 받는사람주소2\n- 받는사람우편번호\n\n모호 단어는 문맥을 먼저 판단한 뒤 해당 계열로 매핑한다.\n\n5) 1번 필드 고정 규칙\n전화/주소/우편번호 계열은 문맥 기준으로 판단하되,\n해당 계열의 기본 필드(전화1, 주소1)에만 매핑한다.\n전화2 또는 주소2를 임의 생성하지 않는다.\n\n6) 추측 금지\n단독 모호 단어는 매핑하지 말고 null로 둔다.\n\n7) 출력 제한\n반드시 BASE_HEADERS 중 하나로만 매핑한다.\n존재하지 않는 키 생성 금지.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  };
  
  const TIMEOUT_MS = 30000; // 30초 타임아웃
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenAI API 오류]', {
        status: response.status,
        errorText,
      });
      throw new Error('분석 처리 중 오류가 발생했습니다.');
    }
    
    const responseData = await response.json();
    const content = responseData.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('분석 결과를 처리할 수 없습니다.');
    }
    
    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('분석 처리 시간이 초과되었습니다. 다시 시도해주세요.');
    }
    
    throw error;
  }
}
