import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderIntegrationAccount } from '@prisma/client';

import {
  buildElevenReqDeliveryPath,
  buildElevenReqPackagingPath,
  evaluateElevenMutationHttpResponse,
  formatElevenApiDateTime,
  isElevenXmlSuccessCode,
  redactElevenSecrets,
  toUserFacingElevenErrorMessage,
} from '@/app/lib/eleven/client';
import {
  buildElevenMallLineItemIds,
  extractElevenLineIds,
  parseElevenProductOrderNo,
} from '@/app/lib/eleven/eleven-ids';
import { runElevenConfirm, validateElevenConfirmItems } from '@/app/lib/eleven/eleven-confirm';
import {
  decideElevenVerifyFromOrders,
  runElevenInvoiceTransmission,
} from '@/app/lib/eleven/eleven-invoice';
import { mapElevenOrderToStandardRow } from '@/app/lib/eleven/map-eleven-orders';
import { collectMallLineItemIds } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { createRealShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/real-adapters';
import { runVerifyTransmissionService } from '@/app/lib/order-integration/transmission/verify-transmission-status';
import {
  collectSelectedElevenConfirmSelection,
  isElevenConfirmableRow,
} from '@/app/lib/eleven/eleven-fetch-panel-logic';
import type { ShipmentTransmissionCandidate } from '@/app/lib/order-integration/transmission/types';

const elevenReqPackagingMock = vi.fn();
const elevenReqDeliveryMock = vi.fn();
const toElevenCredentialsMock = vi.fn();

vi.mock('@/app/lib/eleven/client', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/eleven/client')>(
    '@/app/lib/eleven/client',
  );
  return {
    ...actual,
    elevenReqPackaging: (input: unknown) => elevenReqPackagingMock(input),
    elevenReqDelivery: (input: unknown) => elevenReqDeliveryMock(input),
  };
});

vi.mock('@/app/lib/order-integration/eleven-account', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/lib/order-integration/eleven-account')
  >('@/app/lib/order-integration/eleven-account');
  return {
    ...actual,
    toElevenCredentials: (account: unknown) => toElevenCredentialsMock(account),
  };
});

function account(): OrderIntegrationAccount {
  return {
    id: 'acct-11',
    userId: 'user-1',
    provider: 'ELEVEN',
    accountName: '11st',
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
    provider: 'ELEVEN',
    integrationAccountId: 'acct-11',
    uploadBatchId: 'batch-1',
    matchId: 'match-1',
    orderSyncOrderId: 'order-1',
    mallOrderNo: '20260701001',
    excloadOrderNo: 'EXC-1',
    mallLineItemIds: buildElevenMallLineItemIds({
      ordNo: '20260701001',
      ordPrdSeq: '001',
      dlvNo: 'DLV-99',
      addPrdYn: 'N',
      addPrdNo: null,
    }),
    trackingNumber: '123456789012',
    courierCode: 'CJ',
    courierName: 'CJ대한통운',
    ...overrides,
  };
}

describe('11번가 path builders (guide)', () => {
  it('builds reqpackaging GET path in official parameter order', () => {
    expect(
      buildElevenReqPackagingPath({
        ordNo: '100',
        ordPrdSeq: '1',
        addPrdYn: 'N',
        addPrdNo: 'null',
        dlvNo: 'DLV1',
      }),
    ).toBe('/rest/ordservices/reqpackaging/100/1/N/null/DLV1');
  });

  it('builds reqdelivery GET path in official parameter order', () => {
    const sendDt = '202608081430';
    expect(
      buildElevenReqDeliveryPath({
        sendDt,
        dlvMthdCd: '01',
        dlvEtprsCd: '00034',
        invcNo: '123456789012',
        dlvNo: 'DLV1',
        partDlvYn: 'N',
        ordNo: '100',
        ordPrdSeq: '1',
      }),
    ).toBe(
      `/rest/ordservices/reqdelivery/${sendDt}/01/00034/123456789012/DLV1/N/100/1`,
    );
  });

  it('treats only 0/00 as XML success codes', () => {
    expect(isElevenXmlSuccessCode('0')).toBe(true);
    expect(isElevenXmlSuccessCode('00')).toBe(true);
    expect(isElevenXmlSuccessCode('200')).toBe(false);
    expect(isElevenXmlSuccessCode('-1')).toBe(false);
    expect(isElevenXmlSuccessCode('')).toBe(false);
    expect(isElevenXmlSuccessCode(null)).toBe(false);
  });
});

