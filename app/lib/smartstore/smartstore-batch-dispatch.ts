import { createHash } from 'node:crypto';

import {
  SMARTSTORE_DISPATCH_MAX_BATCH,
  type SmartstoreDispatchProductOrderRequest,
  type SmartstoreProductOrderDetail,
} from '@/app/lib/smartstore/client';
import {
  buildSmartstoreDispatchDate,
  classifySmartstoreDispatchPreflight,
  chunkDispatchItems,
  extractSmartstoreDispatchProductOrderIds,
  isAmbiguousDispatchHttpStatus,
  isSafeSmartstoreTrackingNumber,
  parseSmartstoreDispatchResponse,
  resolveSmartstoreDeliveryCompanyCode,
} from '@/app/lib/smartstore/smartstore-invoice';
import { normalizeFingerprintTrackingNumber } from '@/app/lib/order-integration/transmission/fingerprint';
import type {
  ShipmentTransmissionCandidate,
  ShipmentTransmissionItemResultStatus,
  ShipmentTransmissionItemResultSummary,
  ShipmentTransmissionResponseSummary,
} from '@/app/lib/order-integration/transmission/types';
import { sanitizeTransmissionErrorMessage } from '@/app/lib/order-integration/transmission/repository';

export type SmartstoreBatchMatchEntry = {
  matchId: string;
  candidate: ShipmentTransmissionCandidate;
  /** 이전 attempt에 저장된 productOrderId별 결과(동일 계정 범위) */
  priorItemResults: ShipmentTransmissionItemResultSummary[];
};

export type SmartstoreBatchMatchOutcome = {
  matchId: string;
  outcomeKind: 'success' | 'failure' | 'unknown';
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  responseSummary: ShipmentTransmissionResponseSummary;
  itemResults: ShipmentTransmissionItemResultSummary[];
  /**
   * 이 Match의 productOrderId가 네이버 dispatch POST 본문에
   * 한 번이라도 포함됐는지. preflight/충돌/NOT_ATTEMPTED만이면 false.
   */
  externallyPosted: boolean;
};

