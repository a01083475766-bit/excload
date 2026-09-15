import { PAGE_SEO } from '@/app/lib/seo-metadata';
import { OrderConvertClient } from '@/app/order-convert/OrderConvertClient';

export const metadata = PAGE_SEO.macroFormat;

export default function MacroFormatPage() {
  return <OrderConvertClient variant="macro" />;
}
