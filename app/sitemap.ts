import type { MetadataRoute } from 'next';

/** 검색엔진에 노출할 공개 페이지 9개 — url 필드에 전체 URL을 명시 */
const PUBLIC_SITEMAP_ENTRIES: {
  url: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  priority: number;
}[] = [
  { url: 'https://www.excload.com/', changeFrequency: 'weekly', priority: 1 },
  { url: 'https://www.excload.com/order-convert', changeFrequency: 'weekly', priority: 0.9 },
  { url: 'https://www.excload.com/logistics-convert', changeFrequency: 'weekly', priority: 0.9 },
  { url: 'https://www.excload.com/invoice-file-convert', changeFrequency: 'weekly', priority: 0.9 },
  { url: 'https://www.excload.com/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { url: 'https://www.excload.com/user-guide', changeFrequency: 'monthly', priority: 0.7 },
  { url: 'https://www.excload.com/about', changeFrequency: 'monthly', priority: 0.7 },
  { url: 'https://www.excload.com/contact', changeFrequency: 'monthly', priority: 0.6 },
  { url: 'https://www.excload.com/feedback-event', changeFrequency: 'weekly', priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_SITEMAP_ENTRIES.filter(
    (entry): entry is typeof entry & { url: string } =>
      typeof entry.url === 'string' && entry.url.trim().length > 0,
  ).map(({ url, changeFrequency, priority }) => ({
    url: url.trim(),
    lastModified,
    changeFrequency,
    priority,
  }));
}
