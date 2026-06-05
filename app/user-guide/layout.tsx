import type { ReactNode } from 'react';
import { PAGE_SEO } from '@/app/lib/seo-metadata';

export const metadata = PAGE_SEO.userGuide;

export default function UserGuideLayout({ children }: { children: ReactNode }) {
  return children;
}
