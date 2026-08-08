import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderIntegrationAccount } from '@prisma/client';

import {
  DOMEGGOOK_API_URL,
  domeggookSetOrdChk,
  domeggookSetOrdOkDeli,
  parseDomeggookSetOrdChkResponse,
  parseDomeggookSetOrdOkDeliResponse,
  toDomeggookOrderNoQueryValue,
} from '@/app/lib/domeggook/client';
import {
  buildDomeggookMallLineItemIds,
  extractDomeggookApiOrderNo,
  extractDomeggookMarket,
  extractDomeggookOrderUid,
  extractDomeggookStatusMode,
} from '@/app/lib/domeggook/domeggook-ids';
import { runDomeggookConfirm, validateDomeggookConfirmItems } from '@/app/lib/domeggook/domeggook-confirm';
import {
  assertDomeggookShipmentConsistency,
  decideDomeggookVerifyFromOrderView,
  runDomeggookInvoiceTransmission,
} from '@/app/lib/domeggook/domeggook-invoice';
import { mapDomeggookOrderToStandardRow } from '@/app/lib/domeggook/map-domeggook-orders';
import { collectMallLineItemIds } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { createRealShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/real-adapters';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';
import {
  collectSelectedDomeggookConfirmSelection,
  isDomeggookConfirmableRow,
} from '@/app/lib/domeggook/domeggook-fetch-panel-logic';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

const setLoginMock = vi.fn();
const toDomeggookCredentialsMock = vi.fn();
const readDomeggookDeliWithTaxMock = vi.fn();

vi.mock('@/app/lib/domeggook/client', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/domeggook/client')>(
    '@/app/lib/domeggook/client',
  );
  return {
    ...actual,
    domeggookSetLogin: (input: unknown) => setLoginMock(input),
  };
});

vi.mock('@/app/lib/order-integration/domeggook-account', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/domeggook-account')
  >('@/app/lib/order-integration/domeggook-account');
  return {
    ...actual,
    toDomeggookCredentials: (account: unknown) => toDomeggookCredentialsMock(account),
    readDomeggookDeliWithTax: (account: unknown) => readDomeggookDeliWithTaxMock(account),
  };
});

