import { classifyCoupangHttpError, CoupangApiError } from '@/app/lib/coupang/errors';
import { resolveCoupangTransport } from '@/app/lib/coupang/transport/resolve-transport';

const DEFAULT_TIMEOUT_MS = 60_000;

export type CoupangMoney = {
  currencyCode?: string;
  units?: number;
  nanos?: number;
};

export type CoupangOrderItem = {
  vendorItemId?: number;
  vendorItemName?: string;
  sellerProductName?: string;
  sellerProductItemName?: string;
  productId?: number;
  shippingCount?: number;
  salesPrice?: CoupangMoney;
  orderPrice?: CoupangMoney;
  externalVendorSkuCode?: string;
  canceled?: boolean;
};

export type CoupangOrderSheet = {
  shipmentBoxId?: number;
  orderId?: number;
  orderedAt?: string;
  paidAt?: string;
  status?: string;
  parcelPrintMessage?: string | null;
  orderer?: {
    name?: string;
    email?: string;
    ordererNumber?: string | null;
    safeNumber?: string | null;
  };
  receiver?: {
    name?: string;
    receiverNumber?: string | null;
    safeNumber?: string | null;
    addr1?: string;
    addr2?: string;
    postCode?: string;
  };
  orderItems?: CoupangOrderItem[];
};

type CoupangApiEnvelope<T> = {
  code?: number | string;
  message?: string;
  data?: T;
  nextToken?: string;
};

export async function coupangApiRequest<T>(input: {
  method: string;
  pathWithQuery: string;
  vendorId: string;
  accessKey: string;
  secretKey: string;
  body?: unknown;
  timeoutMs?: number;
}): Promise<T> {
  const transport = resolveCoupangTransport();

  try {
    const { httpStatus, bodyText } = await transport.invoke({
      ...input,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    if (httpStatus < 200 || httpStatus >= 300) {
      throw classifyCoupangHttpError({
        httpStatus,
        bodyText,
        vendorId: input.vendorId,
      });
    }

    let parsed: CoupangApiEnvelope<T>;
    try {
      parsed = JSON.parse(bodyText) as CoupangApiEnvelope<T>;
    } catch {
      throw new CoupangApiError('UNKNOWN', '쿠팡 API 응답을 해석하지 못했습니다.');
    }

    const codeNumber = typeof parsed.code === 'string' ? Number(parsed.code) : parsed.code;
    if (codeNumber && codeNumber >= 400) {
      throw classifyCoupangHttpError({
        httpStatus: codeNumber,
        bodyText: parsed.message ?? bodyText,
        vendorId: input.vendorId,
      });
    }

    return (parsed.data ?? parsed) as T;
  } catch (error) {
    if (error instanceof CoupangApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CoupangApiError(
        'SERVER_DELAY',
        '쿠팡 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    throw error;
  }
}

function formatKstDateTimeParam(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}+09:00`;
}

export function buildRecentOrderSheetQueryRange(days = 7): {
  createdAtFrom: string;
  createdAtTo: string;
} {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    createdAtFrom: formatKstDateTimeParam(from),
    createdAtTo: formatKstDateTimeParam(now),
  };
}

export async function testCoupangConnection(credentials: {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}): Promise<{ ok: true }> {
  const range = buildRecentOrderSheetQueryRange(1);
  const query = new URLSearchParams({
    createdAtFrom: range.createdAtFrom,
    createdAtTo: range.createdAtTo,
    status: 'ACCEPT',
    maxPerPage: '1',
  });
  const pathWithQuery = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(credentials.vendorId)}/ordersheets?${query.toString()}`;

  await coupangApiRequest<CoupangOrderSheet[] | { content?: CoupangOrderSheet[] }>({
    method: 'GET',
    pathWithQuery,
    vendorId: credentials.vendorId,
    accessKey: credentials.accessKey,
    secretKey: credentials.secretKey,
  });

  return { ok: true };
}

export async function fetchCoupangOrderSheets(credentials: {
  vendorId: string;
  accessKey: string;
  secretKey: string;
  statuses?: string[];
  days?: number;
}): Promise<{ orders: CoupangOrderSheet[]; failedStatuses: string[] }> {
  const range = buildRecentOrderSheetQueryRange(credentials.days ?? 7);
  const statuses = credentials.statuses ?? ['ACCEPT', 'INSTRUCT'];
  const orders: CoupangOrderSheet[] = [];
  const failedStatuses: string[] = [];

  for (const status of statuses) {
    try {
      const statusOrders = await fetchCoupangOrderSheetsByStatus({
        ...credentials,
        status,
        createdAtFrom: range.createdAtFrom,
        createdAtTo: range.createdAtTo,
      });
      orders.push(...statusOrders);
    } catch {
      failedStatuses.push(status);
    }
  }

  return { orders: dedupeOrderSheets(orders), failedStatuses };
}

async function fetchCoupangOrderSheetsByStatus(input: {
  vendorId: string;
  accessKey: string;
  secretKey: string;
  status: string;
  createdAtFrom: string;
  createdAtTo: string;
}): Promise<CoupangOrderSheet[]> {
  const collected: CoupangOrderSheet[] = [];
  let nextToken: string | undefined;

  do {
    const query = new URLSearchParams({
      createdAtFrom: input.createdAtFrom,
      createdAtTo: input.createdAtTo,
      status: input.status,
      maxPerPage: '50',
    });
    if (nextToken) query.set('nextToken', nextToken);

    const pathWithQuery = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(input.vendorId)}/ordersheets?${query.toString()}`;
    const data = await coupangApiRequest<CoupangOrderSheet[] | { content?: CoupangOrderSheet[]; nextToken?: string }>({
      method: 'GET',
      pathWithQuery,
      vendorId: input.vendorId,
      accessKey: input.accessKey,
      secretKey: input.secretKey,
    });

    if (Array.isArray(data)) {
      collected.push(...data);
      nextToken = undefined;
    } else {
      collected.push(...(data.content ?? []));
      nextToken = data.nextToken;
    }
  } while (nextToken);

  return collected;
}

function dedupeOrderSheets(orders: CoupangOrderSheet[]): CoupangOrderSheet[] {
  const map = new Map<string, CoupangOrderSheet>();
  for (const order of orders) {
    const key = String(order.shipmentBoxId ?? order.orderId ?? JSON.stringify(order));
    map.set(key, order);
  }
  return [...map.values()];
}
