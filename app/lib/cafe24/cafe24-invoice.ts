import {
  CAFE24_TRACKING_NO_MAX_LENGTH,
  type Cafe24ClientCredentials,
  type Cafe24CreateShipmentRequest,
  type Cafe24Shipment,
  type Cafe24Carrier,
} from '@/app/lib/cafe24/client';
import {
  createCafe24CarrierListCache,
  resolveCafe24ShippingCompanyCode,
} from '@/app/lib/cafe24/cafe24-carrier-resolve';
import {
  CAFE24_REAUTH_SCOPE_MESSAGE,
  hasAllCafe24RequiredScopes,
} from '@/app/lib/cafe24/scopes';

function parseCafe24ErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { error?: string; error_description?: string; message?: string };
    if (parsed.error_description) return parsed.error_description;
    if (parsed.message) return parsed.message;
    if (parsed.error) return `카페24 API 오류 (${parsed.error})`;
  } catch {
    // ignore
  }
  return null;
}

export type Cafe24InvoiceOutcomeKind = 'success' | 'failure' | 'unknown';

export type Cafe24InvoiceTransmitResult = {
  outcomeKind: Cafe24InvoiceOutcomeKind;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  providerRequestId: string | null;
  responseSummary: {
    httpStatus: number | null;
    providerStatusCode: string | null;
    message: string | null;
    shippingCode?: string | null;
    shipmentStatus?: string | null;
  };
};

const SHOP_NO_PREFIX = 'shop_no:';

