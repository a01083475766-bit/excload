import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.excload.com';

/** 검색엔진에 노출할 공개 페이지만 포함 (내부·인증·결제·작성 페이지 제외) */
const PUBLIC_PAGES: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/order-convert', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/logistics-convert', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/invoice-file-convert', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/user-guide', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/feedback-event', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE_URL}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
