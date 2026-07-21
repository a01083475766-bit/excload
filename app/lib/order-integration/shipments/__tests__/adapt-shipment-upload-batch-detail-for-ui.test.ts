import { describe, expect, it } from 'vitest';

import {
  adaptShipmentUploadBatchDetailForUi,
  adaptShipmentUploadBatchDetailRowForDisplay,
  buildShipmentMatchPanelViewStateFromExcludeResponse,
  buildShipmentMatchPanelViewStateFromLinkResponse,
  buildShipmentMatchPanelViewStateFromUpload,
  canShowShipmentMatchConfirmButton,
  canShowShipmentMatchExcludeButton,
  canShowShipmentMatchLinkButton,
  isShipmentMatchPanelRowConfirmed,
  isShipmentMatchPanelRowExcluded,
  isShipmentMatchPanelRowManuallyLinked,
  isShipmentMatchPanelBatchReady,
} from '@/app/lib/order-integration/shipments/adapt-shipment-upload-batch-detail-for-ui';
import type { ShipmentUploadBatchDetailResponse } from '@/app/lib/order-integration/shipments/load-shipment-upload-batch-detail';
import type { ShipmentUploadPersistSuccessResponse } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';

function buildDetail(): ShipmentUploadBatchDetailResponse {
  return {
    success: true,
    uploadBatch: {
      id: 'upload-batch-1',
      provider: 'SMARTSTORE',
      integrationAccountId: 'acc-1',
      originalFileName: 'shipments.csv',
      fileSize: 2048,
      fileType: 'text/csv',
      rowCount: 2,
      matchedConfidentCount: 1,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
      status: 'MATCHED',
      createdAt: '2026-07-09T08:00:00.000Z',
    },
    rows: [
      {
        uploadRowId: 'row-1',
        matchId: 'match-1',
        originalRowIndex: 0,
        algorithmMatchStatus: 'MATCHED_CONFIDENT',
        userConfirmationStatus: 'UNCONFIRMED',
        transmissionStatus: 'NONE',
        provider: '스마트스토어',
        excloadOrderNo: 'EXC-1',
        mallOrderNo: 'ORD-1',
        receiverName: '홍길동',
        receiverPhoneMasked: '010-****-5678',
        receiverAddressMasked: '서울시 강남구 ... 123',
        trackingNumberMasked: '1234****5678',
        trackingNumberValue: null,
        productSummary: '티셔츠',
        carrierName: 'CJ대한통운',
        carrierCode: 'CJ',
        transmissionErrorMessage: null,
        matchReason: 'exact',
        matchScore: 100,
      },
      {
        uploadRowId: 'row-2',
        matchId: 'match-2',
        originalRowIndex: 1,
        algorithmMatchStatus: 'NOT_MATCHED',
        userConfirmationStatus: 'UNCONFIRMED',
        transmissionStatus: 'NONE',
        provider: null,
        excloadOrderNo: null,
        mallOrderNo: 'ORD-2',
        receiverName: null,
        receiverPhoneMasked: null,
        receiverAddressMasked: null,
        trackingNumberMasked: '9876****4321',
        trackingNumberValue: null,
        productSummary: null,
        carrierName: null,
        carrierCode: null,
        transmissionErrorMessage: null,
        matchReason: 'no candidate',
        matchScore: 0,
      },
    ],
    summary: {
      totalRows: 2,
      matchedConfidentCount: 1,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
    },
  };
}

function buildUploadBody(): ShipmentUploadPersistSuccessResponse {
  return {
    success: true,
    uploadBatch: {
      id: 'upload-batch-1',
      rowCount: 2,
      matchCount: 2,
    },
    file: { name: 'shipments.csv', type: 'text/csv', size: 2048 },
    parse: { ok: true, rowCount: 2, warningCount: 1, warnings: [] },
    orders: { loadedCount: 0, emptyReason: 'no_bundle', bundle: null, scope: {} },
    match: {
      totalRows: 2,
      matchedConfidentCount: 1,
      matchedWarningCount: 0,
      multipleCandidatesCount: 0,
      notMatchedCount: 1,
      duplicateTrackingNumberCount: 0,
      alreadyShippedCount: 0,
      cancelledOrInvalidOrderCount: 0,
      rows: [],
      displayRows: [],
    },
  };
}

describe('adaptShipmentUploadBatchDetailRowForDisplay', () => {
  it('maps stored detail row to display row with masked fields', () => {
    const detail = buildDetail();
    const mapped = adaptShipmentUploadBatchDetailRowForDisplay(detail.rows[0]);

    expect(mapped).toEqual({
      shipmentRowIndex: 0,
      matchStatus: 'MATCHED_CONFIDENT',
      matchReason: 'exact',
      providerLabel: '스마트스토어',
      mallOrderNo: 'ORD-1',
      excloadOrderNo: 'EXC-1',
      receiverName: '홍길동',
      receiverPhoneMasked: '010-****-5678',
      receiverAddressMasked: '서울시 강남구 ... 123',
      productSummary: '티셔츠',
      carrierName: 'CJ대한통운',
      trackingNumberMasked: '1234****5678',
      trackingNumberValue: null,
      matchId: 'match-1',
      userConfirmationStatus: 'UNCONFIRMED',
      transmissionStatus: 'NONE',
      transmissionErrorMessage: null,
      carrierCode: 'CJ',
      hasLinkedOrder: true,
    });
    expect(JSON.stringify(mapped)).not.toContain('rawRowJson');
    expect(JSON.stringify(mapped)).not.toContain('candidateOrdersJson');
  });
});

