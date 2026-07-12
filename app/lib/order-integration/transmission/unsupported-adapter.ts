import type { OrderIntegrationProvider } from '@prisma/client';

import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';

export function buildUnsupportedShipmentTransmissionPayload(
  candidate: ShipmentTransmissionCandidate,
) {
  return {
    provider: candidate.provider,
    integrationAccountId: candidate.integrationAccountId,
    mallOrderNo: candidate.mallOrderNo,
    excloadOrderNo: candidate.excloadOrderNo,
    mallLineItemIds: candidate.mallLineItemIds,
    trackingNumber: candidate.trackingNumber,
    courierCode: candidate.courierCode,
    courierName: candidate.courierName,
  };
}

export function createUnsupportedShipmentTransmissionAdapter(
  provider: OrderIntegrationProvider,
): ShipmentTransmissionAdapter {
  return {
    provider,
    buildPayload: buildUnsupportedShipmentTransmissionPayload,
    async transmit(candidate) {
      return {
        success: false,
        provider: candidate.provider,
        matchId: candidate.matchId,
        providerRequestId: null,
        errorCode: 'NOT_CONFIGURED',
        errorMessage:
          'Shipment transmission endpoint is not configured for this provider.',
        retryable: false,
        responseSummary: {
          providerStatusCode: 'NOT_CONFIGURED',
          message: 'No external request was sent.',
        },
        outcomeKind: 'failure',
      };
    },
  };
}