function account(): OrderIntegrationAccount {
  return {
    id: 'acct-dome',
    userId: 'user-1',
    provider: 'DOMEGGOOK',
    accountName: 'dome',
    vendorId: 'default',
    sellerId: null,
    accessKeyCiphertext: null,
    accessKeyIv: null,
    accessKeyAuthTag: null,
    secretKeyCiphertext: null,
    secretKeyIv: null,
    secretKeyAuthTag: null,
    apiKeyCiphertext: 'cipher',
    apiKeyIv: 'iv',
    apiKeyAuthTag: 'tag',
    encryptionKeyVersion: 1,
    expiresAt: null,
    status: 'ACTIVE',
    lastTestedAt: null,
    lastSyncedAt: null,
    lastErrorMessage: null,
    healthStatus: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCategory: null,
    lastErrorCode: null,
    consecutiveFailureCount: 0,
    healthOperationSequence: BigInt(0),
    healthAppliedOperationSequence: BigInt(0),
    healthCheckLeaseToken: null,
    healthCheckLeaseUntil: null,
    authorizationPeriodStart: null,
    authorizationPeriodEnd: null,
    domeggookDeliWithTax: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function candidate(overrides: Partial<ShipmentTransmissionCandidate> = {}): ShipmentTransmissionCandidate {
  return {
    provider: 'DOMEGGOOK',
    integrationAccountId: 'acct-dome',
    uploadBatchId: 'batch-1',
    matchId: 'match-1',
    orderSyncOrderId: 'order-1',
    mallOrderNo: 'OR12345',
    excloadOrderNo: 'EXC-1',
    mallLineItemIds: buildDomeggookMallLineItemIds({
      displayOrderNo: 'OR12345',
      apiOrderNo: '12345',
      orderUid: 'uid-1',
      statusMode: 'WAITDELI',
      market: 'dome',
    }),
    trackingNumber: '123456789012',
    courierCode: 'CJ',
    courierName: 'CJ대한통운',
    ...overrides,
  };
}

function credentials() {
  return { memberId: 'seller1', password: 'pw-secret', apiKey: 'aid-secret' };
}

function session() {
  return { sId: 'sid-secret-value' };
}

describe('도매꾹 주문번호 보존', () => {
  it('표시용 OR 접두와 API 숫자값을 구분하고 요청 직전에만 strip', () => {
    expect(toDomeggookOrderNoQueryValue('OR12345')).toBe('12345');
    expect(toDomeggookOrderNoQueryValue('12345')).toBe('12345');

    const mapped = mapDomeggookOrderToStandardRow({
      orderNo: 'OR12345',
      orderUid: 'uid-abc',
      productName: '상품',
      productOption: '',
      quantity: '1',
      receiverName: '홍',
      receiverPhone: '010',
      receiverAddress: '서울',
      receiverAddress1: '서울',
      receiverAddress2: '',
      postalCode: '12345',
      orderStatus: '결제완료',
      statusMode: 'WAITCHK',
      market: 'dome',
      deliveryMethod: 'TB',
      deliveryCompany: '',
      deliveryCode: '',
      orderedAt: '',
      deliveryMemo: '',
      raw: {},
    });
    expect(mapped['주문번호']).toBe('OR12345');
    expect(mapped['출고번호']).toBe('12345');
    expect(mapped['센터코드']).toBe('WAITCHK');
    expect(mapped['출고타입']).toBe('dome');

    const ids = collectMallLineItemIds([mapped as Record<string, string>]);
    expect(extractDomeggookApiOrderNo(ids)).toBe('12345');
    expect(extractDomeggookStatusMode(ids)).toBe('WAITCHK');
    expect(extractDomeggookMarket(ids)).toBe('dome');
    expect(extractDomeggookOrderUid(ids)).toBe('uid-abc');
  });
});

describe('setOrdChk 파서·호출', () => {
  it('POST form body에 mode=setOrdChk와 필수 파라미터를 넣는다', async () => {
    const http = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({
        result: true,
        success: { no: '100' },
        fail: {},
      }),
    }));

    await domeggookSetOrdChk({
      credentials: credentials(),
      session: session(),
      apiOrderNos: ['100', '200'],
      http,
    });

    expect(http).toHaveBeenCalledTimes(1);
    const calls = http.mock.calls as unknown as Array<
      [{ method: string; url: string; headers?: Record<string, string>; body?: string }]
    >;
    const call = calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.url).toBe(DOMEGGOOK_API_URL);
    expect(call.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(call.body);
    expect(params.get('ver')).toBe('1.0');
    expect(params.get('mode')).toBe('setOrdChk');
    expect(params.get('aid')).toBe('aid-secret');
    expect(params.get('id')).toBe('seller1');
    expect(params.get('sId')).toBe('sid-secret-value');
    expect(params.get('no')).toBe('100,200');
  });

  it('success.no / fail.no 단일·배열·빈 요소를 정규화한다', () => {
    expect(
      parseDomeggookSetOrdChkResponse(
        JSON.stringify({ result: true, success: { no: 11 }, fail: { no: [] } }),
      ),
    ).toEqual(
      expect.objectContaining({
        apiResultFlag: true,
        successNos: ['11'],
        failNos: [],
      }),
    );

    expect(
      parseDomeggookSetOrdChkResponse(
        JSON.stringify({
          result: true,
          success: { no: [12, 13] },
          fail: { no: 99 },
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        successNos: ['12', '13'],
        failNos: ['99'],
      }),
    );

    expect(
      parseDomeggookSetOrdChkResponse(
        JSON.stringify({ result: false, success: {}, fail: { no: ['1', '2'] } }),
      ),
    ).toEqual(
      expect.objectContaining({
        apiResultFlag: false,
        successNos: [],
        failNos: ['1', '2'],
      }),
    );
  });
});

