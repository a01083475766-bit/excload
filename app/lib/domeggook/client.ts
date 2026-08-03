import { assertIntegrationProxyConfigReady, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import { getExcloadOutboundIp } from '@/app/lib/order-integration/malls';

export const DOMEGGOOK_API_ORIGIN = 'https://domeggook.com';
export const DOMEGGOOK_API_PATH = '/ssl/api/';
export const DOMEGGOOK_API_URL = `${DOMEGGOOK_API_ORIGIN}${DOMEGGOOK_API_PATH}`;

export const DOMEGGOOK_USER_AGENT = 'EXCLOAD';
export const DOMEGGOOK_DEVICE = 'Third Party';

/** 주문 목록 페이지당 건수(현재 운영 최대 설정 유지) */
export const DOMEGGOOK_LIST_PAGE_SIZE = 50;
/**
 * 목록 페이지네이션 클라이언트 안전 한도.
 * 스마트스토어 구간별 최대 페이지(`SMARTSTORE_MAX_PAGES_PER_WINDOW = 1000`)와 동일.
 * 초과 시 일부만 반환하지 않고 명시적 오류로 중단한다.
 */
export const DOMEGGOOK_MAX_LIST_PAGES = 1000;

export type DomeggookCredentials = {
  /** 도매꾹 회원 ID */
  memberId: string;
  /** 도매꾹 비밀번호 (평문 — 메모리에서만 사용) */
  password: string;
  /** 도매꾹 API Key */
  apiKey: string;
};

/** 로그인 세션 — 요청 메모리에서만 사용. DB·로그·브라우저 응답에 넣지 않는다. */
export type DomeggookSession = {
  sId: string;
};

export type DomeggookOrderRecord = {
  orderNo: string;
  /** getOrderList/getOrderView의 orderUid — View 호출 시 uid 우선 */
  orderUid: string;
  productName: string;
  productOption: string;
  quantity: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverAddress1: string;
  receiverAddress2: string;
  postalCode: string;
  orderStatus: string;
  orderedAt: string;
  deliveryMemo: string;
  raw: Record<string, unknown>;
};

export type DomeggookHttpFn = (input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}) => Promise<{ httpStatus: number; bodyText: string }>;

type ParsedDomeggookEnvelope = {
  code: string;
  message: string;
  root: unknown;
};

const SUCCESS_CODES = new Set(['0', '00', '200', 'ok', 'success']);

