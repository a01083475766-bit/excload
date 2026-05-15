/**
 * 배포·로컬 공통 기준 URL (결제 리다이렉트·이메일 링크 등)
 */
export function getPublicBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, '')}`;
  }
  return 'http://localhost:3000';
}
