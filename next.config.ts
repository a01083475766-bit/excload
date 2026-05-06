import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  /**
   * OAuth는 시작한 호스트의 쿠키(state/CSRF)에 의존합니다.
   * apex(excload.com)에서 시작하고 콜백만 www인 경우 NextAuth가 OAuthCallback로 실패할 수 있어
   * 운영 도메인을 www로 통일합니다. (localhost·미리보기 호스트는 영향 없음)
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'excload.com' }],
        destination: 'https://www.excload.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
