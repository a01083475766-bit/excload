import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  /**
   * 운영 공식 도메인은 apex(excload.com)입니다.
   * 호스트 정규화는 여기서만 처리해 middleware와 중복 리다이렉트가 나지 않게 합니다.
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.excload.com' }],
        destination: 'https://excload.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