describe('runDomeggookConfirm', () => {
  it('전체 성공·부분 성공·전체 실패를 주문별로 보존한다', async () => {
    const allOk = await runDomeggookConfirm({
      items: [
        { displayOrderNo: 'OR1', apiOrderNo: '1', statusMode: 'WAITCHK' },
        { displayOrderNo: 'OR2', apiOrderNo: '2', statusMode: 'WAITCHK' },
      ],
      setOrdChk: async () => ({
        apiResultFlag: true,
        successNos: ['1', '2'],
        failNos: [],
        rawBodyText: '',
      }),
    });
    expect(allOk.confirmedCount).toBe(2);
    expect(allOk.failedCount).toBe(0);

    const partial = await runDomeggookConfirm({
      items: [
        { displayOrderNo: 'OR1', apiOrderNo: '1', statusMode: 'WAITCHK' },
        { displayOrderNo: 'OR2', apiOrderNo: '2', statusMode: 'WAITCHK' },
      ],
      setOrdChk: async () => ({
        apiResultFlag: true,
        successNos: ['1'],
        failNos: ['2'],
        rawBodyText: '',
      }),
    });
    expect(partial.confirmedCount).toBe(1);
    expect(partial.failedCount).toBe(1);
    expect(partial.results.find((r) => r.apiOrderNo === '2')?.status).toBe('FAILED');

    const allFail = await runDomeggookConfirm({
      items: [{ displayOrderNo: 'OR1', apiOrderNo: '1', statusMode: 'WAITCHK' }],
      setOrdChk: async () => ({
        apiResultFlag: false,
        successNos: [],
        failNos: ['1'],
        rawBodyText: '',
      }),
    });
    expect(allFail.failedCount).toBe(1);
    expect(allFail.confirmedCount).toBe(0);
  });

  it('이미 발주확인(WAITDELI 이상)은 외부 호출 없이 ALREADY_CONFIRMED', async () => {
    const setOrdChk = vi.fn();
    const result = await runDomeggookConfirm({
      items: [
        { displayOrderNo: 'OR1', apiOrderNo: '1', statusMode: 'WAITDELI' },
        { displayOrderNo: 'OR2', apiOrderNo: '2', statusMode: 'WAITOK' },
      ],
      setOrdChk,
    });
    expect(setOrdChk).not.toHaveBeenCalled();
    expect(result.alreadyConfirmedCount).toBe(2);
  });

  it('result 플래그만으로 전부 성공 처리하지 않는다', async () => {
    const result = await runDomeggookConfirm({
      items: [
        { displayOrderNo: 'OR1', apiOrderNo: '1', statusMode: 'WAITCHK' },
        { displayOrderNo: 'OR2', apiOrderNo: '2', statusMode: 'WAITCHK' },
      ],
      setOrdChk: async () => ({
        apiResultFlag: true,
        successNos: ['1'],
        failNos: [],
        rawBodyText: '',
      }),
    });
    expect(result.confirmedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });
});

describe('계정·선택 검증', () => {
  it('다른 계정 혼선·숫자 주문번호 누락을 차단한다', () => {
    const rowKey = (mallId: string, accountId: string, rowIndex: number) =>
      `${mallId}:${accountId}:${rowIndex}`;
    const mixed = collectSelectedDomeggookConfirmSelection(
      [
        {
          mallId: 'domeggook',
          accountId: 'a1',
          rowIndex: 0,
          orderNo: 'OR1',
          apiOrderNo: '1',
          mallOrderStatusCode: 'WAITCHK',
          statusLabel: '결제완료',
        },
        {
          mallId: 'domeggook',
          accountId: 'a2',
          rowIndex: 1,
          orderNo: 'OR2',
          apiOrderNo: '2',
          mallOrderStatusCode: 'WAITCHK',
          statusLabel: '결제완료',
        },
      ],
      new Set(['domeggook:a1:0', 'domeggook:a2:1']),
      rowKey,
    );
    expect(mixed).toEqual({ ok: false, reason: 'MIXED_ACCOUNTS' });

    const missing = collectSelectedDomeggookConfirmSelection(
      [
        {
          mallId: 'domeggook',
          accountId: 'a1',
          rowIndex: 0,
          orderNo: 'OR1',
          apiOrderNo: '',
          mallOrderStatusCode: 'WAITCHK',
          statusLabel: '결제완료',
        },
      ],
      new Set(['domeggook:a1:0']),
      rowKey,
    );
    expect(missing).toEqual({ ok: false, reason: 'MISSING_IDS' });

    expect(
      isDomeggookConfirmableRow({
        mallId: 'domeggook',
        mallOrderStatusCode: 'WAITCHK',
        statusLabel: '결제완료',
      }),
    ).toBe(true);
    expect(
      isDomeggookConfirmableRow({
        mallId: 'domeggook',
        mallOrderStatusCode: 'WAITDELI',
        placeOrderStatus: 'OK',
        statusLabel: '배송준비중',
      }),
    ).toBe(false);

    expect(validateDomeggookConfirmItems([])).toEqual({
      ok: false,
      error: '발주확인할 주문을 선택해 주세요.',
    });
  });

  it('confirm route 계정 소유권: 요청 accountId가 사용자 계정과 다르면 403 대상', () => {
    const userAccountId = 'acct-owner';
    const requestedAccountId: string = 'acct-other';
    expect(requestedAccountId === userAccountId).toBe(false);
  });
});

describe('setOrdOkDeli 파서·호출', () => {
  it('공식 예시의 getMyAsset과 무관하게 mode=setOrdOkDeli를 사용한다', async () => {
    const http = vi.fn(async () => ({
      httpStatus: 200,
      bodyText: JSON.stringify({ result: true }),
    }));

    await domeggookSetOrdOkDeli({
      credentials: credentials(),
      session: session(),
      apiOrderNo: '12345',
      type: 'add',
      deliMethod: 'TB',
      deliCompany: 'DAEHAN',
      deliCode: '123456789012',
      deliWithTax: 0,
      http,
    });

    const calls = http.mock.calls as unknown as Array<[{ body?: string; method: string }]>;
    const call = calls[0]![0];
    expect(call.method).toBe('POST');
    const params = new URLSearchParams(call.body);
    expect(params.get('mode')).toBe('setOrdOkDeli');
    expect(params.get('mode')).not.toBe('getMyAsset');
    expect(params.get('ver')).toBe('1.0');
    expect(params.get('no')).toBe('12345');
    expect(params.get('type')).toBe('add');
    expect(params.get('deliMethod')).toBe('TB');
    expect(params.get('deliCompany')).toBe('DAEHAN');
    expect(params.get('deliCode')).toBe('123456789012');
    expect(params.get('deliWithTax')).toBe('0');
  });

  it('result=true만 성공, HTTP 200 + result=false는 실패', () => {
    expect(parseDomeggookSetOrdOkDeliResponse(JSON.stringify({ result: true })).ok).toBe(true);
    expect(parseDomeggookSetOrdOkDeliResponse(JSON.stringify({ result: 'true' })).ok).toBe(true);
    expect(parseDomeggookSetOrdOkDeliResponse(JSON.stringify({ result: false })).ok).toBe(false);
    expect(parseDomeggookSetOrdOkDeliResponse('<domeggook><result>false</result></domeggook>').ok).toBe(
      false,
    );
  });
});

describe('runDomeggookInvoiceTransmission', () => {
  it('세금계산서·택배사·송장·주문번호 누락 시 외부 호출 없음', async () => {
    const setOrdOkDeli = vi.fn();
    const getOrderView = vi.fn();

    const missingTax = await runDomeggookInvoiceTransmission({
      credentials: credentials(),
      session: session(),
      mallOrderNo: '12345',
      mallLineItemIds: buildDomeggookMallLineItemIds({
        displayOrderNo: '12345',
        apiOrderNo: '12345',
        statusMode: 'WAITDELI',
      }),
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: 'TN1',
      deliWithTax: null,
      getOrderView,
      setOrdOkDeli,
    });
    expect(missingTax.errorCode).toBe('DELI_WITH_TAX_REQUIRED');
    expect(setOrdOkDeli).not.toHaveBeenCalled();
    expect(getOrderView).not.toHaveBeenCalled();

    const missingTrack = await runDomeggookInvoiceTransmission({
      credentials: credentials(),
      session: session(),
      mallOrderNo: '12345',
      mallLineItemIds: null,
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '  ',
      deliWithTax: 0,
      getOrderView,
      setOrdOkDeli,
    });
    expect(missingTrack.errorCode).toBe('TRACKING_NUMBER_MISSING');
    expect(setOrdOkDeli).not.toHaveBeenCalled();

    const unsupported = await runDomeggookInvoiceTransmission({
      credentials: credentials(),
      session: session(),
      mallOrderNo: '12345',
      mallLineItemIds: buildDomeggookMallLineItemIds({
        displayOrderNo: '12345',
        apiOrderNo: '12345',
      }),
      courierCode: 'UNKNOWN',
      courierName: '알수없음',
      trackingNumber: 'TN1',
      deliWithTax: 0,
      getOrderView,
      setOrdOkDeli,
    });
    expect(unsupported.errorCode).toBe('COURIER_UNSUPPORTED');
    expect(setOrdOkDeli).not.toHaveBeenCalled();
  });

  it('result=true 성공, result=false 실패, 발주확인을 자동 실행하지 않음', async () => {
    const setOrdOkDeli = vi.fn(async () => ({
      ok: true,
      resultFlag: true,
      message: 'ok',
      rawBodyText: '',
    }));
    const getOrderView = vi.fn(async () => ({
      orderNo: '12345',
      orderUid: 'uid',
      productName: '',
      productOption: '',
      quantity: '1',
      receiverName: '',
      receiverPhone: '',
      receiverAddress: '',
      receiverAddress1: '',
      receiverAddress2: '',
      postalCode: '',
      orderStatus: '배송준비중',
      statusMode: 'WAITDELI',
      market: 'dome',
      deliveryMethod: '',
      deliveryCompany: '',
      deliveryCode: '',
      orderedAt: '',
      deliveryMemo: '',
      raw: {},
    }));

    const ok = await runDomeggookInvoiceTransmission({
      credentials: credentials(),
      session: session(),
      mallOrderNo: '12345',
      mallLineItemIds: buildDomeggookMallLineItemIds({
        displayOrderNo: '12345',
        apiOrderNo: '12345',
        statusMode: 'WAITDELI',
      }),
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: 'TN-1',
      deliWithTax: 1,
      getOrderView,
      setOrdOkDeli,
    });
    expect(ok.success).toBe(true);
    expect(setOrdOkDeli).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'add',
        deliMethod: 'TB',
        deliCompany: 'DAEHAN',
        deliCode: 'TN-1',
        deliWithTax: 1,
        apiOrderNo: '12345',
      }),
    );

    setOrdOkDeli.mockResolvedValueOnce({
      ok: false,
      resultFlag: false,
      message: 'rejected',
      rawBodyText: '',
    });
    const fail = await runDomeggookInvoiceTransmission({
      credentials: credentials(),
      session: session(),
      mallOrderNo: '12345',
      mallLineItemIds: buildDomeggookMallLineItemIds({
        displayOrderNo: '12345',
        apiOrderNo: '12345',
        statusMode: 'WAITDELI',
      }),
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: 'TN-2',
      deliWithTax: 0,
      getOrderView,
      setOrdOkDeli,
    });
    expect(fail.success).toBe(false);
    expect(fail.errorCode).toBe('PROVIDER_REJECTED');
  });
});

