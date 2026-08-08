import type {
  OrderIntegrationProvider,
  OrderSyncTransmissionStatus,
  ShipmentUploadBatchStatus,
  ShipmentUserConfirmationStatus,
} from '@prisma/client';

import { isExportableShipmentMatchStatus } from '@/app/lib/order-integration/shipments/build-shipment-upload-export-rows';
import { SHIPMENT_UPLOAD_BATCH_READY_STATUS } from '@/app/lib/order-integration/shipments/refresh-shipment-upload-batch-ready-status';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';
import type {
  ShipmentTransmissionCandidate,
  ShipmentTransmissionEligibilityOptions,
  ShipmentTransmissionEligibilityReasonCode,
  ShipmentTransmissionEligibilityResult,
} from '@/app/lib/order-integration/transmission/types';

export type TransmissionEligibilityUploadRow = {
  trackingNumber: string;
  carrierCode: string | null;
  carrierName: string | null;
};

export type TransmissionEligibilityMatchInput = {
  id: string;
  userId: string;
  uploadBatchId: string;
  orderSyncOrderId: string | null;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
  userConfirmationStatus: ShipmentUserConfirmationStatus;
  transmissionStatus: OrderSyncTransmissionStatus;
  finalTrackingNumber: string | null;
  finalCarrierCode: string | null;
  finalCarrierName: string | null;
  uploadRow: TransmissionEligibilityUploadRow;
};

export type TransmissionEligibilityOrderInput = {
  id: string;
  userId: string;
  provider: OrderIntegrationProvider;
  integrationAccountId: string | null;
  mallOrderNo: string;
  excloadOrderNo: string;
  mallLineItemIds?: unknown;
};

export type TransmissionEligibilityBatchInput = {
  id: string;
  userId: string;
  status: ShipmentUploadBatchStatus;
  provider: OrderIntegrationProvider | null;
  integrationAccountId: string | null;
};

export type EvaluateShipmentTransmissionEligibilityInput = {
  batch: TransmissionEligibilityBatchInput;
  match: TransmissionEligibilityMatchInput;
  /** orderSyncOrderId에 해당하는 주문. 없으면 null */
  order: TransmissionEligibilityOrderInput | null;
  options?: ShipmentTransmissionEligibilityOptions;
};

function fail(
  reasonCode: ShipmentTransmissionEligibilityReasonCode,
  reasonMessage: string,
): ShipmentTransmissionEligibilityResult {
  return {
    eligible: false,
    candidate: null,
    reasonCode,
    reasonMessage,
  };
}

/** export의 resolveShipmentUploadExportTrackingNumber 와 동일 우선순위 */
export function resolveTransmissionTrackingNumber(match: {
  finalTrackingNumber: string | null;
  uploadRow: { trackingNumber: string };
}): string {
  return match.finalTrackingNumber?.trim() || match.uploadRow.trackingNumber.trim();
}

/**
 * finalCarrier* 우선, 없으면 uploadRow.
 * export의 carrierName resolve와 동일 우선순위 + carrierCode 포함.
 */
export function resolveTransmissionCourier(match: {
  finalCarrierCode: string | null;
  finalCarrierName: string | null;
  uploadRow: { carrierCode: string | null; carrierName: string | null };
}): { courierCode: string | null; courierName: string | null } {
  const courierCode =
    match.finalCarrierCode?.trim() || match.uploadRow.carrierCode?.trim() || null;
  const courierName =
    match.finalCarrierName?.trim() || match.uploadRow.carrierName?.trim() || null;
  return {
    courierCode: courierCode || null,
    courierName: courierName || null,
  };
}

export function parseMallLineItemIds(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
  return ids.length > 0 ? ids : null;
}