/** sId/cId·비밀번호·API Key가 응답/오류 문구에 섞여도 사용자·로그에 원문이 나가지 않게 한다. */
export function redactDomeggookSecrets(
  text: string,
  secrets: Array<string | null | undefined> = [],
): string {
  let out = text;
  for (const secret of secrets) {
    const value = secret?.trim();
    if (!value || value.length < 2) continue;
    out = out.split(value).join('[보호됨]');
  }
  // 세션 키 패턴 (긴 영숫자)이 JSON 키와 함께 노출된 경우
  out = out
    .replace(/("?(?:sId|cId|sid|cid)"?\s*[:=]\s*")([^"]+)(")/gi, '$1[보호됨]$3')
    .replace(/("?(?:sId|cId|sid|cid)"?\s*[:=]\s*)([^\s,"'{}[\]]+)/gi, '$1[보호됨]');
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function collectObjects(root: unknown): unknown[] {
  const out: unknown[] = [root];
  const queue: unknown[] = [root];
  while (queue.length) {
    const current = queue.shift();
    const record = asRecord(current);
    if (record) {
      for (const value of Object.values(record)) {
        out.push(value);
        if (value && typeof value === 'object') queue.push(value);
      }
      continue;
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        out.push(item);
        if (item && typeof item === 'object') queue.push(item);
      }
    }
  }
  return out;
}

export function resolveDomeggookOutboundIp(explicitIp?: string): string {
  const fromArg = explicitIp?.trim() ?? '';
  if (fromArg) return fromArg;
  const fromEnv = getExcloadOutboundIp();
  if (fromEnv) return fromEnv;
  throw new Error(
    '도매꾹 로그인에 필요한 고정 IP(NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP)가 설정되지 않았습니다. 관리자에게 문의해 주세요.',
  );
}

export function parseDomeggookJsonBody(bodyText: string): unknown {
  const trimmed = bodyText.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('도매꾹 API 응답을 해석하지 못했습니다.');
  }
}

function extractCodeAndMessage(root: unknown): { code: string; message: string } {
  let code = '';
  let message = '';

  for (const node of collectObjects(root)) {
    const record = asRecord(node);
    if (!record) continue;

    if (!code) {
      code = firstString(record.code, record.resultCode, record.errCode, record.errorCode);
    }
    if (!message) {
      message = firstString(
        record.message,
        record.msg,
        record.resultMessage,
        record.errMsg,
        record.errorMessage,
        record.error,
      );
    }
    if (code && message) break;
  }

  return { code, message };
}

export function parseDomeggookEnvelope(bodyText: string): ParsedDomeggookEnvelope {
  const root = parseDomeggookJsonBody(bodyText);
  const { code, message } = extractCodeAndMessage(root);
  return { code, message, root };
}

export function isDomeggookSuccessCode(code: string): boolean {
  if (!code) return true; // 일부 성공 응답은 code 없이 list만 반환
  return SUCCESS_CODES.has(code.trim().toLowerCase());
}

export function extractDomeggookSessionId(root: unknown): string {
  for (const node of collectObjects(root)) {
    const record = asRecord(node);
    if (!record) continue;
    const sId = firstString(record.sId, record.sid, record.SId, record.sessionId);
    if (sId) return sId;
  }
  return '';
}

function looksLikeOrderRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    firstString(
      record.orderNo,
      record.orderUid,
      record.ordNo,
      record.order_no,
      record.oNo,
      record.ono,
      record.dealNo,
    ),
  );
}

/** Domeggook는 1건일 때 items를 객체, 여러 건일 때 배열로 주는 경우가 있다. */
function normalizeItemNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  const single = asRecord(value);
  return single ? [single] : [];
}

/**
 * 수취인(택배 라벨용)은 공식 getOrderView의 items.consumer 를 우선한다.
 * 응답에 없는 필드는 빈 문자열로 두고 임의 생성하지 않는다.
 * buyerInfo는 구매자 정보이므로 수취인 대체로 쓰지 않는다.
 */
function extractReceiverFields(record: Record<string, unknown>): {
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverAddress1: string;
  receiverAddress2: string;
  postalCode: string;
  deliveryMemo: string;
} {
  const consumer = asRecord(record.consumer);

  const addrFull = firstString(consumer?.address, record.recvAddr, record.receiverAddress, record.rcvrAddr);
  const addr1 = firstString(consumer?.addr1);
  const addr2 = firstString(consumer?.addr2);
  const receiverAddress1 = addrFull || addr1;
  const receiverAddress2 = addrFull ? '' : addr2;
  const receiverAddress =
    addrFull || [addr1, addr2].filter(Boolean).join(' ') || firstString(record.recvAddr, record.receiverAddress);

  return {
    receiverName: firstString(consumer?.name, consumer?.nm, record.recvName, record.receiverName, record.rcvrNm),
    // 휴대전화 우선, 없으면 유선
    receiverPhone: firstString(
      consumer?.mobile,
      consumer?.phone,
      consumer?.hp,
      consumer?.tel,
      record.recvPhone,
      record.receiverPhone,
      record.rcvrTel,
    ),
    receiverAddress,
    receiverAddress1,
    receiverAddress2,
    postalCode: firstString(consumer?.zipcode, consumer?.zip, record.zipcode, record.postalCode),
    deliveryMemo: firstString(
      consumer?.deliReq,
      record.orderMemo,
      record.memo,
      record.deliveryMemo,
      record.dlvMsg,
    ),
  };
}