describe('evaluateElevenMutationHttpResponse (reqpackaging/reqdelivery)', () => {
  const secret = 'super-secret-openapikey-value';

  it('HTTP 200 + 공식 성공 코드 → 성공', () => {
    expect(
      evaluateElevenMutationHttpResponse({
        httpStatus: 200,
        bodyText: '<Result><result_code>0</result_code></Result>',
        secrets: [secret],
      }),
    ).toMatchObject({ ok: true, code: '0' });
    expect(
      evaluateElevenMutationHttpResponse({
        httpStatus: 200,
        bodyText: '<Result><result_code>00</result_code></Result>',
      }),
    ).toMatchObject({ ok: true, code: '00' });
  });

  it('HTTP 200 + 공식 실패 코드 → 실패하고 result_text 보존', () => {
    const result = evaluateElevenMutationHttpResponse({
      httpStatus: 200,
      bodyText:
        '<Result><result_code>-1</result_code><result_text>이미 발송 처리됨</result_text></Result>',
      secrets: [secret],
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('-1');
    expect(result.message).toContain('이미 발송 처리됨');
    expect(result.displayMessage).toContain('이미 발송 처리됨');
  });

  it('HTTP 200 + result_code 누락 → 실패 (HTTP 2xx fallback 없음)', () => {
    const result = evaluateElevenMutationHttpResponse({
      httpStatus: 200,
      bodyText: '<Result><note>ok-looking</note></Result>',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('MISSING_RESULT_CODE');
  });

  it('HTTP 200 + 빈 코드 또는 알 수 없는 코드 → 실패', () => {
    expect(
      evaluateElevenMutationHttpResponse({
        httpStatus: 200,
        bodyText: '<Result><result_code></result_code></Result>',
      }).ok,
    ).toBe(false);
    expect(
      evaluateElevenMutationHttpResponse({
        httpStatus: 200,
        bodyText: '<Result><result_code>200</result_code></Result>',
      }),
    ).toMatchObject({ ok: false, code: '200' });
  });

  it('잘못된 XML → 실패', () => {
    const result = evaluateElevenMutationHttpResponse({
      httpStatus: 200,
      bodyText: 'not-xml-at-all',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_XML');
  });

  it('실패 시 openapikey 원문을 메시지·본문에서 제거한다', () => {
    const result = evaluateElevenMutationHttpResponse({
      httpStatus: 200,
      bodyText: `<Result><result_code>-997</result_code><result_text>key=${secret} openapikey=${secret}</result_text></Result>`,
      secrets: [secret],
    });
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain(secret);
    expect(result.displayMessage).not.toContain(secret);
    expect(result.bodyText).not.toContain(secret);
    expect(result.message).toContain('[보호됨]');
  });
});

describe('redactElevenSecrets / toUserFacingElevenErrorMessage', () => {
  it('URL·오류 문구에서 openapikey 원문을 마스킹한다', () => {
    const key = 'raw-eleven-key-xyz';
    const leaked = `fetch failed https://api.11st.co.kr/rest?openapikey=${key} openapikey: ${key}`;
    const redacted = redactElevenSecrets(leaked, [key]);
    expect(redacted).not.toContain(key);
    expect(redacted).toMatch(/openapikey[=:]\s*\[보호됨\]/i);

    const facing = toUserFacingElevenErrorMessage(new Error(leaked), [key]);
    expect(facing).not.toContain(key);
    expect(facing).not.toMatch(/openapikey\s*[:=]\s*raw-eleven/i);
  });
});

describe('dlvNo identifier preservation', () => {
  it('keeps dlvNo through map → mallLineItemIds → extract', () => {
    const mapped = mapElevenOrderToStandardRow({
      ordNo: '20260701001',
      ordPrdSeq: '001',
      ordStat: '101',
      ordStatNm: '결제완료',
      ordPrdNm: '상품',
      slctPrdOptNm: '',
      ordOptWonStl: '',
      ordQty: '1',
      rcvrNm: '홍',
      rcvrTlphn: '',
      rcvrPrtblNo: '010',
      rcvrMailNo: '',
      rcvrBaseAddr: '서울',
      rcvrDtlsAddr: '',
      ordDlvReqCont: '',
      dlvMsg: '',
      ordNm: '',
      ordTlphnNo: '',
      ordPrtblTel: '',
      ordDt: '',
      ordStlEndDt: '',
      ordPayAmt: '1000',
      memID: '',
      dlvNo: 'REAL-DLV-77',
      addPrdYn: 'N',
      addPrdNo: '',
      invcNo: '',
      dlvEtprsCd: '',
      dlvMthdCd: '',
    });
    expect(mapped['묶음배송번호']).toBe('REAL-DLV-77');
    expect(mapped['상품주문번호']).toBe('20260701001-001');
    expect(mapped['추가상품']).toBe('N|null');

    const ids = collectMallLineItemIds([mapped as Record<string, string>]);
    expect(ids).toContain('bundle:REAL-DLV-77');
    expect(ids.some((id) => id.startsWith('elevenLine:'))).toBe(true);

    const lines = extractElevenLineIds(ids);
    expect(lines).toEqual([
      {
        ordNo: '20260701001',
        ordPrdSeq: '001',
        dlvNo: 'REAL-DLV-77',
        addPrdYn: 'N',
        addPrdNo: 'null',
        ordStat: '',
      },
    ]);
    expect(parseElevenProductOrderNo('20260701001-001')).toEqual({
      ordNo: '20260701001',
      ordPrdSeq: '001',
    });
  });
});

describe('runElevenConfirm', () => {
  it('confirms complete orders, skips packaging, preserves partial failures', async () => {
    const req = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, code: '0', message: '', displayMessage: 'ok', bodyText: '' })
      .mockResolvedValueOnce({
        ok: false,
        code: '-1',
        message: 'fail',
        displayMessage: '[-1] fail',
        bodyText: '',
      });

    const result = await runElevenConfirm({
      items: [
        {
          ordNo: '1',
          ordPrdSeq: '1',
          dlvNo: 'D1',
          ordStat: '101',
          ordStatNm: '결제완료',
        },
        {
          ordNo: '2',
          ordPrdSeq: '1',
          dlvNo: 'D2',
          ordStat: '201',
          ordStatNm: '배송준비중',
        },
        {
          ordNo: '3',
          ordPrdSeq: '1',
          dlvNo: 'D3',
          ordStat: '101',
          ordStatNm: '결제완료',
        },
        {
          ordNo: '4',
          ordPrdSeq: '1',
          dlvNo: 'D4',
          ordStat: '401',
          ordStatNm: '배송중',
        },
      ],
      reqPackaging: req,
    });

    expect(result.confirmedCount).toBe(1);
    expect(result.alreadyConfirmedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.results).toHaveLength(4);
    expect(req).toHaveBeenCalledTimes(2);
    expect(req.mock.calls[0][0]).toMatchObject({
      ordNo: '1',
      ordPrdSeq: '1',
      dlvNo: 'D1',
      addPrdYn: 'N',
      addPrdNo: 'null',
    });
  });

  it('rejects invalid confirm payloads', () => {
    expect(validateElevenConfirmItems([]).ok).toBe(false);
    expect(
      validateElevenConfirmItems([{ ordNo: '1', ordPrdSeq: '1', dlvNo: '' }]).ok,
    ).toBe(false);
  });
});

describe('runElevenInvoiceTransmission', () => {
  beforeEach(() => {
    elevenReqDeliveryMock.mockReset();
    toElevenCredentialsMock.mockReset();
    toElevenCredentialsMock.mockReturnValue({ openapikey: 'test-key' });
  });

  it('sends reqdelivery with guide params and succeeds only on XML success code', async () => {
    elevenReqDeliveryMock.mockResolvedValue({
      ok: true,
      code: '0',
      message: '',
      displayMessage: 'ok',
      bodyText: '<Result><result_code>0</result_code></Result>',
    });

    const fixed = new Date('2026-08-08T05:30:00.000Z'); // KST 14:30
    const result = await runElevenInvoiceTransmission({
      credentials: { openapikey: 'test-key' },
      mallOrderNo: '20260701001',
      mallLineItemIds: buildElevenMallLineItemIds({
        ordNo: '20260701001',
        ordPrdSeq: '001',
        dlvNo: 'DLV-99',
      }),
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
      trackingNumber: '123456789012',
      now: () => fixed,
      reqDelivery: elevenReqDeliveryMock,
    });

    expect(result.success).toBe(true);
    expect(result.outcomeKind).toBe('success');
    expect(elevenReqDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sendDt: formatElevenApiDateTime(fixed),
        dlvMthdCd: '01',
        dlvEtprsCd: '00034',
        invcNo: '123456789012',
        dlvNo: 'DLV-99',
        partDlvYn: 'N',
        ordNo: '20260701001',
        ordPrdSeq: '001',
      }),
    );
  });

  it('fails on HTTP-200-style XML error code without treating as success', async () => {
    const result = await runElevenInvoiceTransmission({
      credentials: { openapikey: 'test-key' },
      mallOrderNo: '20260701001',
      mallLineItemIds: buildElevenMallLineItemIds({
        ordNo: '20260701001',
        ordPrdSeq: '001',
        dlvNo: 'DLV-99',
      }),
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      reqDelivery: async () => ({
        ok: false,
        code: '-1',
        message: '이미 발송',
        displayMessage: '[-1] 이미 발송',
        bodyText: '<Result><result_code>-1</result_code><result_text>이미 발송</result_text></Result>',
      }),
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PROVIDER_REJECTED');
  });

  it('blocks unsupported courier before external call', async () => {
    const req = vi.fn();
    const result = await runElevenInvoiceTransmission({
      credentials: { openapikey: 'test-key' },
      mallOrderNo: '20260701001',
      mallLineItemIds: buildElevenMallLineItemIds({
        ordNo: '20260701001',
        ordPrdSeq: '001',
        dlvNo: 'DLV-99',
      }),
      courierCode: 'UNKNOWN',
      courierName: '미지원택배',
      trackingNumber: '123456789012',
      reqDelivery: req,
    });
    expect(result.errorCode).toBe('COURIER_UNSUPPORTED');
    expect(req).not.toHaveBeenCalled();
  });

  it('does not call API when dlvNo/tracking missing', async () => {
    const req = vi.fn();
    const missingIds = await runElevenInvoiceTransmission({
      credentials: { openapikey: 'test-key' },
      mallOrderNo: '20260701001',
      mallLineItemIds: ['20260701001-001'],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123',
      reqDelivery: req,
    });
    expect(missingIds.errorCode).toBe('ELEVEN_LINE_IDS_MISSING');
    expect(req).not.toHaveBeenCalled();

    const missingTracking = await runElevenInvoiceTransmission({
      credentials: { openapikey: 'test-key' },
      mallOrderNo: '20260701001',
      mallLineItemIds: buildElevenMallLineItemIds({
        ordNo: '20260701001',
        ordPrdSeq: '001',
        dlvNo: 'DLV-99',
      }),
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '',
      reqDelivery: req,
    });
    expect(missingTracking.errorCode).toBe('TRACKING_NUMBER_MISSING');
    expect(req).not.toHaveBeenCalled();
  });
});

describe('Eleven live adapter registry', () => {
  beforeEach(() => {
    elevenReqDeliveryMock.mockReset();
    toElevenCredentialsMock.mockReset();
    toElevenCredentialsMock.mockReturnValue({ openapikey: 'test-key' });
  });

  it('does not return PROVIDER_SPEC_INCOMPLETE for ELEVEN', async () => {
    elevenReqDeliveryMock.mockResolvedValue({
      ok: true,
      code: '0',
      message: '',
      displayMessage: 'ok',
      bodyText: '',
    });

    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => account(),
    });

    const result = await registry.get('ELEVEN')!.transmit(candidate());
    expect(result.errorCode).not.toBe('PROVIDER_SPEC_INCOMPLETE');
    expect(result.success).toBe(true);
    expect(elevenReqDeliveryMock).toHaveBeenCalledTimes(1);
  });
});

describe('Eleven verify', () => {
  it('distinguishes confirmed / pending / mismatch / auth failure', async () => {
    const lines = extractElevenLineIds(
      buildElevenMallLineItemIds({
        ordNo: '20260701001',
        ordPrdSeq: '001',
        dlvNo: 'DLV-99',
      }),
    );

    expect(
      decideElevenVerifyFromOrders({
        lines,
        expectedTracking: 'TN1',
        expectedDlvEtprsCd: '00034',
        orders: [
          {
            ordNo: '20260701001',
            ordPrdSeq: '001',
            dlvNo: 'DLV-99',
            ordStat: '401',
            ordStatNm: '배송중',
            invcNo: 'TN1',
            dlvEtprsCd: '00034',
          },
        ],
      }).status,
    ).toBe('CONFIRMED');

    expect(
      decideElevenVerifyFromOrders({
        lines,
        expectedTracking: 'TN1',
        expectedDlvEtprsCd: '00034',
        orders: [
          {
            ordNo: '20260701001',
            ordPrdSeq: '001',
            dlvNo: 'DLV-99',
            ordStat: '201',
            ordStatNm: '배송준비중',
            invcNo: '',
          },
        ],
      }).status,
    ).toBe('PENDING');

    expect(
      decideElevenVerifyFromOrders({
        lines,
        expectedTracking: 'TN1',
        expectedDlvEtprsCd: '00034',
        orders: [
          {
            ordNo: '20260701001',
            ordPrdSeq: '001',
            dlvNo: 'DLV-99',
            invcNo: 'OTHER',
            dlvEtprsCd: '00034',
          },
        ],
      }).status,
    ).toBe('ATTENTION');

    expect(
      decideElevenVerifyFromOrders({
        lines,
        expectedTracking: 'TN1',
        expectedDlvEtprsCd: '00034',
        orders: [],
      }).status,
    ).toBe('PENDING');

    const verify = await runVerifyTransmissionService(
      {
        findAttempts: async () => [
          {
            id: 'a-11',
            userId: 'user-1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm1',
            provider: 'ELEVEN',
            integrationAccountId: 'acct-11',
            status: 'SUCCESS',
            mallOrderNo: '20260701001',
            mallLineItemIdsJson: buildElevenMallLineItemIds({
              ordNo: '20260701001',
              ordPrdSeq: '001',
              dlvNo: 'DLV-99',
            }),
            trackingNumberNormalized: 'TN1',
            courierCode: 'CJ',
            orderSyncOrder: null,
          },
        ],
        loadAccount: async () => account(),
        resolveElevenCredentials: () => ({ openapikey: 'k' }),
        fetchElevenOrders: async () => {
          throw new Error('[-997] 등록된 API 정보가 존재하지 않습니다');
        },
      },
      { userId: 'user-1', batchId: 'b1', attemptIds: ['a-11'] },
    );
    expect(verify.ok).toBe(true);
    if (!verify.ok) return;
    expect(verify.body.results[0]?.status).toBe('CHECK_FAILED');
  });
});

describe('Eleven confirm selection UI helpers', () => {
  it('selects only eleven payed/not-yet rows with dlvNo', () => {
    expect(
      isElevenConfirmableRow({
        mallId: 'eleven',
        status: 'PAYED',
        statusLabel: '결제완료',
        placeOrderStatus: 'NOT_YET',
      }),
    ).toBe(true);
    expect(
      isElevenConfirmableRow({
        mallId: 'eleven',
        status: 'PAYED',
        statusLabel: '배송준비중',
        placeOrderStatus: 'OK',
      }),
    ).toBe(false);

    const selection = collectSelectedElevenConfirmSelection(
      [
        {
          mallId: 'eleven',
          accountId: 'a1',
          rowIndex: 0,
          status: 'PAYED',
          statusLabel: '결제완료',
          placeOrderStatus: 'NOT_YET',
          orderNo: '20260701001',
          productOrderNo: '20260701001-001',
          shipmentBoxId: 'DLV-99',
          addPrdRaw: 'N|null',
        },
      ],
      new Set(['eleven:a1:0']),
      (mallId, accountId, rowIndex) => `${mallId}:${accountId}:${rowIndex}`,
    );
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.items[0]).toMatchObject({
      ordNo: '20260701001',
      ordPrdSeq: '001',
      dlvNo: 'DLV-99',
    });
  });
});