function trim(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** userId+accountId+productOrderId+courier+tracking — 원문 주소·시크릿 없음 */
export function buildSmartstoreItemShipmentFingerprint(input: {
  userId: string;
  integrationAccountId: string;
  productOrderId: string;
  deliveryCompanyCode: string;
  trackingNumber: string;
}): string {
  const canonical = [
    `userId=${trim(input.userId)}`,
    `accountId=${trim(input.integrationAccountId)}`,
    `productOrderId=${trim(input.productOrderId)}`,
    `courier=${trim(input.deliveryCompanyCode).toUpperCase()}`,
    `tracking=${normalizeFingerprintTrackingNumber(input.trackingNumber)}`,
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function parseSmartstoreItemResultsFromSummary(
  summary: unknown,
): ShipmentTransmissionItemResultSummary[] {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return [];
  const record = summary as Record<string, unknown>;
  if (!Array.isArray(record.itemResults)) return [];
  const out: ShipmentTransmissionItemResultSummary[] = [];
  for (const raw of record.itemResults) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const productOrderId = trim(row.productOrderId);
    const shipmentFingerprint = trim(row.shipmentFingerprint);
    const status = trim(row.status) as ShipmentTransmissionItemResultStatus;
    if (!productOrderId || !shipmentFingerprint || !status) continue;
    out.push({
      productOrderId,
      status,
      providerCode: row.providerCode == null ? null : trim(row.providerCode).slice(0, 64),
      message: row.message == null ? null : sanitizeTransmissionErrorMessage(String(row.message)),
      shipmentFingerprint,
    });
  }
  return out;
}

function mapRuntimeStatusToPersisted(
  status: string,
): ShipmentTransmissionItemResultStatus {
  switch (status) {
    case 'DISPATCHED':
      return 'SUCCESS';
    case 'ALREADY_DISPATCHED':
      return 'ALREADY_DISPATCHED';
    case 'ORDER_CONFIRMATION_REQUIRED':
      return 'ORDER_CONFIRMATION_REQUIRED';
    case 'ORDER_STATE_NOT_ELIGIBLE':
      return 'STATE_NOT_ELIGIBLE';
    case 'FAILED':
      return 'FAILED';
    case 'UNCERTAIN':
      return 'UNCERTAIN';
    case 'CONFLICT':
      return 'CONFLICT';
    case 'CARRIER_MAPPING_REQUIRED':
      return 'CARRIER_MAPPING_REQUIRED';
    case 'NOT_ATTEMPTED':
      return 'NOT_ATTEMPTED';
    default:
      return 'UNCERTAIN';
  }
}

function aggregateMatchFromItems(
  itemResults: ShipmentTransmissionItemResultSummary[],
): Pick<
  SmartstoreBatchMatchOutcome,
  'outcomeKind' | 'success' | 'errorCode' | 'errorMessage'
> {
  if (itemResults.length === 0) {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: 'NO_ITEMS',
      errorMessage: '송장 전송 대상 상품주문이 없습니다.',
    };
  }
  const allOk = itemResults.every(
    (row) => row.status === 'SUCCESS' || row.status === 'ALREADY_DISPATCHED',
  );
  if (allOk) {
    const allAlready = itemResults.every((row) => row.status === 'ALREADY_DISPATCHED');
    return {
      outcomeKind: 'success',
      success: true,
      errorCode: allAlready ? 'ALREADY_DISPATCHED' : null,
      errorMessage: allAlready
        ? '이미 동일 송장정보로 발송 처리된 주문입니다.'
        : null,
    };
  }
  const anyUncertain = itemResults.some((row) => row.status === 'UNCERTAIN');
  const anyNotAttempted = itemResults.some((row) => row.status === 'NOT_ATTEMPTED');
  const anySuccess = itemResults.some(
    (row) => row.status === 'SUCCESS' || row.status === 'ALREADY_DISPATCHED',
  );
  // NOT_ATTEMPTED만 있으면 미호출 실패(불확실 아님). 성공/불확실과 섞이면 unknown.
  if (anyUncertain || (anySuccess && anyNotAttempted) || (anySuccess && !allOk)) {
    return {
      outcomeKind: 'unknown',
      success: false,
      errorCode: anyUncertain ? 'UNCERTAIN' : 'PARTIAL_ERROR',
      errorMessage: anyUncertain
        ? '일부 상품주문의 전송 여부를 확인하지 못했습니다. 자동으로 다시 전송하지 않습니다.'
        : '일부만 처리되어 확인이 필요합니다. 자동으로 다시 전송하지 않습니다.',
    };
  }
  if (anyNotAttempted && !anySuccess && !anyUncertain) {
    return {
      outcomeKind: 'failure',
      success: false,
      errorCode: 'NOT_ATTEMPTED',
      errorMessage: '아직 전송하지 않았습니다. 이전 묶음 오류로 요청하지 않았습니다.',
    };
  }
  const preferred =
    itemResults.find((row) => row.status === 'ORDER_CONFIRMATION_REQUIRED') ??
    itemResults.find((row) => row.status === 'CONFLICT') ??
    itemResults.find((row) => row.status === 'CARRIER_MAPPING_REQUIRED') ??
    itemResults.find((row) => row.status === 'STATE_NOT_ELIGIBLE') ??
    itemResults[0]!;
  return {
    outcomeKind: 'failure',
    success: false,
    errorCode: preferred.status,
    errorMessage: preferred.message ?? '송장 전송에 실패했습니다.',
  };
}

type PlannedTarget = {
  productOrderId: string;
  deliveryCompanyCode: string;
  trackingNumber: string;
  shipmentFingerprint: string;
  matchIds: string[];
  mallOrderNoByMatchId: Map<string, string>;
};

/**
 * 동일 SMARTSTORE account의 여러 Match를 모아:
 * - 교차 Match 중복/충돌 검사
 * - 이전 성공 fingerprint skip
 * - 최대 30건씩 순차 dispatch
 * - 결과를 Match별로 재연결
 */
export async function runSmartstoreCrossMatchBatchDispatch(input: {
  userId: string;
  integrationAccountId: string;
  entries: SmartstoreBatchMatchEntry[];
  fetchByIds: (productOrderIds: readonly string[]) => Promise<SmartstoreProductOrderDetail[]>;
  dispatchBatch: (
    items: ReadonlyArray<SmartstoreDispatchProductOrderRequest>,
  ) => Promise<{ httpStatus: number; bodyText: string }>;
  now?: () => Date;
}): Promise<SmartstoreBatchMatchOutcome[]> {
  const itemResultsByMatch = new Map<string, ShipmentTransmissionItemResultSummary[]>();
  for (const entry of input.entries) {
    itemResultsByMatch.set(entry.matchId, []);
  }

  const pushItem = (
    matchId: string,
    item: ShipmentTransmissionItemResultSummary,
  ) => {
    const list = itemResultsByMatch.get(matchId) ?? [];
    list.push(item);
    itemResultsByMatch.set(matchId, list);
  };

  // 1) Match별 courier/tracking 검증 + productOrderId 수집
  type Link = {
    matchId: string;
    productOrderId: string;
    deliveryCompanyCode: string;
    trackingNumber: string;
    mallOrderNo: string;
    fingerprint: string;
  };
  const links: Link[] = [];

  for (const entry of input.entries) {
    const courier = resolveSmartstoreDeliveryCompanyCode({
      courierCode: entry.candidate.courierCode,
      courierName: entry.candidate.courierName,
    });
    const productOrderIds = extractSmartstoreDispatchProductOrderIds(
      entry.candidate.mallLineItemIds,
    );
    if (productOrderIds.length === 0) {
      pushItem(entry.matchId, {
        productOrderId: '_missing',
        status: 'FAILED',
        providerCode: 'PRODUCT_ORDER_ID_MISSING',
        message: '상품주문번호가 없어 송장 전송할 수 없습니다.',
        shipmentFingerprint: 'missing-po',
      });
      continue;
    }
    if (!courier.ok) {
      for (const productOrderId of productOrderIds) {
        pushItem(entry.matchId, {
          productOrderId,
          status: 'CARRIER_MAPPING_REQUIRED',
          providerCode: 'COURIER_UNSUPPORTED',
          message: courier.message,
          shipmentFingerprint: 'carrier-unresolved',
        });
      }
      continue;
    }
    if (!isSafeSmartstoreTrackingNumber(entry.candidate.trackingNumber)) {
      for (const productOrderId of productOrderIds) {
        pushItem(entry.matchId, {
          productOrderId,
          status: 'FAILED',
          providerCode: 'TRACKING_NUMBER_INVALID',
          message: '송장번호가 올바르지 않습니다.',
          shipmentFingerprint: 'tracking-invalid',
        });
      }
      continue;
    }

    const trackingNumber = entry.candidate.trackingNumber.trim();
    for (const productOrderId of productOrderIds) {
      const fingerprint = buildSmartstoreItemShipmentFingerprint({
        userId: input.userId,
        integrationAccountId: input.integrationAccountId,
        productOrderId,
        deliveryCompanyCode: courier.deliveryCompanyCode,
        trackingNumber,
      });
      links.push({
        matchId: entry.matchId,
        productOrderId,
        deliveryCompanyCode: courier.deliveryCompanyCode,
        trackingNumber,
        mallOrderNo: entry.candidate.mallOrderNo,
        fingerprint,
      });
    }
  }

  // 2) 교차 Match 충돌/중복 (account 범위)
  const byPo = new Map<string, Link[]>();
  for (const link of links) {
    const list = byPo.get(link.productOrderId) ?? [];
    list.push(link);
    byPo.set(link.productOrderId, list);
  }

  const conflictedPoIds = new Set<string>();
  const planned = new Map<string, PlannedTarget>(); // key = fingerprint

  for (const [productOrderId, poLinks] of byPo) {
    const uniqueShipments = new Map<string, Link>();
    for (const link of poLinks) {
      const key = `${link.deliveryCompanyCode}|${normalizeFingerprintTrackingNumber(link.trackingNumber)}`;
      const existing = uniqueShipments.get(key);
      if (!existing) uniqueShipments.set(key, link);
    }
    if (uniqueShipments.size > 1) {
      conflictedPoIds.add(productOrderId);
      for (const link of poLinks) {
        pushItem(link.matchId, {
          productOrderId,
          status: 'CONFLICT',
          providerCode: 'SHIPMENT_CONFLICT',
          message:
            '같은 상품주문번호에 서로 다른 송장·택배사가 연결되어 전송하지 않았습니다.',
          shipmentFingerprint: link.fingerprint,
        });
      }
      continue;
    }

    const representative = [...uniqueShipments.values()][0]!;
    const matchIds = [...new Set(poLinks.map((link) => link.matchId))];
    const mallOrderNoByMatchId = new Map(
      poLinks.map((link) => [link.matchId, link.mallOrderNo] as const),
    );
    planned.set(representative.fingerprint, {
      productOrderId,
      deliveryCompanyCode: representative.deliveryCompanyCode,
      trackingNumber: representative.trackingNumber,
      shipmentFingerprint: representative.fingerprint,
      matchIds,
      mallOrderNoByMatchId,
    });
  }

  // 3) 이전 성공 fingerprint skip
  const priorSuccess = new Map<string, ShipmentTransmissionItemResultSummary>();
  for (const entry of input.entries) {
    for (const prior of entry.priorItemResults) {
      if (
        (prior.status === 'SUCCESS' || prior.status === 'ALREADY_DISPATCHED') &&
        prior.shipmentFingerprint
      ) {
        priorSuccess.set(`${prior.productOrderId}|${prior.shipmentFingerprint}`, prior);
      }
    }
  }

  const dispatchTargets: PlannedTarget[] = [];
  for (const target of planned.values()) {
    if (conflictedPoIds.has(target.productOrderId)) continue;

    const priorKey = `${target.productOrderId}|${target.shipmentFingerprint}`;
    const prior = priorSuccess.get(priorKey);
    if (prior) {
      for (const matchId of target.matchIds) {
        pushItem(matchId, {
          productOrderId: target.productOrderId,
          status: 'ALREADY_DISPATCHED',
          providerCode: 'PRIOR_SUCCESS',
          message: '동일 송장 성공 이력이 있어 다시 전송하지 않았습니다.',
          shipmentFingerprint: target.shipmentFingerprint,
        });
      }
      continue;
    }

    // 성공 이력은 있으나 fingerprint가 다르면 충돌
    const priorAnySuccess = [...priorSuccess.values()].find(
      (row) => row.productOrderId === target.productOrderId,
    );
    if (priorAnySuccess && priorAnySuccess.shipmentFingerprint !== target.shipmentFingerprint) {
      for (const matchId of target.matchIds) {
        pushItem(matchId, {
          productOrderId: target.productOrderId,
          status: 'CONFLICT',
          providerCode: 'PRIOR_SHIPMENT_CONFLICT',
          message:
            '이전에 다른 송장정보로 전송된 상품주문입니다. 송장 연결을 확인해 주세요.',
          shipmentFingerprint: target.shipmentFingerprint,
        });
      }
      continue;
    }

    dispatchTargets.push(target);
  }

  // 4) 상태 재조회
  const idsToFetch = [...new Set(dispatchTargets.map((row) => row.productOrderId))];
  let detailById = new Map<string, SmartstoreProductOrderDetail>();
  if (idsToFetch.length > 0) {
    try {
      const details = await input.fetchByIds(idsToFetch);
      detailById = new Map(
        details
          .map((detail) => {
            const id = trim(detail.productOrder?.productOrderId);
            return id ? ([id, detail] as const) : null;
          })
          .filter((row): row is readonly [string, SmartstoreProductOrderDetail] => Boolean(row)),
      );
    } catch {
      for (const target of dispatchTargets) {
        for (const matchId of target.matchIds) {
          pushItem(matchId, {
            productOrderId: target.productOrderId,
            status: 'UNCERTAIN',
            providerCode: 'PROVIDER_STATUS_UNKNOWN',
            message: '발송 전 주문 상태 조회에 실패하여 송장 전송을 중단했습니다.',
            shipmentFingerprint: target.shipmentFingerprint,
          });
        }
      }
      return finalizeOutcomes(input.entries, itemResultsByMatch, new Set());
    }
  }

  const eligibleTargets: PlannedTarget[] = [];
  for (const target of dispatchTargets) {
    const detail = detailById.get(target.productOrderId) ?? null;
    const expectedOrderNo =
      target.mallOrderNoByMatchId.get(target.matchIds[0]!) ?? '';
    const decision = classifySmartstoreDispatchPreflight({
      detail,
      requestedProductOrderId: target.productOrderId,
      expectedMallOrderNo: expectedOrderNo,
      requestedTrackingNumber: target.trackingNumber,
      requestedDeliveryCompanyCode: target.deliveryCompanyCode,
    });

    if (decision.action === 'ALREADY_DISPATCHED') {
      for (const matchId of target.matchIds) {
        pushItem(matchId, {
          productOrderId: target.productOrderId,
          status: 'ALREADY_DISPATCHED',
          providerCode: null,
          message: decision.message,
          shipmentFingerprint: target.shipmentFingerprint,
        });
      }
      continue;
    }
    if (decision.action === 'BLOCK') {
      const status = mapRuntimeStatusToPersisted(
        decision.status === 'ORDER_STATE_NOT_ELIGIBLE'
          ? 'ORDER_STATE_NOT_ELIGIBLE'
          : decision.status === 'ORDER_CONFIRMATION_REQUIRED'
            ? 'ORDER_CONFIRMATION_REQUIRED'
            : decision.status === 'UNCERTAIN'
              ? 'UNCERTAIN'
              : 'FAILED',
      );
      for (const matchId of target.matchIds) {
        pushItem(matchId, {
          productOrderId: target.productOrderId,
          status,
          providerCode: decision.errorCode,
          message: decision.message,
          shipmentFingerprint: target.shipmentFingerprint,
        });
      }
      continue;
    }
    eligibleTargets.push(target);
  }

  // 5) 30건 chunk 순차 dispatch. 묶음 오류 시 이후는 NOT_ATTEMPTED로 보존.
  const chunks = chunkDispatchItems(eligibleTargets, SMARTSTORE_DISPATCH_MAX_BATCH);
  const now = input.now?.() ?? new Date();
  const dispatchDate = buildSmartstoreDispatchDate(now);
  let stopFurtherChunks = false;
  /** 실제 dispatch POST 본문에 포함된 Match (호출 직전 기록) */
  const externallyPostedMatchIds = new Set<string>();

  for (const chunk of chunks) {
    if (stopFurtherChunks) {
      for (const target of chunk) {
        for (const matchId of target.matchIds) {
          pushItem(matchId, {
            productOrderId: target.productOrderId,
            status: 'NOT_ATTEMPTED',
            providerCode: 'BATCH_STOPPED',
            message: '이전 묶음 오류로 이 상품주문은 요청하지 않았습니다.',
            shipmentFingerprint: target.shipmentFingerprint,
          });
        }
      }
      continue;
    }

    const requestItems: SmartstoreDispatchProductOrderRequest[] = chunk.map((target) => ({
      productOrderId: target.productOrderId,
      deliveryMethod: 'DELIVERY',
      deliveryCompanyCode: target.deliveryCompanyCode,
      trackingNumber: target.trackingNumber,
      dispatchDate,
    }));

    for (const target of chunk) {
      for (const matchId of target.matchIds) {
        externallyPostedMatchIds.add(matchId);
      }
    }

    let httpStatus = 0;
    let bodyText = '';
    let transportError = false;
    try {
      const response = await input.dispatchBatch(requestItems);
      httpStatus = response.httpStatus;
      bodyText = response.bodyText;
    } catch {
      transportError = true;
    }

    if (transportError || isAmbiguousDispatchHttpStatus(httpStatus)) {
      for (const target of chunk) {
        for (const matchId of target.matchIds) {
          pushItem(matchId, {
            productOrderId: target.productOrderId,
            status: 'UNCERTAIN',
            providerCode: transportError ? 'TRANSPORT_ERROR' : `HTTP_${httpStatus}`,
            message:
              '송장 전송 여부를 확인하지 못했습니다. 자동으로 다시 전송하지 않습니다.',
            shipmentFingerprint: target.shipmentFingerprint,
          });
        }
      }
      stopFurtherChunks = true;
      continue;
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      for (const target of chunk) {
        for (const matchId of target.matchIds) {
          pushItem(matchId, {
            productOrderId: target.productOrderId,
            status: 'FAILED',
            providerCode: `HTTP_${httpStatus}`,
            message: '송장 전송 요청이 거부되었습니다.',
            shipmentFingerprint: target.shipmentFingerprint,
          });
        }
      }
      // 명시적 HTTP 거부는 이후 묶음 계속 시도하지 않음(안전).
      stopFurtherChunks = true;
      continue;
    }

    const parsed = parseSmartstoreDispatchResponse(bodyText);
    if (!parsed.structureValid) {
      for (const target of chunk) {
        for (const matchId of target.matchIds) {
          pushItem(matchId, {
            productOrderId: target.productOrderId,
            status: 'UNCERTAIN',
            providerCode: 'MALFORMED_RESPONSE',
            message: '송장 전송 응답을 해석하지 못했습니다.',
            shipmentFingerprint: target.shipmentFingerprint,
          });
        }
      }
      stopFurtherChunks = true;
      continue;
    }

    const successSet = new Set(parsed.successProductOrderIds);
    const failById = new Map(
      parsed.failProductOrderInfos.map((row) => [row.productOrderId, row]),
    );

    for (const target of chunk) {
      if (successSet.has(target.productOrderId)) {
        for (const matchId of target.matchIds) {
          pushItem(matchId, {
            productOrderId: target.productOrderId,
            status: 'SUCCESS',
            providerCode: null,
            message: '송장 전송이 접수되었습니다.',
            shipmentFingerprint: target.shipmentFingerprint,
          });
        }
        continue;
      }
      const fail = failById.get(target.productOrderId);
      if (fail) {
        for (const matchId of target.matchIds) {
          pushItem(matchId, {
            productOrderId: target.productOrderId,
            status: 'FAILED',
            providerCode: fail.code,
            message: fail.message,
            shipmentFingerprint: target.shipmentFingerprint,
          });
        }
        continue;
      }
      for (const matchId of target.matchIds) {
        pushItem(matchId, {
          productOrderId: target.productOrderId,
          status: 'UNCERTAIN',
          providerCode: 'RESPONSE_ID_MISSING',
          message: '응답에서 처리 결과를 확인하지 못했습니다.',
          shipmentFingerprint: target.shipmentFingerprint,
        });
      }
    }
  }

  return finalizeOutcomes(input.entries, itemResultsByMatch, externallyPostedMatchIds);
}

function finalizeOutcomes(
  entries: SmartstoreBatchMatchEntry[],
  itemResultsByMatch: Map<string, ShipmentTransmissionItemResultSummary[]>,
  externallyPostedMatchIds: ReadonlySet<string>,
): SmartstoreBatchMatchOutcome[] {
  return entries.map((entry) => {
    const itemResults = (itemResultsByMatch.get(entry.matchId) ?? []).filter(
      (row) => row.productOrderId,
    );
    const aggregated = aggregateMatchFromItems(itemResults);
    const successMessage =
      aggregated.errorCode === 'ALREADY_DISPATCHED'
        ? aggregated.errorMessage
        : '송장 전송이 접수되었습니다.';
    return {
      matchId: entry.matchId,
      ...aggregated,
      externallyPosted: externallyPostedMatchIds.has(entry.matchId),
      itemResults,
      responseSummary: {
        providerStatusCode: aggregated.errorCode,
        message: aggregated.errorMessage ?? (aggregated.success ? successMessage : null),
        itemResults,
      },
    };
  });
}
