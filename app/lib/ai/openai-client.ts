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
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('시스템 설정 오류가 발생했습니다.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4.1-mini',
        input: prompt,
      }),
    });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OpenAI ERROR]', errorText);
    throw new Error('OpenAI API 호출 실패');
  }

  const data = await response.json();
  let text = '';

  // 1) output_text 우선
  if (typeof data.output_text === 'string') {
    text = data.output_text;
  }

  // 2) output 배열 fallback
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c?.type === 'output_text' && c.text) {
            text = c.text;
            break;
          }
        }
      }
      if (text) break;
    }
  }

  if (!text) {
    console.error('[OpenAI RAW RESPONSE]', JSON.stringify(data, null, 2));
    throw new Error('OpenAI 응답 파싱 실패');
  }

  return text;
}
