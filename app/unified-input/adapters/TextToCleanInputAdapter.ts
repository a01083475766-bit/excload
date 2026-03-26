import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';

export async function runTextToCleanInputAdapter(text: string) {
  if (!text || text.trim() === '') {
    throw new Error('텍스트가 비어있습니다.');
  }

  const response = await fetch('/api/ai-gateway', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'normalize-29',
      text,
    }),
  });

  if (!response.ok) {
    throw new Error('normalize-29 호출 실패');
  }

  const data = await response.json();

  if (!data?.orders || !Array.isArray(data.orders)) {
    throw new Error('normalize-29 응답 형식 오류');
  }

  const rows = data.orders.map((order: any) =>
    BASE_HEADERS.map((header) => order[header] ?? '')
  );

  console.log('[TEXT → ROWS]', {
    headers: BASE_HEADERS,
    sampleRow: rows[0],
  });

  return {
    headers: BASE_HEADERS,
    rows,
    sourceType: 'text' as const,
  };
}
