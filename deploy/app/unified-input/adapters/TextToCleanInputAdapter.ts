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

  // 29개 기준헤더를 헤더로 구성
  const headers = Object.keys(data.orders[0] || {});

  const rows = data.orders.map((order: any) =>
    headers.map((key) => order[key] ?? '')
  );

  return {
    headers,
    rows,
    sourceType: 'text' as const,
  };
}
