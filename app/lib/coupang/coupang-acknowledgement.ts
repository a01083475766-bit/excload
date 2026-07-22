import {
  buildCoupangAcknowledgementBodyText,
  isCoupangPositiveIntegerId,
  parseCoupangJson,
} from '@/app/lib/coupang/coupang-json';
import type { CoupangOrderSheet } from '@/app/lib/coupang/client';
import {
  mapCoupangOrdersToFetchViews,
  mapCoupangOrdersToStandardRows,
} from '@/app/lib/coupang/map-coupang-orders';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export const COUPANG_ACKNOWLEDGEMENT_MAX_BATCH = 50;

export const COUPANG_ACKNOWLEDGEMENT_PATH_SUFFIX = '/ordersheets/acknowledgement';

export type CoupangAcknowledgementItemStatus =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'REFETCH_FAILED';

export type CoupangAcknowledgementParsedItem = {
  shipmentBoxId: string;
  succeed: boolean;
  resultCode: string | null;
  resultMessage: string | null;
  retryRequired: boolean | null;
};

export type CoupangAcknowledgementItemResult = {
  shipmentBoxId: string;
  status: CoupangAcknowledgementItemStatus;
  message: string;
  retryRequired: boolean | null;
  refreshedStatus: string | null;
  hubEligible: boolean;
  standardRows: StandardOrderRow[] | null;
  views: OrderFetchView[] | null;
};

export type CoupangAcknowledgementRunResult = {
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  uncertainCount: number;
  results: CoupangAcknowledgementItemResult[];
};

export type ValidateAcknowledgementIdsResult =
  | { ok: true; shipmentBoxIds: string[] }
  | { ok: false; error: string };

const AMBIGUOUS_HTTP_STATUSES = new Set([500, 502, 503, 504, 521]);

function asTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function extractAcknowledgementPayload(parsed: unknown): {
  responseCode: number | null;
  responseMessage: string | null;
  responseList: CoupangAcknowledgementParsedItem[];
} {
  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const record = root as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : record;

  const responseCodeRaw = data.responseCode ?? record.responseCode;
  const responseCode =
    typeof responseCodeRaw === 'number'
      ? responseCodeRaw
      : typeof responseCodeRaw === 'string' && responseCodeRaw.trim()
        ? Number.parseInt(responseCodeRaw, 10)
        : null;

  const responseMessage = asTrimmedString(data.responseMessage ?? record.responseMessage) || null;
  const listRaw = data.responseList ?? record.responseList;
  const responseList: CoupangAcknowledgementParsedItem[] = [];

  if (Array.isArray(listRaw)) {
    for (const entry of listRaw) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const shipmentBoxId = asTrimmedString(row.shipmentBoxId);
      if (!shipmentBoxId) continue;
      responseList.push({
        shipmentBoxId,
        succeed: row.succeed === true,
        resultCode: asTrimmedString(row.resultCode) || null,
        resultMessage: asTrimmedString(row.resultMessage) || null,
        retryRequired: typeof row.retryRequired === 'boolean' ? row.retryRequired : null,
      });
    }
  }

  return {
    responseCode: Number.isFinite(responseCode) ? responseCode : null,
    responseMessage,
    responseList,
  };
}

export function validateAcknowledgementShipmentBoxIds(raw: unknown): ValidateAcknowledgementIdsResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'shipmentBoxIds must be an array.' };
  }
  if (raw.length === 0) {
    return { ok: false, error: '처리할 주문을 선택해 주세요.' };
  }

  const seen = new Set<string>();
  const shipmentBoxIds: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'shipmentBoxId 형식이 올바르지 않습니다.' };
    }
    const trimmed = item.trim();
    if (!isCoupangPositiveIntegerId(trimmed)) {
      return { ok: false, error: 'shipmentBoxId 형식이 올바르지 않습니다.' };
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    shipmentBoxIds.push(trimmed);
  }

  if (shipmentBoxIds.length === 0) {
    return { ok: false, error: '처리할 주문을 선택해 주세요.' };
  }
  if (shipmentBoxIds.length > COUPANG_ACKNOWLEDGEMENT_MAX_BATCH) {
    return {
      ok: false,
      error: `한 번에 최대 ${COUPANG_ACKNOWLEDGEMENT_MAX_BATCH}건만 처리할 수 있습니다.`,
    };
  }

  return { ok: true, shipmentBoxIds };
}

export function buildCoupangAcknowledgementPath(vendorId: string): string {
  return `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(vendorId.trim())}${COUPANG_ACKNOWLEDGEMENT_PATH_SUFFIX}`;
}

export function buildCoupangAcknowledgementRequestBodyText(input: {
  vendorId: string;
  shipmentBoxIds: readonly string[];
}): string {
  return buildCoupangAcknowledgementBodyText(input);
}

