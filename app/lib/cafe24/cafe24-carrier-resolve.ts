import type { Cafe24Carrier } from '@/app/lib/cafe24/client';
import { resolveCommonCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';

/** 엑클로드 공통 택배사 → Cafe24 shipping_company_code 기본표 (carriers 조회 실패 시 fallback 아님 — 매칭 보조). */
export const CAFE24_DEFAULT_SHIPPING_COMPANY_CODES: Record<string, string> = {
  CJ: '0004',
  HANJIN: '0002',
  LOTTE: '0018',
  LOGEN: '0007',
  EPOST: '0001',
};

const CARRIER_NAME_HINTS: Record<string, string[]> = {
  CJ: ['CJ', '대한통운', '씨제이'],
  HANJIN: ['한진'],
  LOTTE: ['롯데', '현대택배'],
  LOGEN: ['로젠'],
  EPOST: ['우체국', '우정'],
};

function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function carrierDisplayName(carrier: Cafe24Carrier): string {
  return String(carrier.shipping_company_name ?? carrier.company_name ?? '').trim();
}

/**
 * 쇼핑몰 carriers 목록에서 엑클로드 택배사를 하나의 shipping_company_code로 확정.
 * 정확히 하나로 매칭되지 않으면 null (호출부에서 COURIER_CODE_UNMAPPED).
 */
export function resolveCafe24ShippingCompanyCode(input: {
  carriers: readonly Cafe24Carrier[];
  courierCode?: string | null;
  courierName?: string | null;
}): { ok: true; shippingCompanyCode: string } | { ok: false; errorCode: 'COURIER_CODE_UNMAPPED'; message: string } {
  const common = resolveCommonCourierCode({
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!common) {
    return {
      ok: false,
      errorCode: 'COURIER_CODE_UNMAPPED',
      message: '지원하지 않는 택배사입니다. 카페24 배송사 코드로 변환할 수 없습니다.',
    };
  }

  const expectedDefault = CAFE24_DEFAULT_SHIPPING_COMPANY_CODES[common];
  const hints = CARRIER_NAME_HINTS[common] ?? [];
  const matches = new Set<string>();

  for (const carrier of input.carriers) {
    const code = String(carrier.shipping_company_code ?? '').trim();
    if (!code) continue;
    if (expectedDefault && code === expectedDefault) {
      matches.add(code);
      continue;
    }
    const name = normalizeLabel(carrierDisplayName(carrier));
    if (!name) continue;
    if (hints.some((hint) => name.includes(normalizeLabel(hint)))) {
      matches.add(code);
    }
  }

  if (matches.size === 1) {
    return { ok: true, shippingCompanyCode: [...matches][0]! };
  }

  // carriers에 없더라도 공식 기본 코드가 있고 목록이 비어 있으면 기본 코드 사용하지 않음 —
  // 사용자 요구: carriers 기준 + 임의 추측 금지. 단, 목록에 기본 코드가 있으면 위에서 잡힘.
  if (matches.size === 0 && expectedDefault && input.carriers.length === 0) {
    // 목록 조회 실패/빈 목록: 정적 표만으로는 추측 금지
    return {
      ok: false,
      errorCode: 'COURIER_CODE_UNMAPPED',
      message: '카페24 배송사 목록을 확인할 수 없어 택배사 코드를 확정하지 못했습니다.',
    };
  }

  if (matches.size === 0 && expectedDefault) {
    // 목록은 있으나 이름 매칭 실패 — 기본 코드가 목록에 있으면 이미 matches에 들어감.
    // 목록에 기본 코드가 없으면 추측하지 않음.
    return {
      ok: false,
      errorCode: 'COURIER_CODE_UNMAPPED',
      message: '카페24 배송사 목록에서 해당 택배사를 하나로 특정하지 못했습니다.',
    };
  }

  return {
    ok: false,
    errorCode: 'COURIER_CODE_UNMAPPED',
    message: '카페24 배송사 코드가 여러 개와 매칭되어 자동 전송할 수 없습니다.',
  };
}

/** 요청(account) 단위 carriers 캐시 */
export function createCafe24CarrierListCache() {
  const cache = new Map<string, Promise<Cafe24Carrier[]>>();
  return {
    get(key: string, loader: () => Promise<Cafe24Carrier[]>): Promise<Cafe24Carrier[]> {
      const existing = cache.get(key);
      if (existing) return existing;
      const pending = loader().catch((error) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, pending);
      return pending;
    },
  };
}
