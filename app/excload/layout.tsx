import type { ReactNode } from 'react';
import { PAGE_SEO } from '@/app/lib/seo-metadata';

export const metadata = PAGE_SEO.home;

export default function ExcloadLayout({ children }: { children: ReactNode }) {
  return children;
}
