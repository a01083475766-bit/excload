export type SalesChannel = 'coupang' | 'smartstore' | 'ndelivery' | 'shopee' | 'manual';

export type CoupangSaleType = 'marketplace' | 'rocket';
export type CoupangCategoryId =
  | 'electronics'
  | 'household'
  | 'food'
  | 'fashion'
  | 'beauty'
  | 'other'
  | 'custom';
export type CoupangSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SellerTier = 'micro' | 'small1' | 'small2' | 'general';
export type InflowPathId =
  | 'shopping-search'
  | 'smartstore-direct'
  | 'brand-marketing'
  | 'shopping-live'
  | 'external-sns'
  | 'custom';

export const SALES_CHANNELS: { id: SalesChannel; label: string; shortLabel: string }[] = [
  { id: 'coupang', label: '쿠팡', shortLabel: '쿠팡' },
  { id: 'smartstore', label: '네이버 스마트스토어', shortLabel: '스마트스토어' },
  { id: 'ndelivery', label: '네이버 N배송', shortLabel: 'N배송' },
  { id: 'shopee', label: '쇼피', shortLabel: '쇼피' },
  { id: 'manual', label: '직접 입력', shortLabel: '직접 입력' },
];

export const COUPANG_SALE_TYPES: { id: CoupangSaleType; label: string }[] = [
  { id: 'marketplace', label: '마켓플레이스' },
  { id: 'rocket', label: '로켓그로스' },
];

export const COUPANG_CATEGORIES: { id: CoupangCategoryId; label: string; fee: number }[] = [
  { id: 'electronics', label: '가전/디지털', fee: 7.8 },
  { id: 'household', label: '생활용품', fee: 7.8 },
  { id: 'food', label: '식품', fee: 10.6 },
  { id: 'fashion', label: '패션', fee: 10.5 },
  { id: 'beauty', label: '뷰티', fee: 9.6 },
  { id: 'other', label: '기타', fee: 10.8 },
  { id: 'custom', label: '직접 입력', fee: 0 },
];

export const COUPANG_ROCKET_SIZES: {
  id: CoupangSize;
  label: string;
  outboundFee: number;
  storageFeePerDay: number;
}[] = [
  { id: 'small', label: '소', outboundFee: 1400, storageFeePerDay: 12 },
  { id: 'medium', label: '중', outboundFee: 2200, storageFeePerDay: 16 },
  { id: 'large', label: '대', outboundFee: 3800, storageFeePerDay: 24 },
  { id: 'xlarge', label: '특대', outboundFee: 5800, storageFeePerDay: 40 },
];

export const SELLER_TIERS: { id: SellerTier; label: string; orderFee: number }[] = [
  { id: 'micro', label: '영세', orderFee: 0.91 },
  { id: 'small1', label: '중소1', orderFee: 1.81 },
  { id: 'small2', label: '중소2', orderFee: 2.73 },
  { id: 'general', label: '일반', orderFee: 3.63 },
];

export const INFLOW_PATHS: { id: InflowPathId; label: string; fee: number }[] = [
  { id: 'shopping-search', label: '네이버쇼핑 검색', fee: 2.73 },
  { id: 'smartstore-direct', label: '스마트스토어 직접 유입', fee: 1 },
  { id: 'brand-marketing', label: '브랜드 마케팅', fee: 2 },
  { id: 'shopping-live', label: '쇼핑라이브', fee: 2 },
  { id: 'external-sns', label: '외부 유입 / SNS', fee: 0.91 },
  { id: 'custom', label: '직접 입력', fee: 0 },
];

export const SHOPEE_DEFAULT_SALES_FEE = 5;

export const N_DELIVERY_DEFAULTS = {
  outboundFee: '1800',
  storageFee: '',
  packagingFee: '',
  logisticsOther: '',
};

export function getCoupangCategoryFee(categoryId: CoupangCategoryId) {
  return COUPANG_CATEGORIES.find((item) => item.id === categoryId)?.fee ?? 0;
}

export function getSellerTierFee(tier: SellerTier) {
  return SELLER_TIERS.find((item) => item.id === tier)?.orderFee ?? 0;
}

export function getInflowPathFee(pathId: InflowPathId) {
  return INFLOW_PATHS.find((item) => item.id === pathId)?.fee ?? 0;
}

export function getCoupangRocketSize(sizeId: CoupangSize) {
  return COUPANG_ROCKET_SIZES.find((item) => item.id === sizeId);
}

export function sumFeeRates(sales: number, payment: number, other: number) {
  const total = sales + payment + other;
  return Math.round(total * 100) / 100;
}

export function getChannelDefaultFees(channel: SalesChannel, options: {
  coupangCategory: CoupangCategoryId;
  sellerTier: SellerTier;
  inflowPath: InflowPathId;
}) {
  switch (channel) {
    case 'coupang':
      return {
        salesFeeRate: String(getCoupangCategoryFee(options.coupangCategory)),
        paymentFeeRate: '0',
        otherFeeRate: '0',
      };
    case 'smartstore':
    case 'ndelivery':
      return {
        salesFeeRate: String(getSellerTierFee(options.sellerTier)),
        paymentFeeRate: String(getInflowPathFee(options.inflowPath)),
        otherFeeRate: '0',
      };
    case 'shopee':
      return {
        salesFeeRate: String(SHOPEE_DEFAULT_SALES_FEE),
        paymentFeeRate: '0',
        otherFeeRate: '0',
      };
    case 'manual':
    default:
      return {
        salesFeeRate: '',
        paymentFeeRate: '',
        otherFeeRate: '',
      };
  }
}