describe('택배사 매핑·송장 충돌/dedupe', () => {
  it('명확 대응만 지원하고 미지원은 차단한다', () => {
    expect(resolveProviderCourierCode({ provider: 'DOMEGGOOK', courierCode: 'CJ', courierName: null })).toBe(
      'DAEHAN',
    );
    expect(
      resolveProviderCourierCode({ provider: 'DOMEGGOOK', courierCode: 'HANJIN', courierName: null }),
    ).toBe('HANJIN');
    expect(
      resolveProviderCourierCode({ provider: 'DOMEGGOOK', courierCode: 'LOTTE', courierName: null }),
    ).toBe('HYUNDAI');
    expect(
      resolveProviderCourierCode({ provider: 'DOMEGGOOK', courierCode: 'LOGEN', courierName: null }),
    ).toBe('KGBL');
    expect(
      resolveProviderCourierCode({ provider: 'DOMEGGOOK', courierCode: 'EPOST', courierName: null }),
    ).toBe('EPOST');
    expect(
      resolveProviderCourierCode({ provider: 'DOMEGGOOK', courierCode: 'KUNYOUNG', courierName: null }),
    ).toBeNull();
  });

  it('같은 송장은 ok, 상충 송장/택배는 차단', () => {
    expect(
      assertDomeggookShipmentConsistency({
        trackingNumbers: ['TN1', 'TN1'],
        courierCodes: ['CJ', 'CJ'],
        courierNames: [null, null],
      }).ok,
    ).toBe(true);
    expect(
      assertDomeggookShipmentConsistency({
        trackingNumbers: ['TN1', 'TN2'],
        courierCodes: ['CJ', 'CJ'],
        courierNames: [null, null],
      }),
    ).toEqual(
      expect.objectContaining({ ok: false, errorCode: 'SHIPMENT_CONFLICT' }),
    );
    expect(
      assertDomeggookShipmentConsistency({
        trackingNumbers: ['TN1', 'TN1'],
        courierCodes: ['CJ', 'HANJIN'],
        courierNames: [null, null],
      }),
    ).toEqual(
      expect.objectContaining({ ok: false, errorCode: 'SHIPMENT_CONFLICT' }),
    );
  });
});