/** getOrderView items.selectOpt.opt — 단건 객체 또는 배열 */
export function formatDomeggookSelectOpt(selectOpt: unknown): string {
  const root = asRecord(selectOpt);
  if (!root) return '';
  const optNodes = normalizeItemNodes(root.opt);
  const parts: string[] = [];
  for (const opt of optNodes) {
    const name = firstString(opt.name, opt.optName, opt.title);
    if (!name) continue;
    const qty = firstString(opt.qty, opt.quantity);
    parts.push(qty && qty !== '1' ? `${name} x${qty}` : name);
  }
  return parts.join(' / ');
}

/** 공식: no 파라미터는 OR 접두 제외 후 숫자만. 알파벳 섞인 값은 숫자로 추정하지 않는다. */
export function toDomeggookOrderNoQueryValue(orderNo: string): string {
  const trimmed = orderNo.trim();
  if (!trimmed) return '';
  const withoutOr = trimmed.replace(/^OR/i, '');
  return /^\d+$/.test(withoutOr) ? withoutOr : '';
}

export function dedupeDomeggookOrders(orders: DomeggookOrderRecord[]): DomeggookOrderRecord[] {
  const seen = new Set<string>();
  const out: DomeggookOrderRecord[] = [];
  for (const order of orders) {
    const key = order.orderUid.trim() || order.orderNo.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(order);
  }
  return out;
}

function parseDomeggookInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

/** header.currentPage / numberOfPages / numberOfItems */
export function extractDomeggookListPagination(root: unknown): {
  currentPage: number | null;
  numberOfPages: number | null;
  numberOfItems: number | null;
} {
  let currentPage: number | null = null;
  let numberOfPages: number | null = null;
  let numberOfItems: number | null = null;

  for (const node of collectObjects(root)) {
    const record = asRecord(node);
    if (!record) continue;
    if (!('currentPage' in record || 'numberOfPages' in record || 'numberOfItems' in record)) {
      continue;
    }
    const cp = parseDomeggookInt(record.currentPage);
    const np = parseDomeggookInt(record.numberOfPages);
    const ni = parseDomeggookInt(record.numberOfItems);
    if (cp != null) currentPage = cp;
    if (np != null) numberOfPages = np;
    if (ni != null) numberOfItems = ni;
  }

  return { currentPage, numberOfPages, numberOfItems };
}

export type DomeggookListPageResult = {
  orders: DomeggookOrderRecord[];
  currentPage: number | null;
  numberOfPages: number | null;
  numberOfItems: number | null;
};

export function extractDomeggookOrderRecords(root: unknown): DomeggookOrderRecord[] {
  const candidates: Record<string, unknown>[] = [];

  for (const node of collectObjects(root)) {
    if (Array.isArray(node)) {
      for (const item of normalizeItemNodes(node)) {
        if (looksLikeOrderRecord(item)) candidates.push(item);
      }
      continue;
    }
    const record = asRecord(node);
    if (!record) continue;
    // 공식 응답 키 items(권장) + 호환 키
    for (const key of ['items', 'list', 'orders', 'orderList', 'rows', 'data']) {
      if (!(key in record)) continue;
      for (const child of normalizeItemNodes(record[key])) {
        if (looksLikeOrderRecord(child)) candidates.push(child);
      }
    }
  }

  const seen = new Set<string>();
  const orders: DomeggookOrderRecord[] = [];

  for (const record of candidates) {
    const orderNo = firstString(
      record.orderNo,
      record.ordNo,
      record.order_no,
      record.oNo,
      record.ono,
      record.dealNo,
    );
    const orderUid = firstString(record.orderUid, record.ordUid, record.uid);
    const dedupeKey = orderNo || orderUid;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const receiver = extractReceiverFields(record);
    const nestedItem = asRecord(record.item);

    orders.push({
      orderNo: orderNo || orderUid,
      orderUid,
      productName: firstString(
        record.itemTitle,
        record.itemName,
        record.itemNm,
        record.productName,
        record.prdNm,
        record.title,
        nestedItem?.title,
        nestedItem?.name,
      ),
      productOption: formatDomeggookSelectOpt(record.selectOpt),
      // 수량 누락 시 1로 채우지 않는다(임의 완성 금지).
      quantity: firstString(record.orderQty, record.qty, record.quantity, record.amount, record.cnt),
      receiverName: receiver.receiverName,
      receiverPhone: receiver.receiverPhone,
      receiverAddress: receiver.receiverAddress,
      receiverAddress1: receiver.receiverAddress1,
      receiverAddress2: receiver.receiverAddress2,
      postalCode: receiver.postalCode,
      orderStatus: firstString(record.status, record.ordStatus, record.stateNm, record.statusName),
      orderedAt: firstString(record.date, record.orderDate, record.ordDt, record.regDate, record.orderedAt),
      deliveryMemo: receiver.deliveryMemo,
      raw: record,
    });
  }

  return orders;
}

