/**
 * 엑클로드 공용 Cafe24 앱 자격증명 (서버 전용).
 * 브라우저·API 응답에 Secret을 내려주지 않는다.
 */

export type Cafe24SharedAppCredentials = {
  clientId: string;
  clientSecret: string;
  source: 'env';
};

export function readCafe24SharedAppCredentials(): Cafe24SharedAppCredentials | null {
  const clientId = process.env.CAFE24_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.CAFE24_CLIENT_SECRET?.trim() ?? '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, source: 'env' };
}

export function isCafe24SharedAppConfigured(): boolean {
  return readCafe24SharedAppCredentials() != null;
}