export function extractCafe24ShopNoFromMallLineItemIds(
  mallLineItemIds: readonly string[] | null | undefined,
): number {
  if (!mallLineItemIds?.length) return 1;
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (!value.startsWith(SHOP_NO_PREFIX)) continue;
    const n = Number.parseInt(value.slice(SHOP_NO_PREFIX.length), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

export function extractCafe24OrderItemCodes(
  mallLineItemIds: readonly string[] | null | undefined,
): string[] {
  if (!mallLineItemIds?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (!value || value.startsWith(SHOP_NO_PREFIX) || value.startsWith('bundle:')) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildCafe24ShopNoMallLineItemId(shopNo: number): string {
  return `${SHOP_NO_PREFIX}${shopNo > 0 ? shopNo : 1}`;
}

export function normalizeCafe24TrackingNo(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function shipmentOrderItemCodes(shipment: Cafe24Shipment): string[] {
  const codes = new Set<string>();
  if (Array.isArray(shipment.order_item_code)) {
    for (const c of shipment.order_item_code) {
      const v = String(c ?? '').trim();
      if (v) codes.add(v);
    }
  } else if (shipment.order_item_code) {
    const v = String(shipment.order_item_code).trim();
    if (v) codes.add(v);
  }
  for (const item of shipment.items ?? []) {
    const v = String(item.order_item_code ?? '').trim();
    if (v) codes.add(v);
  }
  return [...codes];
}

function trackingEquals(a: string, b: string): boolean {
  return normalizeCafe24TrackingNo(a) === normalizeCafe24TrackingNo(b);
}

export function findMatchingCafe24Shipment(input: {
  shipments: readonly Cafe24Shipment[];
  trackingNo: string;
  shippingCompanyCode: string;
  orderItemCodes: readonly string[];
}): Cafe24Shipment | null {
  const wantedItems = new Set(input.orderItemCodes.map((c) => c.trim()).filter(Boolean));
  for (const shipment of input.shipments) {
    if (!trackingEquals(shipment.tracking_no ?? '', input.trackingNo)) continue;
    if (String(shipment.shipping_company_code ?? '').trim() !== input.shippingCompanyCode.trim()) {
      continue;
    }
    if (wantedItems.size === 0) return shipment;
    const have = shipmentOrderItemCodes(shipment);
    if (have.length === 0) return shipment;
    if (have.some((c) => wantedItems.has(c))) return shipment;
  }
  return null;
}

export function findConflictingCafe24Shipment(input: {
  shipments: readonly Cafe24Shipment[];
  trackingNo: string;
  orderItemCodes: readonly string[];
}): Cafe24Shipment | null {
  const wantedItems = new Set(input.orderItemCodes.map((c) => c.trim()).filter(Boolean));
  for (const shipment of input.shipments) {
    const existingTracking = normalizeCafe24TrackingNo(shipment.tracking_no);
    if (!existingTracking) continue;
    if (trackingEquals(existingTracking, input.trackingNo)) continue;
    const have = shipmentOrderItemCodes(shipment);
    if (wantedItems.size === 0) {
      // 품주 정보가 없으면 주문 단위 다른 송장을 충돌로 본다
      return shipment;
    }
    if (have.length === 0 || have.some((c) => wantedItems.has(c))) {
      return shipment;
    }
  }
  return null;
}

export function mapCafe24ShipmentVerifyStatus(status: string | null | undefined): {
  verifyKind: 'confirmed' | 'standby' | 'pending' | 'conflict';
  label: string;
} {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'shipping' || normalized === 'shipped') {
    return { verifyKind: 'confirmed', label: normalized };
  }
  if (normalized === 'standby') {
    return { verifyKind: 'standby', label: 'standby' };
  }
  return { verifyKind: 'pending', label: normalized || 'unknown' };
}

export function buildCafe24CreateShipmentBody(input: {
  shopNo: number;
  trackingNo: string;
  shippingCompanyCode: string;
  orderItemCodes: string[];
}): Cafe24CreateShipmentRequest {
  return {
    shop_no: input.shopNo > 0 ? input.shopNo : 1,
    request: {
      tracking_no: input.trackingNo,
      shipping_company_code: input.shippingCompanyCode,
      order_item_code: input.orderItemCodes,
      status: 'shipping',
    },
  };
}

export function classifyCafe24ShipmentHttpError(httpStatus: number): {
  errorCode: string;
  message: string;
  retryable: boolean;
  outcomeKind: Cafe24InvoiceOutcomeKind;
} {
  if (httpStatus === 401) {
    return {
      errorCode: 'REAUTH_REQUIRED',
      message: '카페24 인증이 만료되었습니다. 다시 연동해 주세요.',
      retryable: false,
      outcomeKind: 'failure',
    };
  }
  if (httpStatus === 403) {
    return {
      errorCode: 'SCOPE_INSUFFICIENT',
      message: CAFE24_REAUTH_SCOPE_MESSAGE,
      retryable: false,
      outcomeKind: 'failure',
    };
  }
  if (httpStatus === 422) {
    return {
      errorCode: 'VALIDATION_ERROR',
      message: '주문상태·송장번호·배송사 코드 검증에 실패했습니다.',
      retryable: false,
      outcomeKind: 'failure',
    };
  }
  if (httpStatus === 429) {
    return {
      errorCode: 'RATE_LIMITED',
      message: '카페24 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
      retryable: true,
      outcomeKind: 'failure',
    };
  }
  if (httpStatus >= 500 && httpStatus <= 599) {
    return {
      errorCode: 'PROVIDER_SERVER_ERROR',
      message: '카페24 서버 오류로 전송 결과를 확정할 수 없습니다.',
      retryable: true,
      outcomeKind: 'unknown',
    };
  }
  return {
    errorCode: 'HTTP_ERROR',
    message: `카페24 송장 등록에 실패했습니다. (HTTP ${httpStatus})`,
    retryable: false,
    outcomeKind: 'failure',
  };
}

function failure(input: {
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  outcomeKind?: Cafe24InvoiceOutcomeKind;
  httpStatus?: number | null;
}): Cafe24InvoiceTransmitResult {
  return {
    outcomeKind: input.outcomeKind ?? 'failure',
    success: false,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryable: input.retryable ?? false,
    providerRequestId: null,
    responseSummary: {
      httpStatus: input.httpStatus ?? null,
      providerStatusCode: input.errorCode,
      message: input.errorMessage,
    },
  };
}

export type RunCafe24InvoiceTransmissionInput = {
  credentials: Cafe24ClientCredentials;
  accessToken: string;
  tokenScopes?: string[] | null;
  mallOrderNo: string;
  mallLineItemIds: string[] | null;
  courierCode: string | null;
  courierName: string | null;
  trackingNumber: string;
  fetchCarriers: (shopNo: number) => Promise<Cafe24Carrier[]>;
  fetchShipments: (input: { orderId: string; shopNo: number }) => Promise<Cafe24Shipment[]>;
  postShipment: (input: {
    orderId: string;
    body: Cafe24CreateShipmentRequest;
  }) => Promise<{ httpStatus: number; bodyText: string }>;
  /** 동일 요청 묶음에서 carriers 재사용 */
  carrierCache?: ReturnType<typeof createCafe24CarrierListCache>;
  accountCacheKey?: string;
};

export async function runCafe24InvoiceTransmission(
  input: RunCafe24InvoiceTransmissionInput,
): Promise<Cafe24InvoiceTransmitResult> {
  if (!hasAllCafe24RequiredScopes(input.tokenScopes ?? [])) {
    return failure({
      errorCode: 'SCOPE_INSUFFICIENT',
      errorMessage: CAFE24_REAUTH_SCOPE_MESSAGE,
    });
  }

  const orderId = String(input.mallOrderNo ?? '').trim();
  if (!orderId) {
    return failure({
      errorCode: 'MALL_ORDER_NO_MISSING',
      errorMessage: '카페24 주문번호가 없어 송장을 전송할 수 없습니다.',
    });
  }

  const trackingNo = normalizeCafe24TrackingNo(input.trackingNumber);
  if (!trackingNo) {
    return failure({
      errorCode: 'TRACKING_NUMBER_MISSING',
      errorMessage: '송장번호가 없습니다.',
    });
  }
  if (trackingNo.length > CAFE24_TRACKING_NO_MAX_LENGTH) {
    return failure({
      errorCode: 'TRACKING_NUMBER_INVALID',
      errorMessage: `송장번호는 ${CAFE24_TRACKING_NO_MAX_LENGTH}자 이하여야 합니다.`,
    });
  }

  const orderItemCodes = extractCafe24OrderItemCodes(input.mallLineItemIds);
  if (orderItemCodes.length === 0) {
    return failure({
      errorCode: 'ORDER_ITEM_CODE_MISSING',
      errorMessage: '카페24 품주코드(order_item_code)가 없어 송장을 전송할 수 없습니다.',
    });
  }

  const shopNo = extractCafe24ShopNoFromMallLineItemIds(input.mallLineItemIds);
  const cache = input.carrierCache ?? createCafe24CarrierListCache();
  const cacheKey = `${input.accountCacheKey ?? input.credentials.mallId}:${shopNo}`;

  let carriers: Cafe24Carrier[];
  try {
    carriers = await cache.get(cacheKey, () => input.fetchCarriers(shopNo));
  } catch (error) {
    const message = error instanceof Error ? error.message : '배송사 목록 조회에 실패했습니다.';
    if (/권한|403|쓰기|다시 연동/i.test(message)) {
      return failure({ errorCode: 'SCOPE_INSUFFICIENT', errorMessage: CAFE24_REAUTH_SCOPE_MESSAGE });
    }
    return failure({
      errorCode: 'CARRIER_LIST_FAILED',
      errorMessage: '카페24 배송사 목록 조회에 실패했습니다.',
      retryable: true,
    });
  }

  const courier = resolveCafe24ShippingCompanyCode({
    carriers,
    courierCode: input.courierCode,
    courierName: input.courierName,
  });
  if (!courier.ok) {
    return failure({ errorCode: courier.errorCode, errorMessage: courier.message });
  }

  let shipments: Cafe24Shipment[];
  try {
    shipments = await input.fetchShipments({ orderId, shopNo });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/401|인증/i.test(message)) {
      return failure({
        errorCode: 'REAUTH_REQUIRED',
        errorMessage: '카페24 인증이 만료되었습니다. 다시 연동해 주세요.',
      });
    }
    return failure({
      errorCode: 'SHIPMENT_LOOKUP_FAILED',
      errorMessage: '카페24 배송정보 조회에 실패했습니다.',
      retryable: true,
    });
  }

  const conflict = findConflictingCafe24Shipment({
    shipments,
    trackingNo,
    orderItemCodes,
  });
  if (conflict) {
    return failure({
      errorCode: 'SHIPMENT_CONFLICT',
      errorMessage: '해당 품주에 다른 송장이 이미 등록되어 있습니다.',
      httpStatus: 409,
    });
  }

  const existing = findMatchingCafe24Shipment({
    shipments,
    trackingNo,
    shippingCompanyCode: courier.shippingCompanyCode,
    orderItemCodes,
  });
  if (existing) {
    const mapped = mapCafe24ShipmentVerifyStatus(existing.status);
    return {
      outcomeKind: 'success',
      success: true,
      errorCode: null,
      errorMessage: null,
      retryable: false,
      providerRequestId: existing.shipping_code ?? null,
      responseSummary: {
        httpStatus: 200,
        providerStatusCode: 'IDEMPOTENT_SUCCESS',
        message: '이미 동일한 송장이 등록되어 있습니다.',
        shippingCode: existing.shipping_code ?? null,
        shipmentStatus: mapped.label,
      },
    };
  }

  const body = buildCafe24CreateShipmentBody({
    shopNo,
    trackingNo,
    shippingCompanyCode: courier.shippingCompanyCode,
    orderItemCodes,
  });

  const posted = await input.postShipment({ orderId, body });
  if (posted.httpStatus < 200 || posted.httpStatus >= 300) {
    const classified = classifyCafe24ShipmentHttpError(posted.httpStatus);
    const apiMessage = parseCafe24ErrorMessage(posted.bodyText);
    return failure({
      errorCode: classified.errorCode,
      errorMessage: apiMessage ?? classified.message,
      retryable: classified.retryable,
      outcomeKind: classified.outcomeKind,
      httpStatus: posted.httpStatus,
    });
  }

  // POST 성공 후 재조회로 확인. 즉시 반영 안 되면 unknown(확인대기) — 영구 실패 아님.
  try {
    const after = await input.fetchShipments({ orderId, shopNo });
    const matched = findMatchingCafe24Shipment({
      shipments: after,
      trackingNo,
      shippingCompanyCode: courier.shippingCompanyCode,
      orderItemCodes,
    });
    if (matched) {
      const mapped = mapCafe24ShipmentVerifyStatus(matched.status);
      return {
        outcomeKind: 'success',
        success: true,
        errorCode: null,
        errorMessage: null,
        retryable: false,
        providerRequestId: matched.shipping_code ?? null,
        responseSummary: {
          httpStatus: posted.httpStatus,
          providerStatusCode: mapped.label,
          message: '카페24 송장 등록이 완료되었습니다.',
          shippingCode: matched.shipping_code ?? null,
          shipmentStatus: mapped.label,
        },
      };
    }
  } catch {
    // fall through to unknown
  }

  return {
    outcomeKind: 'unknown',
    success: false,
    errorCode: 'VERIFY_PENDING',
    errorMessage: '송장 등록 요청은 전송됐으나 배송정보 반영을 아직 확인하지 못했습니다. 상태 확인을 다시 실행해 주세요.',
    retryable: true,
    providerRequestId: null,
    responseSummary: {
      httpStatus: posted.httpStatus,
      providerStatusCode: 'VERIFY_PENDING',
      message: '송장 등록 후 확인 대기',
    },
  };
}
