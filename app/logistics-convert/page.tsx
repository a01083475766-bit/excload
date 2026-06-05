import { PAGE_SEO } from '@/app/lib/seo-metadata';
import { LogisticsConvertClient } from './LogisticsConvertClient';

export const metadata = PAGE_SEO.logisticsConvert;

export default function LogisticsConvertPage() {
  return <LogisticsConvertClient />;
}