function sameNullableId(left: string | null | undefined, right: string | null | undefined): boolean {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

/**
 * ShipmentMatch 기준 송장전송 대상 판정 (순수 함수).
 * OrderSyncOrder.transmissionStatus는 판정에 사용하지 않음.
 */
export function evaluateShipmentTransmissionEligibility(
  input: EvaluateShipmentTransmissionEligibilityInput,
): ShipmentTransmissionEligibilityResult {
  const { batch, match, order } = input;
  const retryFailed = input.options?.retryFailed === true;

  if (batch.status !== SHIPMENT_UPLOAD_BATCH_READY_STATUS) {
    return fail('BATCH_NOT_READY', 'READY 상태의 배치만 송장전송할 수 있습니다.');
  }

  if (match.uploadBatchId !== batch.id) {
    return fail('MATCH_BATCH_MISMATCH', '매칭이 해당 업로드 배치에 속하지 않습니다.');
  }

  if (match.userId !== batch.userId) {
    return fail('USER_MISMATCH', '배치와 매칭의 사용자가 일치하지 않습니다.');
  }

  if (!isExportableShipmentMatchStatus(match.userConfirmationStatus)) {
    return fail(
      'CONFIRMATION_NOT_ELIGIBLE',
      `확정 상태 ${match.userConfirmationStatus} 는 송장전송 대상이 아닙니다.`,
    );
  }

  const orderId = match.orderSyncOrderId?.trim() || '';
  if (!orderId) {
    return fail('ORDER_NOT_LINKED', '연결된 주문 스냅샷이 없습니다.');
  }

  if (!order || order.id !== orderId) {
    return fail('ORDER_NOT_FOUND', '연결된 주문 스냅샷 데이터를 찾을 수 없습니다.');
  }

  if (order.userId !== batch.userId || order.userId !== match.userId) {
    return fail('USER_MISMATCH', '주문 스냅샷의 사용자가 일치하지 않습니다.');
  }

  const provider = match.provider ?? order.provider ?? batch.provider;
  if (!provider) {
    return fail('PROVIDER_MISSING', '쇼핑몰(provider) 정보가 없습니다.');
  }

  if (batch.provider && batch.provider !== provider) {
    return fail('PROVIDER_MISMATCH', '배치와 매칭/주문의 쇼핑몰이 일치하지 않습니다.');
  }
  if (match.provider && match.provider !== provider) {
    return fail('PROVIDER_MISMATCH', '매칭과 주문의 쇼핑몰이 일치하지 않습니다.');
  }
  if (order.provider !== provider) {
    return fail('PROVIDER_MISMATCH', '주문 스냅샷의 쇼핑몰이 일치하지 않습니다.');
  }

  const integrationAccountId =
    match.integrationAccountId?.trim() ||
    order.integrationAccountId?.trim() ||
    batch.integrationAccountId?.trim() ||
    '';

  if (!integrationAccountId) {
    return fail('INTEGRATION_ACCOUNT_MISSING', '연동 계정 ID가 없습니다.');
  }

  if (
    batch.integrationAccountId &&
    !sameNullableId(batch.integrationAccountId, integrationAccountId)
  ) {
    return fail(
      'INTEGRATION_ACCOUNT_MISMATCH',
      '배치와 매칭/주문의 연동 계정이 일치하지 않습니다.',
    );
  }
  if (
    match.integrationAccountId &&
    !sameNullableId(match.integrationAccountId, integrationAccountId)
  ) {
    return fail(
      'INTEGRATION_ACCOUNT_MISMATCH',
      '매칭과 주문의 연동 계정이 일치하지 않습니다.',
    );
  }
  if (
    order.integrationAccountId &&
    !sameNullableId(order.integrationAccountId, integrationAccountId)
  ) {
    return fail(
      'INTEGRATION_ACCOUNT_MISMATCH',
      '주문 스냅샷의 연동 계정이 일치하지 않습니다.',
    );
  }

  const mallOrderNo = order.mallOrderNo?.trim() || '';
  if (!mallOrderNo) {
    return fail('MALL_ORDER_NO_MISSING', '쇼핑몰 주문번호가 없습니다.');
  }

  const excloadOrderNo = order.excloadOrderNo?.trim() || '';
  if (!excloadOrderNo) {
    return fail(
      'EXCLOAD_ORDER_NO_MISSING',
      '엑클로드 관리번호(excloadOrderNo)가 없습니다.',
    );
  }

  const trackingNumber = resolveTransmissionTrackingNumber(match);
  if (!trackingNumber) {
    return fail('TRACKING_NUMBER_MISSING', '송장번호가 없습니다.');
  }

  const { courierCode, courierName } = resolveTransmissionCourier(match);
  if (!courierCode && !courierName) {
    return fail('COURIER_MISSING', '택배사 코드 또는 택배사명이 필요합니다.');
  }

  if (
    provider === 'COUPANG' ||
    provider === 'SMARTSTORE' ||
    provider === 'ELEVEN' ||
    provider === 'DOMEGGOOK'
  ) {
    const providerCourierCode = resolveProviderCourierCode({
      provider,
      courierCode,
      courierName,
    });
    if (!providerCourierCode || (provider === 'SMARTSTORE' && providerCourierCode === 'CH1')) {
      return fail(
        'COURIER_UNSUPPORTED',
        provider === 'SMARTSTORE'
          ? '스마트스토어에서 지원하지 않는 택배사입니다. 택배사를 확인해 주세요.'
          : provider === 'ELEVEN'
            ? '11번가에서 지원하지 않는 택배사입니다. CJ·한진·롯데·로젠·우체국만 전송할 수 있습니다.'
            : provider === 'DOMEGGOOK'
              ? '도매꾹에서 지원하지 않는 택배사입니다. CJ·한진·롯데·로젠·우체국만 전송할 수 있습니다.'
              : '쿠팡에서 지원하지 않는 택배사입니다. 택배사를 확인해 주세요.',
      );
    }
  }

  switch (match.transmissionStatus) {
    case 'SENT':
      return fail('ALREADY_SENT', '이미 전송된 매칭은 재전송할 수 없습니다.');
    case 'SKIPPED':
      return fail('TRANSMISSION_SKIPPED', '전송 스킵된 매칭은 대상이 아닙니다.');
    case 'PROCESSING':
      return fail('TRANSMISSION_SKIPPED', '전송이 진행 중인 매칭은 대상이 아닙니다.');
    case 'UNKNOWN':
      return fail(
        'TRANSMISSION_SKIPPED',
        '결과가 불명확한(UNKNOWN) 매칭은 자동 재시도할 수 없습니다. reconciliation 후 처리하세요.',
      );
    case 'FAILED':
      if (!retryFailed) {
        return fail(
          'RETRY_NOT_REQUESTED',
          '실패 건은 retryFailed 옵션이 있을 때만 다시 전송할 수 있습니다.',
        );
      }
      break;
    case 'NONE':
    case 'READY':
      break;
  }

  const candidate: ShipmentTransmissionCandidate = {
    provider,
    integrationAccountId,
    uploadBatchId: batch.id,
    matchId: match.id,
    orderSyncOrderId: order.id,
    mallOrderNo,
    excloadOrderNo,
    mallLineItemIds: parseMallLineItemIds(order.mallLineItemIds),
    trackingNumber,
    courierCode,
    courierName,
  };

  return {
    eligible: true,
    candidate,
    reasonCode: null,
    reasonMessage: null,
  };
}