export function toUserFacingDomeggookErrorMessage(
  input: {
    httpStatus?: number;
    code?: string;
    message?: string;
  },
  secrets: Array<string | null | undefined> = [],
): string {
  const httpStatus = input.httpStatus;
  const rawMessage = redactDomeggookSecrets(input.message ?? '', secrets);
  const lower = rawMessage.toLowerCase();
  const code = (input.code ?? '').toLowerCase();

  if (httpStatus === 401 || code.includes('aid') || lower.includes('api key') || lower.includes('api키')) {
    return '도매꾹 API Key가 올바르지 않거나 만료되었습니다. API Key를 확인해 주세요.';
  }
  if (
    httpStatus === 403 ||
    lower.includes('권한') ||
    lower.includes('private') ||
    lower.includes('승인') ||
    lower.includes('permission') ||
    lower.includes('forbidden')
  ) {
    return '도매꾹 Private API(판매관리) 권한이 없거나 승인되지 않았습니다. 판매관리·로그인 권한 승인을 확인해 주세요.';
  }
  if (
    httpStatus === 429 ||
    lower.includes('rate') ||
    lower.includes('limit') ||
    lower.includes('호출 제한') ||
    lower.includes('너무 많은')
  ) {
    return '도매꾹 API 호출 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (
    lower.includes('login') ||
    lower.includes('로그인') ||
    lower.includes('password') ||
    lower.includes('비밀번호') ||
    (lower.includes('회원') && lower.includes('없')) ||
    code.includes('login')
  ) {
    return '도매꾹 로그인에 실패했습니다. 회원 ID와 비밀번호를 확인해 주세요.';
  }
  if (rawMessage) {
    return `도매꾹 API 오류: ${rawMessage.slice(0, 200)}`;
  }
  if (httpStatus && (httpStatus < 200 || httpStatus >= 300)) {
    return `도매꾹 API 호출에 실패했습니다. (HTTP ${httpStatus})`;
  }
  return '도매꾹 연동 처리 중 오류가 발생했습니다.';
}

function assertDomeggookHttpAndBody(input: {
  httpStatus: number;
  bodyText: string;
  secrets: Array<string | null | undefined>;
}): ParsedDomeggookEnvelope {
  const envelope = parseDomeggookEnvelope(input.bodyText);
  const secrets = input.secrets;

  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    throw new Error(
      toUserFacingDomeggookErrorMessage(
        { httpStatus: input.httpStatus, code: envelope.code, message: envelope.message },
        secrets,
      ),
    );
  }

  if (!isDomeggookSuccessCode(envelope.code)) {
    throw new Error(
      toUserFacingDomeggookErrorMessage(
        { httpStatus: input.httpStatus, code: envelope.code, message: envelope.message || envelope.code },
        secrets,
      ),
    );
  }

  return envelope;
}

function buildFormBody(params: Record<string, string>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, value);
  }
  return body.toString();
}

function buildQueryUrl(params: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }
  return `${DOMEGGOOK_API_URL}?${query.toString()}`;
}