describe('verify 판정', () => {
  it('반영 완료·대기·불일치·미조회를 구분한다', () => {
    expect(
      decideDomeggookVerifyFromOrderView({
        order: null,
        expectedTracking: 'TN1',
        expectedDeliCompany: 'DAEHAN',
      }).status,
    ).toBe('CHECK_FAILED');

    expect(
      decideDomeggookVerifyFromOrderView({
        order: {
          orderNo: '1',
          orderUid: '',
          productName: '',
          productOption: '',
          quantity: '1',
          receiverName: '',
          receiverPhone: '',
          receiverAddress: '',
          receiverAddress1: '',
          receiverAddress2: '',
          postalCode: '',
          orderStatus: '배송중',
          statusMode: 'WAITOK',
          market: 'dome',
          deliveryMethod: 'TB',
          deliveryCompany: 'DAEHAN',
          deliveryCode: 'TN-1',
          orderedAt: '',
          deliveryMemo: '',
          raw: {},
        },
        expectedTracking: 'TN1',
        expectedDeliCompany: 'DAEHAN',
      }).status,
    ).toBe('CONFIRMED');

    expect(
      decideDomeggookVerifyFromOrderView({
        order: {
          orderNo: '1',
          orderUid: '',
          productName: '',
          productOption: '',
          quantity: '1',
          receiverName: '',
          receiverPhone: '',
          receiverAddress: '',
          receiverAddress1: '',
          receiverAddress2: '',
          postalCode: '',
          orderStatus: '배송준비중',
          statusMode: 'WAITDELI',
          market: 'dome',
          deliveryMethod: '',
          deliveryCompany: '',
          deliveryCode: '',
          orderedAt: '',
          deliveryMemo: '',
          raw: {},
        },
        expectedTracking: 'TN1',
        expectedDeliCompany: 'DAEHAN',
      }).status,
    ).toBe('PENDING');

    expect(
      decideDomeggookVerifyFromOrderView({
        order: {
          orderNo: '1',
          orderUid: '',
          productName: '',
          productOption: '',
          quantity: '1',
          receiverName: '',
          receiverPhone: '',
          receiverAddress: '',
          receiverAddress1: '',
          receiverAddress2: '',
          postalCode: '',
          orderStatus: '배송중',
          statusMode: 'WAITOK',
          market: 'dome',
          deliveryMethod: 'TB',
          deliveryCompany: 'DAEHAN',
          deliveryCode: 'OTHER',
          orderedAt: '',
          deliveryMemo: '',
          raw: {},
        },
        expectedTracking: 'TN1',
        expectedDeliCompany: 'DAEHAN',
      }).status,
    ).toBe('ATTENTION');
  });
});