describe('adaptShipmentUploadBatchDetailForUi', () => {
  it('builds panel view state from stored batch detail', () => {
    const viewState = adaptShipmentUploadBatchDetailForUi(buildDetail(), {
      ordersLoadedCount: 5,
      parseWarningCount: 2,
    });

    expect(viewState.uploadBatchId).toBe('upload-batch-1');
    expect(viewState.batchStatus).toBe('MATCHED');
    expect(viewState.file.name).toBe('shipments.csv');
    expect(viewState.parse).toEqual({ rowCount: 2, warningCount: 2 });
    expect(viewState.ordersLoadedCount).toBe(5);
    expect(viewState.summary.totalRows).toBe(2);
    expect(viewState.displayRows).toHaveLength(2);
    expect(viewState.displayRows[1].matchStatus).toBe('NOT_MATCHED');
  });
});

describe('buildShipmentMatchPanelViewStateFromUpload', () => {
  it('merges upload metadata with stored detail for empty snapshot notice', () => {
    const viewState = buildShipmentMatchPanelViewStateFromUpload(buildUploadBody(), buildDetail());

    expect(viewState.ordersLoadedCount).toBe(0);
    expect(viewState.parse.warningCount).toBe(1);
    expect(viewState.displayRows).toHaveLength(2);
  });
});

describe('confirm button visibility', () => {
  it('shows confirm button for eligible unconfirmed confident match', () => {
    const row = adaptShipmentUploadBatchDetailRowForDisplay(buildDetail().rows[0]);
    expect(canShowShipmentMatchConfirmButton(row)).toBe(true);
    expect(isShipmentMatchPanelRowConfirmed(row)).toBe(false);
  });

  it('hides confirm button for not matched row', () => {
    const row = adaptShipmentUploadBatchDetailRowForDisplay(buildDetail().rows[1]);
    expect(canShowShipmentMatchConfirmButton(row)).toBe(false);
  });

  it('treats confirmed row as confirmed', () => {
    const row = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[0],
      userConfirmationStatus: 'CONFIRMED',
    });
    expect(isShipmentMatchPanelRowConfirmed(row)).toBe(true);
    expect(canShowShipmentMatchConfirmButton(row)).toBe(false);
    expect(canShowShipmentMatchExcludeButton(row)).toBe(false);
  });
});

describe('exclude button visibility', () => {
  it('shows exclude button for unconfirmed rows with matchId', () => {
    const confidentRow = adaptShipmentUploadBatchDetailRowForDisplay(buildDetail().rows[0]);
    const notMatchedRow = adaptShipmentUploadBatchDetailRowForDisplay(buildDetail().rows[1]);

    expect(canShowShipmentMatchExcludeButton(confidentRow)).toBe(true);
    expect(canShowShipmentMatchExcludeButton(notMatchedRow)).toBe(true);
  });

  it('shows excluded badge state for excluded rows', () => {
    const row = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[1],
      userConfirmationStatus: 'EXCLUDED',
    });

    expect(isShipmentMatchPanelRowExcluded(row)).toBe(true);
    expect(canShowShipmentMatchExcludeButton(row)).toBe(false);
  });

  it('hides exclude button for confirmed rows', () => {
    const row = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[0],
      userConfirmationStatus: 'CONFIRMED',
    });

    expect(canShowShipmentMatchExcludeButton(row)).toBe(false);
  });
});

describe('link button visibility', () => {
  it('shows link button for unconfirmed not matched row', () => {
    const row = adaptShipmentUploadBatchDetailRowForDisplay(buildDetail().rows[1]);
    expect(canShowShipmentMatchLinkButton(row)).toBe(true);
  });

  it('shows link button for multiple candidates and matched warning', () => {
    const multipleCandidates = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[1],
      algorithmMatchStatus: 'MULTIPLE_CANDIDATES',
    });
    const matchedWarning = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[0],
      algorithmMatchStatus: 'MATCHED_WARNING',
      userConfirmationStatus: 'UNCONFIRMED',
    });

    expect(canShowShipmentMatchLinkButton(multipleCandidates)).toBe(true);
    expect(canShowShipmentMatchLinkButton(matchedWarning)).toBe(true);
  });

  it('hides link button for matched confident row', () => {
    const row = adaptShipmentUploadBatchDetailRowForDisplay(buildDetail().rows[0]);
    expect(canShowShipmentMatchLinkButton(row)).toBe(false);
  });

  it('hides link button for confirmed, excluded, and manually linked rows', () => {
    const confirmed = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[1],
      userConfirmationStatus: 'CONFIRMED',
    });
    const excluded = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[1],
      userConfirmationStatus: 'EXCLUDED',
    });
    const manuallyLinked = adaptShipmentUploadBatchDetailRowForDisplay({
      ...buildDetail().rows[1],
      userConfirmationStatus: 'MANUALLY_LINKED',
    });

    expect(canShowShipmentMatchLinkButton(confirmed)).toBe(false);
    expect(canShowShipmentMatchLinkButton(excluded)).toBe(false);
    expect(canShowShipmentMatchLinkButton(manuallyLinked)).toBe(false);
    expect(isShipmentMatchPanelRowManuallyLinked(manuallyLinked)).toBe(true);
  });
});