export async function domeggookSetLogin(input: {
  credentials: DomeggookCredentials;
  outboundIp?: string;
  http?: DomeggookHttpFn;
}): Promise<DomeggookSession> {
  const http = input.http ?? invokeIntegrationHttp;
  if (!input.http) {
    if (!isIntegrationProxyConfigured()) {
      throw new Error('도매꾹 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
    }
    assertIntegrationProxyConfigReady();
  }

  const ip = resolveDomeggookOutboundIp(input.outboundIp);
  const { memberId, password, apiKey } = input.credentials;
  const secrets = [password, apiKey, memberId];

  const body = buildFormBody({
    ver: '4.1',
    mode: 'setLogin',
    aid: apiKey.trim(),
    id: memberId.trim(),
    pw: password,
    om: 'json',
    loginKeep: 'off',
    userAgent: DOMEGGOOK_USER_AGENT,
    ip,
    device: DOMEGGOOK_DEVICE,
  });

  let res: { httpStatus: number; bodyText: string };
  try {
    res = await http({
      method: 'POST',
      url: DOMEGGOOK_API_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
      },
      body,
    });
  } catch {
    throw new Error('도매꾹 로그인 API 네트워크 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const envelope = assertDomeggookHttpAndBody({
    httpStatus: res.httpStatus,
    bodyText: res.bodyText,
    secrets,
  });

  const sId = extractDomeggookSessionId(envelope.root);
  if (!sId) {
    throw new Error('도매꾹 로그인에 성공했으나 세션값을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  return { sId };
}

export async function domeggookGetOrderListPage(input: {
  credentials: DomeggookCredentials;
  session: DomeggookSession;
  day?: number;
  page?: number;
  pageSize?: number;
  http?: DomeggookHttpFn;
}): Promise<DomeggookListPageResult> {
  const http = input.http ?? invokeIntegrationHttp;
  if (!input.http) {
    if (!isIntegrationProxyConfigured()) {
      throw new Error('도매꾹 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
    }
    assertIntegrationProxyConfigReady();
  }

  const { memberId, apiKey } = input.credentials;
  const secrets = [input.credentials.password, apiKey, memberId, input.session.sId];
  const day = Math.max(1, Math.min(input.day ?? 1, 30));
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(input.pageSize ?? DOMEGGOOK_LIST_PAGE_SIZE, DOMEGGOOK_LIST_PAGE_SIZE));

  const url = buildQueryUrl({
    ver: '4.0',
    mode: 'getOrderList',
    aid: apiKey.trim(),
    id: memberId.trim(),
    sId: input.session.sId,
    for: 'sell',
    day: String(day),
    pg: String(page),
    ic: String(pageSize),
    oe: 'utf-8',
    om: 'json',
  });

  let res: { httpStatus: number; bodyText: string };
  try {
    res = await http({
      method: 'GET',
      url,
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      body: null,
    });
  } catch {
    throw new Error('도매꾹 주문 목록 API 네트워크 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const envelope = assertDomeggookHttpAndBody({
    httpStatus: res.httpStatus,
    bodyText: res.bodyText,
    secrets,
  });

  const pagination = extractDomeggookListPagination(envelope.root);
  return {
    orders: extractDomeggookOrderRecords(envelope.root),
    currentPage: pagination.currentPage,
    numberOfPages: pagination.numberOfPages,
    numberOfItems: pagination.numberOfItems,
  };
}

/** 단일 페이지 조회(연결 테스트용). 전체 수집은 domeggookGetAllOrderList 사용. */
export async function domeggookGetOrderList(input: {
  credentials: DomeggookCredentials;
  session: DomeggookSession;
  day?: number;
  page?: number;
  pageSize?: number;
  http?: DomeggookHttpFn;
}): Promise<DomeggookOrderRecord[]> {
  const page = await domeggookGetOrderListPage(input);
  return page.orders;
}

/**
 * getOrderList를 pg=1…numberOfPages까지 순차 조회한다.
 * header가 비정상이거나 안전 한도 초과 시 일부만 반환하지 않고 중단한다.
 */
export async function domeggookGetAllOrderList(input: {
  credentials: DomeggookCredentials;
  session: DomeggookSession;
  day?: number;
  pageSize?: number;
  http?: DomeggookHttpFn;
}): Promise<DomeggookOrderRecord[]> {
  const pageSize = Math.max(1, Math.min(input.pageSize ?? DOMEGGOOK_LIST_PAGE_SIZE, DOMEGGOOK_LIST_PAGE_SIZE));

  const first = await domeggookGetOrderListPage({
    ...input,
    page: 1,
    pageSize,
  });

  if (first.orders.length === 0) {
    if (first.numberOfPages != null && first.numberOfPages > 1) {
      throw new Error(
        '도매꾹 주문 목록 페이지 정보가 올바르지 않습니다. (주문이 없는데 여러 페이지로 표시됨)',
      );
    }
    return [];
  }

  if (first.numberOfPages == null || !Number.isFinite(first.numberOfPages) || first.numberOfPages < 1) {
    throw new Error(
      '도매꾹 주문 목록 페이지 정보(numberOfPages)를 확인할 수 없어 조회를 중단했습니다. 주문이 누락될 수 있어 일부만 반환하지 않습니다.',
    );
  }
  if (first.currentPage != null && first.currentPage !== 1) {
    throw new Error(
      '도매꾹 주문 목록 페이지 정보(currentPage)가 올바르지 않아 조회를 중단했습니다.',
    );
  }
  if (first.numberOfPages > DOMEGGOOK_MAX_LIST_PAGES) {
    throw new Error(
      `도매꾹 주문 목록 페이지 수가 안전 한도(${DOMEGGOOK_MAX_LIST_PAGES}페이지)를 초과해 조회를 중단했습니다.`,
    );
  }

  const collected: DomeggookOrderRecord[] = [...first.orders];

  for (let pg = 2; pg <= first.numberOfPages; pg += 1) {
    if (pg > DOMEGGOOK_MAX_LIST_PAGES) {
      throw new Error(
        `도매꾹 주문 목록 페이지 수가 안전 한도(${DOMEGGOOK_MAX_LIST_PAGES}페이지)를 초과해 조회를 중단했습니다.`,
      );
    }

    const page = await domeggookGetOrderListPage({
      ...input,
      page: pg,
      pageSize,
    });

    if (page.currentPage != null && page.currentPage !== pg) {
      throw new Error(
        `도매꾹 주문 목록 ${pg}페이지 응답의 currentPage가 일치하지 않아 조회를 중단했습니다.`,
      );
    }
    if (page.numberOfPages != null && page.numberOfPages !== first.numberOfPages) {
      throw new Error(
        '도매꾹 주문 목록 총 페이지 수가 조회 중 달라져 조회를 중단했습니다. 주문이 누락될 수 있어 일부만 반환하지 않습니다.',
      );
    }

    collected.push(...page.orders);
  }

  return dedupeDomeggookOrders(collected);
}

/**
 * 판매 주문서 상세 조회 (getOrderView v4.1, for=sell).
 * no 또는 uid 중 하나 필수. 상태 변경 API는 호출하지 않는다.
 */
export async function domeggookGetOrderView(input: {
  credentials: DomeggookCredentials;
  session: DomeggookSession;
  orderNo?: string;
  orderUid?: string;
  http?: DomeggookHttpFn;
}): Promise<DomeggookOrderRecord> {
  const http = input.http ?? invokeIntegrationHttp;
  if (!input.http) {
    if (!isIntegrationProxyConfigured()) {
      throw new Error('도매꾹 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.');
    }
    assertIntegrationProxyConfigReady();
  }

  const { memberId, apiKey } = input.credentials;
  const secrets = [input.credentials.password, apiKey, memberId, input.session.sId];
  const orderUid = input.orderUid?.trim() ?? '';
  const orderNoParam = toDomeggookOrderNoQueryValue(input.orderNo ?? '');

  if (!orderUid && !orderNoParam) {
    throw new Error(
      '도매꾹 주문 상세조회에 필요한 주문 식별값(orderUid 또는 숫자 주문번호)이 없어 조회를 중단했습니다.',
    );
  }

  const params: Record<string, string> = {
    ver: '4.1',
    mode: 'getOrderView',
    aid: apiKey.trim(),
    id: memberId.trim(),
    sId: input.session.sId,
    for: 'sell',
    oe: 'utf-8',
    om: 'json',
  };
  // uid가 있으면 우선 사용(숫자 no 파싱 모호성 회피)
  if (orderUid) {
    params.uid = orderUid;
  } else {
    params.no = orderNoParam;
  }

  const url = buildQueryUrl(params);

  let res: { httpStatus: number; bodyText: string };
  try {
    res = await http({
      method: 'GET',
      url,
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      body: null,
    });
  } catch {
    throw new Error('도매꾹 주문 상세 API 네트워크 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const envelope = assertDomeggookHttpAndBody({
    httpStatus: res.httpStatus,
    bodyText: res.bodyText,
    secrets,
  });

  const orders = extractDomeggookOrderRecords(envelope.root);
  const detail = orders[0];
  if (!detail) {
    throw new Error('도매꾹 주문 상세 응답에서 주문 정보를 찾지 못했습니다.');
  }
  return detail;
}

/**
 * 연결 테스트: setLogin 성공 후 getOrderList까지 성공해야 완료.
 * 주문 0건이어도 정상 응답이면 성공. 상태 변경 API는 호출하지 않는다.
 * 연결 테스트에서는 getOrderView를 호출하지 않는다.
 */
export async function testDomeggookConnection(input: {
  credentials: DomeggookCredentials;
  outboundIp?: string;
  http?: DomeggookHttpFn;
}): Promise<{ ok: true; orderCount: number }> {
  const session = await domeggookSetLogin({
    credentials: input.credentials,
    outboundIp: input.outboundIp,
    http: input.http,
  });

  try {
    const orders = await domeggookGetOrderList({
      credentials: input.credentials,
      session,
      day: 1,
      page: 1,
      pageSize: 10,
      http: input.http,
    });
    return { ok: true, orderCount: orders.length };
  } finally {
    // 세션 참조 제거 의도 — GC 대상. 값 자체는 로그/반환하지 않음.
    (session as { sId?: string }).sId = undefined;
  }
}

export async function fetchDomeggookOrders(input: {
  credentials: DomeggookCredentials;
  days?: number;
  outboundIp?: string;
  http?: DomeggookHttpFn;
}): Promise<DomeggookOrderRecord[]> {
  const session = await domeggookSetLogin({
    credentials: input.credentials,
    outboundIp: input.outboundIp,
    http: input.http,
  });

  try {
    const list = await domeggookGetAllOrderList({
      credentials: input.credentials,
      session,
      day: input.days ?? 1,
      pageSize: DOMEGGOOK_LIST_PAGE_SIZE,
      http: input.http,
    });

    // 주문이 0건이면 상세조회 API를 호출하지 않는다.
    if (list.length === 0) return [];

    // 스마트스토어식 무제한 병렬 금지 — 순차 상세조회. 한 건 실패 시 전체 중단.
    const detailed: DomeggookOrderRecord[] = [];
    for (const order of list) {
      if (!order.orderUid.trim() && !toDomeggookOrderNoQueryValue(order.orderNo)) {
        throw new Error(
          '도매꾹 주문 목록에 상세조회용 식별값(orderUid/숫자 주문번호)이 없는 주문이 있어 조회를 중단했습니다. 불완전한 주문으로 성공 처리하지 않습니다.',
        );
      }

      try {
        const detail = await domeggookGetOrderView({
          credentials: input.credentials,
          session,
          orderNo: order.orderNo,
          orderUid: order.orderUid,
          http: input.http,
        });
        detailed.push(detail);
      } catch (error) {
        const safe = toUserFacingDomeggookClientError(error, [
          input.credentials.password,
          input.credentials.apiKey,
          input.credentials.memberId,
          session.sId,
        ]);
        throw new Error(
          `도매꾹 주문 상세조회에 실패해 전체 주문 조회를 중단했습니다. 빈 수취인 정보로 성공 처리하지 않습니다. (${safe})`,
        );
      }
    }
    return detailed;
  } finally {
    (session as { sId?: string }).sId = undefined;
  }
}

export function toUserFacingDomeggookClientError(
  error: unknown,
  secrets: Array<string | null | undefined> = [],
): string {
  if (error instanceof Error) {
    return redactDomeggookSecrets(error.message, secrets);
  }
  return '도매꾹 연동 처리 중 오류가 발생했습니다.';
}