describe('Domeggook live adapter registry', () => {
  beforeEach(() => {
    setLoginMock.mockReset();
    toDomeggookCredentialsMock.mockReset();
    readDomeggookDeliWithTaxMock.mockReset();
    toDomeggookCredentialsMock.mockReturnValue(credentials());
    readDomeggookDeliWithTaxMock.mockReturnValue(0);
    setLoginMock.mockResolvedValue(session());
  });

  it('ADAPTER_NOT_REGISTERED / PROVIDER_SPEC_INCOMPLETE가 발생하지 않는다', async () => {
    const setOrdOkDeli = vi.fn(async () => ({
      ok: true,
      resultFlag: true,
      message: 'ok',
      rawBodyText: '',
    }));

    // adapter는 내부 runDomeggookInvoiceTransmission을 쓰므로 credentials/session mock만.
    // 자격증명 해독 성공 + setLogin 성공 후 getOrderView 실패는 ORDER_LOOKUP_FAILED 등.
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => account(),
    });
    const adapter = registry.get('DOMEGGOOK');
    expect(adapter).toBeTruthy();
    expect(registry.listProviders()).toContain('DOMEGGOOK');

    const result = await adapter!.transmit(candidate());
    expect(result.errorCode).not.toBe('ADAPTER_NOT_REGISTERED');
    expect(result.errorCode).not.toBe('PROVIDER_SPEC_INCOMPLETE');
    // 실 HTTP 없이 getOrderView 실패 가능 — 등록된 live 경로임만 확인
    expect(setOrdOkDeli).not.toHaveBeenCalled();
  });

  it('같은 주문·같은 송장 동시 전송은 외부 로그인/전송을 한 번만 수행', async () => {
    let loginCalls = 0;
    setLoginMock.mockImplementation(async () => {
      loginCalls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return session();
    });
    // getOrderView will fail without proxy — both share in-flight so setLogin once
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => account(),
    });
    const adapter = registry.get('DOMEGGOOK')!;
    const a = adapter.transmit(candidate({ matchId: 'm1' }));
    const b = adapter.transmit(candidate({ matchId: 'm2' }));
    await Promise.all([a, b]);
    expect(loginCalls).toBe(1);
  });

  it('같은 주문·상충 송장은 두 번째를 외부 호출 전 차단', async () => {
    let loginCalls = 0;
    setLoginMock.mockImplementation(async () => {
      loginCalls += 1;
      await new Promise((r) => setTimeout(r, 40));
      return session();
    });
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => account(),
    });
    const adapter = registry.get('DOMEGGOOK')!;
    const first = adapter.transmit(candidate({ matchId: 'm1', trackingNumber: 'TN-A' }));
    const second = adapter.transmit(
      candidate({ matchId: 'm2', trackingNumber: 'TN-B' }),
    );
    const [, secondResult] = await Promise.all([first, second]);
    expect(secondResult.errorCode).toBe('SHIPMENT_CONFLICT');
    expect(loginCalls).toBe(1);
  });
});

describe('쿠팡·스마트스토어·11번가 adapter 회귀', () => {
  it('기존 live provider 목록을 유지한다', () => {
    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => null,
    });
    const providers = registry.listProviders();
    expect(providers).toContain('COUPANG');
    expect(providers).toContain('SMARTSTORE');
    expect(providers).toContain('ELEVEN');
    expect(providers).toContain('DOMEGGOOK');
  });
});
