import type { ReactNode } from 'react';
import { PAGE_SEO } from '@/app/lib/seo-metadata';

export const metadata = PAGE_SEO.pricing;

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
