import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.excload.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/akman/',
        '/admin/',
        '/api/',
        '/auth/',
        '/mypage/',
        '/history/',
        '/payment/',
        '/toss/',
        '/subscribe/',
        '/trial/',
        '/order/',
        '/setting/',
        '/login/',
        '/feedback-event/',
        '/beta-feedback/',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
