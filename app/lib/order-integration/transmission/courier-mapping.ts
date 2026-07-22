import type { OrderIntegrationProvider } from '@prisma/client';

const NORMALIZED_COMMON_COURIERS: Record<string, string[]> = {
  CJ: ['CJ', 'CJ대한통운', '대한통운', '씨제이대한통운'],
  HANJIN: ['HANJIN', '한진', '한진택배'],
  LOTTE: ['LOTTE', '롯데', '롯데택배', '롯데글로벌로지스'],
  LOGEN: ['LOGEN', '로젠', '로젠택배'],
  EPOST: ['EPOST', '우체국', '우체국택배', '우정사업본부'],
};

const PROVIDER_COURIER_CODES: Record<OrderIntegrationProvider, Record<string, string>> = {
  COUPANG: { CJ: 'CJGLS', HANJIN: 'HANJIN', LOTTE: 'HYUNDAI', LOGEN: 'KGB', EPOST: 'EPOST' },
  SMARTSTORE: { CJ: 'CJGLS', HANJIN: 'HANJIN', LOTTE: 'LOTTE', LOGEN: 'KGB', EPOST: 'EPOST' },
  ELEVEN: { CJ: '00034', HANJIN: '00005', LOTTE: '00008', LOGEN: '00006', EPOST: '00001' },
  CAFE24: { CJ: '0004', HANJIN: '0002', LOTTE: '0018', LOGEN: '0007', EPOST: '0001' },
  LOTTEON: { CJ: 'CJGLS', HANJIN: 'HANJIN', LOTTE: 'LOTTE', LOGEN: 'LOGEN', EPOST: 'EPOST' },
  SSG: { CJ: 'CJGLS', HANJIN: 'HANJIN', LOTTE: 'LOTTE', LOGEN: 'LOGEN', EPOST: 'EPOST' },
  CJONSTYLE: { CJ: 'CJGLS', HANJIN: 'HANJIN', LOTTE: 'LOTTE', LOGEN: 'LOGEN', EPOST: 'EPOST' },
  SHOPBY: { CJ: 'CJGLS', HANJIN: 'HANJIN', LOTTE: 'LOTTE', LOGEN: 'LOGEN', EPOST: 'EPOST' },
  GODOMALL: { CJ: 'cjgls', HANJIN: 'hanjin', LOTTE: 'lotte', LOGEN: 'logen', EPOST: 'epost' },
  MAKESHOP: { CJ: 'CJ', HANJIN: 'HANJIN', LOTTE: 'LOTTE', LOGEN: 'LOGEN', EPOST: 'EPOST' },
  SHOPIFY: { CJ: 'CJ Logistics', HANJIN: 'Hanjin', LOTTE: 'Lotte Global Logistics', LOGEN: 'Logen', EPOST: 'Korea Post' },
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

export function resolveCommonCourierCode(input: {
  courierCode?: string | null;
  courierName?: string | null;
}): string | null {
  const code = normalizeText(input.courierCode);
  if (code && NORMALIZED_COMMON_COURIERS[code]) return code;

  const name = normalizeText(input.courierName);
  if (!name) return null;
  for (const [commonCode, aliases] of Object.entries(NORMALIZED_COMMON_COURIERS)) {
    if (aliases.some((alias) => name.includes(normalizeText(alias)))) return commonCode;
  }
  return null;
}

export function resolveProviderCourierCode(input: {
  provider: OrderIntegrationProvider;
  courierCode?: string | null;
  courierName?: string | null;
}): string | null {
  const commonCode = resolveCommonCourierCode(input);
  if (!commonCode) return null;
  return PROVIDER_COURIER_CODES[input.provider][commonCode] ?? null;
}