describe('buildShipmentMatchPanelViewStateFromExcludeResponse', () => {
  it('refreshes panel view state from exclude response detail', () => {
    const previous = buildShipmentMatchPanelViewStateFromUpload(buildUploadBody(), buildDetail());

    const next = buildShipmentMatchPanelViewStateFromExcludeResponse(
      {
        success: true,
        excludedMatchId: 'match-2',
        match: {
          shipmentRowIndex: 1,
          matchStatus: 'NOT_MATCHED',
          matchReason: 'no candidate',
          providerLabel: null,
          mallOrderNo: 'ORD-2',
          excloadOrderNo: null,
          receiverName: null,
          receiverPhoneMasked: null,
          receiverAddressMasked: null,
          productSummary: null,
          carrierName: null,
          trackingNumberMasked: '9876****4321',
          matchId: 'match-2',
          uploadRowId: 'row-2',
          userConfirmationStatus: 'EXCLUDED',
          transmissionStatus: 'NONE',
        },
        uploadBatch: buildDetail().uploadBatch,
        rows: buildDetail().rows.map((row) =>
          row.matchId === 'match-2'
            ? { ...row, userConfirmationStatus: 'EXCLUDED' as const }
            : row,
        ),
        summary: buildDetail().summary,
      },
      previous,
    );

    expect(next.ordersLoadedCount).toBe(previous.ordersLoadedCount);
    expect(next.displayRows[1].userConfirmationStatus).toBe('EXCLUDED');
    expect(JSON.stringify(next)).not.toContain('rawRowJson');
    expect(JSON.stringify(next)).not.toContain('candidateOrdersJson');
  });
});

describe('buildShipmentMatchPanelViewStateFromLinkResponse', () => {
  it('refreshes panel view state from link response detail', () => {
    const previous = buildShipmentMatchPanelViewStateFromUpload(buildUploadBody(), buildDetail());

    const next = buildShipmentMatchPanelViewStateFromLinkResponse(
      {
        success: true,
        linkedMatchId: 'match-2',
        orderSyncOrderId: 'order-2',
        match: {
          shipmentRowIndex: 1,
          matchStatus: 'NOT_MATCHED',
          matchReason: 'manual link',
          providerLabel: '스마트스토어',
          mallOrderNo: 'ORD-2',
          excloadOrderNo: 'EXC-2',
          receiverName: '김*수',
          receiverPhoneMasked: '010-****-1234',
          receiverAddressMasked: '서울 ... 101',
          productSummary: null,
          carrierName: null,
          trackingNumberMasked: '9876****4321',
          matchId: 'match-2',
          uploadRowId: 'row-2',
          userConfirmationStatus: 'MANUALLY_LINKED',
          transmissionStatus: 'NONE',
        },
        uploadBatch: buildDetail().uploadBatch,
        rows: buildDetail().rows.map((row) =>
          row.matchId === 'match-2'
            ? {
                ...row,
                userConfirmationStatus: 'MANUALLY_LINKED' as const,
                excloadOrderNo: 'EXC-2',
              }
            : row,
        ),
        summary: buildDetail().summary,
      },
      previous,
    );

    expect(next.ordersLoadedCount).toBe(previous.ordersLoadedCount);
    expect(next.displayRows[1].userConfirmationStatus).toBe('MANUALLY_LINKED');
    expect(isShipmentMatchPanelRowManuallyLinked(next.displayRows[1])).toBe(true);
    expect(JSON.stringify(next)).not.toContain('rawRowJson');
    expect(JSON.stringify(next)).not.toContain('candidateOrdersJson');
  });
});

describe('batch ready state for export download', () => {
  it('detects READY batch status from detail', () => {
    const viewState = adaptShipmentUploadBatchDetailForUi(
      {
        ...buildDetail(),
        uploadBatch: {
          ...buildDetail().uploadBatch,
          status: 'READY',
        },
      },
      { ordersLoadedCount: 1 },
    );

    expect(isShipmentMatchPanelBatchReady(viewState)).toBe(true);
  });

  it('returns false for non-READY batch status', () => {
    const viewState = buildShipmentMatchPanelViewStateFromUpload(buildUploadBody(), buildDetail());
    expect(isShipmentMatchPanelBatchReady(viewState)).toBe(false);
  });
});
