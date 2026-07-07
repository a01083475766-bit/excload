/**
 * 고도몰 partner_key — 엑클로드 공통 env 우선, 계정별 override(개발·테스트) 선택
 */
export function resolveGodomallPartnerKey(partnerKeyOverride?: string | null): string {
  const override = partnerKeyOverride?.trim();
  if (override) return override;

  const fromEnv = process.env.GODOMALL_PARTNER_KEY?.trim();
  if (!fromEnv) {
    throw new Error(
      'GODOMALL_PARTNER_KEY 환경 변수가 설정되지 않았습니다. Vercel env 등록 또는 개발용 partner_key override를 사용하세요.',
    );
  }

  return fromEnv;
}

export function isGodomallPartnerKeyConfigured(): boolean {
  return Boolean(process.env.GODOMALL_PARTNER_KEY?.trim());
}
