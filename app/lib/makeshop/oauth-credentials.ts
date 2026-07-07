/**
 * 메이크샵 APP Client ID/Secret — 엑클로드 공통 env 우선, 계정별 override(개발·테스트) 선택
 */
export type MakeshopOAuthEnv = {
  clientId?: string;
  clientSecret?: string;
};

export function resolveMakeshopClientId(clientIdOverride?: string | null): string {
  const override = clientIdOverride?.trim();
  if (override) return override;

  const fromEnv = process.env.MAKESHOP_CLIENT_ID?.trim();
  if (!fromEnv) {
    throw new Error(
      'MAKESHOP_CLIENT_ID 환경 변수가 설정되지 않았습니다. Vercel env 등록 또는 개발용 Client ID override를 사용하세요.',
    );
  }

  return fromEnv;
}

export function resolveMakeshopClientSecret(clientSecretOverride?: string | null): string {
  const override = clientSecretOverride?.trim();
  if (override) return override;

  const fromEnv = process.env.MAKESHOP_CLIENT_SECRET?.trim();
  if (!fromEnv) {
    throw new Error(
      'MAKESHOP_CLIENT_SECRET 환경 변수가 설정되지 않았습니다. Vercel env 등록 또는 개발용 Client Secret override를 사용하세요.',
    );
  }

  return fromEnv;
}

export function isMakeshopOAuthConfigured(): boolean {
  return Boolean(process.env.MAKESHOP_CLIENT_ID?.trim() && process.env.MAKESHOP_CLIENT_SECRET?.trim());
}
