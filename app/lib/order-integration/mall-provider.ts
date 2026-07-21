import type { OrderIntegrationProvider } from '@prisma/client';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

/** mallId(URL·UI) → Prisma OrderIntegrationProvider */
export function orderIntegrationProviderForMallId(
  mallId: string,
): OrderIntegrationProvider | null {
  switch (mallId as OrderIntegrationMallId) {
    case 'coupang':
      return 'COUPANG';
    case 'eleven':
      return 'ELEVEN';
    case 'smartstore':
      return 'SMARTSTORE';
    case 'cafe24':
      return 'CAFE24';
    case 'lotteon':
      return 'LOTTEON';
    case 'ssg':
      return 'SSG';
    case 'cjonstyle':
      return 'CJONSTYLE';
    case 'shopby':
      return 'SHOPBY';
    case 'godomall':
      return 'GODOMALL';
    case 'makeshop':
      return 'MAKESHOP';
    default:
      return null;
  }
}