export function parseCoupangAcknowledgementResponse(bodyText: string): {
  responseCode: number | null;
  responseMessage: string | null;
  responseList: CoupangAcknowledgementParsedItem[];
} {
  const parsed = parseCoupangJson(bodyText);
  return extractAcknowledgementPayload(parsed);
}

export function mapAcknowledgementItemFromResponse(input: {
  shipmentBoxId: string;
  responseList: readonly CoupangAcknowledgementParsedItem[];
}): CoupangAcknowledgementParsedItem | null {
  const match = input.responseList.find((row) => row.shipmentBoxId === input.shipmentBoxId);
  return match ?? null;
}

function buildRefreshedPayload(sheet: CoupangOrderSheet): {
  standardRows: StandardOrderRow[];
  views: OrderFetchView[];
} {
  const standardRows = mapCoupangOrdersToStandardRows([sheet]).map((row) => ({ ...row }));
  const views = mapCoupangOrdersToFetchViews([sheet]);
  return { standardRows, views };
}

function classifyRefetchedStatus(status: string | undefined): {
  hubEligible: boolean;
  itemStatus: CoupangAcknowledgementItemStatus;
  message: string;
} {
  const code = (status ?? '').trim().toUpperCase();
  if (code === 'INSTRUCT') {
    return {
      hubEligible: true,
      itemStatus: 'SUCCEEDED',
      message: '상품준비중으로 변경되었습니다.',
    };
  }
  if (code === 'ACCEPT') {
    return {
      hubEligible: false,
      itemStatus: 'UNCERTAIN',
      message: '처리 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
  return {
    hubEligible: false,
    itemStatus: 'UNCERTAIN',
    message: `현재 주문 상태(${code || 'UNKNOWN'})는 발송 대기로 분류되지 않습니다.`,
  };
}

async function refetchAndClassify(input: {
  shipmentBoxId: string;
  fetchByBoxId: (shipmentBoxId: string) => Promise<CoupangOrderSheet>;
  ackMessage?: string | null;
  ackFailed?: boolean;
}): Promise<CoupangAcknowledgementItemResult> {
  try {
    const sheet = await input.fetchByBoxId(input.shipmentBoxId);
    const status = (sheet.status ?? '').trim().toUpperCase();
    const classified = classifyRefetchedStatus(status);
    const payload = classified.hubEligible ? buildRefreshedPayload(sheet) : null;

    if (input.ackFailed && classified.itemStatus === 'SUCCEEDED') {
      return {
        shipmentBoxId: input.shipmentBoxId,
        status: 'SUCCEEDED',
        message: input.ackMessage ?? classified.message,
        retryRequired: null,
        refreshedStatus: status,
        hubEligible: true,
        standardRows: payload?.standardRows ?? null,
        views: payload?.views ?? null,
      };
    }

    return {
      shipmentBoxId: input.shipmentBoxId,
      status: classified.itemStatus,
      message: input.ackMessage ?? classified.message,
      retryRequired: null,
      refreshedStatus: status,
      hubEligible: classified.hubEligible,
      standardRows: payload?.standardRows ?? null,
      views: payload?.views ?? null,
    };
  } catch {
    return {
      shipmentBoxId: input.shipmentBoxId,
      status: 'REFETCH_FAILED',
      message: '처리는 성공했으나 최신 주문정보 확인에 실패했습니다.',
      retryRequired: null,
      refreshedStatus: null,
      hubEligible: false,
      standardRows: null,
      views: null,
    };
  }
}

export function isAmbiguousAcknowledgementHttpStatus(httpStatus: number): boolean {
  return AMBIGUOUS_HTTP_STATUSES.has(httpStatus) || httpStatus === 0;
}

export async function runCoupangAcknowledgement(input: {
  vendorId: string;
  shipmentBoxIds: readonly string[];
  patchAcknowledgement: (bodyText: string) => Promise<{ httpStatus: number; bodyText: string }>;
  fetchByBoxId: (shipmentBoxId: string) => Promise<CoupangOrderSheet>;
  preflightByBoxId?: (shipmentBoxId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}): Promise<CoupangAcknowledgementRunResult> {
  const shipmentBoxIds = [...input.shipmentBoxIds];
  const results: CoupangAcknowledgementItemResult[] = [];

  for (const shipmentBoxId of shipmentBoxIds) {
    if (input.preflightByBoxId) {
      const preflight = await input.preflightByBoxId(shipmentBoxId);
      if (!preflight.ok) {
        results.push({
          shipmentBoxId,
          status: 'FAILED',
          message: preflight.message,
          retryRequired: null,
          refreshedStatus: null,
          hubEligible: false,
          standardRows: null,
          views: null,
        });
      }
    }
  }

  const eligibleIds = shipmentBoxIds.filter(
    (id) => !results.some((row) => row.shipmentBoxId === id),
  );

  if (eligibleIds.length === 0) {
    return summarizeAcknowledgementResults(shipmentBoxIds.length, results);
  }

  const bodyText = buildCoupangAcknowledgementRequestBodyText({
    vendorId: input.vendorId,
    shipmentBoxIds: eligibleIds,
  });

  let httpStatus = 0;
  let responseBodyText = '';
  let transportError = false;

  try {
    const response = await input.patchAcknowledgement(bodyText);
    httpStatus = response.httpStatus;
    responseBodyText = response.bodyText;
  } catch {
    transportError = true;
  }

  if (transportError || isAmbiguousAcknowledgementHttpStatus(httpStatus)) {
    for (const shipmentBoxId of eligibleIds) {
      results.push(
        await refetchAndClassify({
          shipmentBoxId,
          fetchByBoxId: input.fetchByBoxId,
          ackFailed: true,
        }),
      );
    }
    return summarizeAcknowledgementResults(shipmentBoxIds.length, results);
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    for (const shipmentBoxId of eligibleIds) {
      results.push({
        shipmentBoxId,
        status: 'FAILED',
        message: '상품준비중 처리 요청이 거부되었습니다.',
        retryRequired: null,
        refreshedStatus: null,
        hubEligible: false,
        standardRows: null,
        views: null,
      });
    }
    return summarizeAcknowledgementResults(shipmentBoxIds.length, results);
  }

  let parsed;
  try {
    parsed = parseCoupangAcknowledgementResponse(responseBodyText);
  } catch {
    for (const shipmentBoxId of eligibleIds) {
      results.push(
        await refetchAndClassify({
          shipmentBoxId,
          fetchByBoxId: input.fetchByBoxId,
          ackFailed: true,
        }),
      );
    }
    return summarizeAcknowledgementResults(shipmentBoxIds.length, results);
  }

  for (const shipmentBoxId of eligibleIds) {
    const item = mapAcknowledgementItemFromResponse({
      shipmentBoxId,
      responseList: parsed.responseList,
    });

    if (!item || item.shipmentBoxId !== shipmentBoxId || item.succeed !== true) {
      const message =
        item?.resultMessage ||
        (item ? '상품준비중 처리에 실패했습니다.' : '응답에서 처리 결과를 확인하지 못했습니다.');
      results.push({
        shipmentBoxId,
        status: 'FAILED',
        message,
        retryRequired: item?.retryRequired ?? null,
        refreshedStatus: null,
        hubEligible: false,
        standardRows: null,
        views: null,
      });
      continue;
    }

    const refetched = await refetchAndClassify({
      shipmentBoxId,
      fetchByBoxId: input.fetchByBoxId,
      ackMessage: item.resultMessage,
    });
    results.push({
      ...refetched,
      retryRequired: item.retryRequired,
    });
  }

  return summarizeAcknowledgementResults(shipmentBoxIds.length, results);
}

function summarizeAcknowledgementResults(
  requestedCount: number,
  results: CoupangAcknowledgementItemResult[],
): CoupangAcknowledgementRunResult {
  let succeededCount = 0;
  let failedCount = 0;
  let uncertainCount = 0;

  for (const row of results) {
    if (row.status === 'SUCCEEDED') succeededCount += 1;
    else if (row.status === 'FAILED' || row.status === 'REFETCH_FAILED') failedCount += 1;
    else uncertainCount += 1;
  }

  return {
    requestedCount,
    succeededCount,
    failedCount,
    uncertainCount,
    results,
  };
}

/** 묶음배송번호 기준으로 조회 결과 행·뷰를 최신 데이터로 교체하고 rowIndex를 재부여한다. */
export function mergeCoupangRefetchedOrdersIntoFetchResult(input: {
  rows: StandardOrderRow[];
  views: OrderFetchView[];
  patches: ReadonlyArray<{
    shipmentBoxId: string;
    standardRows: StandardOrderRow[];
    views: OrderFetchView[];
  }>;
}): { rows: StandardOrderRow[]; views: OrderFetchView[] } {
  let rows = [...input.rows];
  let views = [...input.views];

  for (const patch of input.patches) {
    const boxId = patch.shipmentBoxId.trim();
    if (!boxId) continue;

    const remainingIndexes: number[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const bundleId = String(rows[index]?.['묶음배송번호'] ?? '').trim();
      if (bundleId !== boxId) remainingIndexes.push(index);
    }

    const keptRows = remainingIndexes.map((index) => rows[index]!);
    const keptViews = remainingIndexes.map((index) => views[index]!);
    rows = [...keptRows, ...patch.standardRows];
    views = [...keptViews, ...patch.views];
  }

  const reindexedViews = views.map((view, rowIndex) => ({
    ...view,
    rowIndex,
  }));

  return { rows, views: reindexedViews };
}
