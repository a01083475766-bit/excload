import type { ReactNode } from 'react';
import { PAGE_SEO } from '@/app/lib/seo-metadata';

export const metadata = PAGE_SEO.invoiceFileConvert;

export default function InvoiceFileConvertLayout({ children }: { children: ReactNode }) {
  return children;
}
