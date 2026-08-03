import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertIntegrationProxyUrlAllowed,
  isIntegrationProxyHostAllowed,
} from '@/app/lib/integration-proxy/allowed-domains';
import {
  DOMEGGOOK_LIST_PAGE_SIZE,
  DOMEGGOOK_MAX_LIST_PAGES,
  dedupeDomeggookOrders,
  extractDomeggookListPagination,
  extractDomeggookOrderRecords,
  extractDomeggookSessionId,
  fetchDomeggookOrders,
  formatDomeggookSelectOpt,
  isDomeggookSuccessCode,
  parseDomeggookEnvelope,
  redactDomeggookSecrets,
  resolveDomeggookOutboundIp,
  testDomeggookConnection,
  toDomeggookOrderNoQueryValue,
  toUserFacingDomeggookErrorMessage,
} from '@/app/lib/domeggook/client';
import {
  mapDomeggookOrdersToOrderStandardFile,
  mapDomeggookOrdersToPreviewRows,
} from '@/app/lib/domeggook/map-domeggook-orders';

const credentials = {
  memberId: 'seller-demo',
  password: 'pw-secret-value',
  apiKey: 'aid-secret-value',
};

describe('integration proxy — domeggook host', () => {
  it('allows domeggook.com over https', () => {
    expect(isIntegrationProxyHostAllowed('domeggook.com')).toBe(true);
    expect(() =>
      assertIntegrationProxyUrlAllowed('https://domeggook.com/ssl/api/?mode=getOrderView'),
    ).not.toThrow();
  });
});

describe('resolveDomeggookOutboundIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP and does not invent an IP', () => {
    vi.stubEnv('NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP', '54.180.45.46');
    expect(resolveDomeggookOutboundIp()).toBe('54.180.45.46');
  });

  it('fails clearly when outbound IP env is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP', '');
    expect(() => resolveDomeggookOutboundIp()).toThrow(/NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP/);
  });
});

describe('domeggook response parsing', () => {
  it('treats common success codes as ok', () => {
    expect(isDomeggookSuccessCode('0')).toBe(true);
    expect(isDomeggookSuccessCode('00')).toBe(true);
    expect(isDomeggookSuccessCode('200')).toBe(true);
    expect(isDomeggookSuccessCode('E401')).toBe(false);
  });

  it('extracts sId without requiring a fixed envelope shape', () => {
    const envelope = parseDomeggookEnvelope(
      JSON.stringify({
        domeggook: {
          header: { code: '0', message: 'ok' },
          login: { sId: 'SESSION-XYZ', cId: 'CART-ABC' },
        },
      }),
    );
    expect(envelope.code).toBe('0');
    expect(extractDomeggookSessionId(envelope.root)).toBe('SESSION-XYZ');
  });

  it('extracts sell order list without inventing receiver fields', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0', message: 'ok', numberOfItems: 1 },
      items: [
        {
          orderNo: 'DG-100',
          itemTitle: '테스트상품',
          orderQty: 2,
          status: '결제완료',
          date: '2026-08-01',
          consumer: { deliReq: '문 앞' },
        },
      ],
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.receiverName).toBe('');
    expect(orders[0]?.receiverPhone).toBe('');
    expect(orders[0]?.receiverAddress).toBe('');
    const rows = mapDomeggookOrdersToPreviewRows(orders);
    expect(rows[0]?.['주문번호']).toBe('DG-100');
    expect(rows[0]?.['상품명']).toBe('테스트상품');
    expect(rows[0]?.['받는사람']).toBe('');
    expect(rows[0]?.['수량']).toBe('2');
  });

  it('maps getOrderView consumer fields and selectOpt into standard rows', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0', message: 'ok' },
      items: {
        orderNo: 3001,
        orderUid: 'uid-3001',
        orderQty: 2,
        status: '배송준비중',
        date: '2026-08-03 10:00:00',
        orderMemo: '공급사메모',
        item: { no: 11, title: '상세상품' },
        selectOpt: {
          opt: [
            { name: '색상:블랙', qty: 1 },
            { name: '사이즈:L', qty: 2 },
          ],
        },
        consumer: {
          name: '홍길동',
          phone: '02-111-2222',
          mobile: '010-1234-5678',
          zipcode: '06236',
          address: '서울시 강남구 테헤란로 1 101호',
          addr1: '서울시 강남구 테헤란로 1',
          addr2: '101호',
          deliReq: '경비실',
        },
        buyerInfo: {
          buyerName: '구매자명',
          buyerPhone: '010-9999-8888',
          buyerAddress: '구매자주소는수취인아님',
        },
      },
    });

    expect(orders).toHaveLength(1);
    const order = orders[0]!;
    expect(order.orderNo).toBe('3001');
    expect(order.orderUid).toBe('uid-3001');
    expect(order.productName).toBe('상세상품');
    expect(order.productOption).toBe('색상:블랙 / 사이즈:L x2');
    expect(order.receiverName).toBe('홍길동');
    expect(order.receiverPhone).toBe('010-1234-5678');
    expect(order.postalCode).toBe('06236');
    expect(order.receiverAddress).toBe('서울시 강남구 테헤란로 1 101호');
    expect(order.deliveryMemo).toBe('경비실');
    // buyerInfo는 수취인으로 쓰지 않음
    expect(order.receiverName).not.toBe('구매자명');
    expect(order.receiverAddress).not.toContain('구매자주소');

    const file = mapDomeggookOrdersToOrderStandardFile(orders);
    const row = file.rows[0]!;
    expect(row['받는사람']).toBe('홍길동');
    expect(row['받는사람전화1']).toBe('01012345678');
    expect(row['받는사람우편번호']).toBe('06236');
    expect(row['받는사람주소1']).toBe('서울시 강남구 테헤란로 1 101호');
    expect(row['상품옵션']).toBe('색상:블랙 / 사이즈:L x2');
    expect(row['상품명']).toBe('상세상품');
    expect(row['수량']).toBe('2');
    expect(row['판매처']).toBe('도매꾹');
  });

  it('joins addr1+addr2 when address is absent and does not invent missing parts', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0' },
      items: {
        orderNo: 4001,
        item: { title: '주소분리' },
        orderQty: 1,
        consumer: {
          name: '김수취',
          mobile: '01022223333',
          addr1: '부산시 해운대구',
          addr2: '우동 1',
        },
      },
    });
    expect(orders[0]?.receiverAddress).toBe('부산시 해운대구 우동 1');
    expect(orders[0]?.receiverAddress1).toBe('부산시 해운대구');
    expect(orders[0]?.receiverAddress2).toBe('우동 1');
    expect(orders[0]?.postalCode).toBe('');
  });

  it('formats selectOpt single object', () => {
    expect(formatDomeggookSelectOpt({ opt: { name: '옵션A', qty: 1 } })).toBe('옵션A');
    expect(formatDomeggookSelectOpt(undefined)).toBe('');
  });

  it('strips OR prefix for getOrderView no param and rejects non-numeric orderNo', () => {
    expect(toDomeggookOrderNoQueryValue('OR12345')).toBe('12345');
    expect(toDomeggookOrderNoQueryValue('12345')).toBe('12345');
    expect(toDomeggookOrderNoQueryValue('')).toBe('');
    expect(toDomeggookOrderNoQueryValue('DG-100')).toBe('');
    expect(toDomeggookOrderNoQueryValue('A-1')).toBe('');
  });

  it('dedupes by orderUid then orderNo', () => {
    const base = {
      productName: '',
      productOption: '',
      quantity: '1',
      receiverName: '',
      receiverPhone: '',
      receiverAddress: '',
      receiverAddress1: '',
      receiverAddress2: '',
      postalCode: '',
      orderStatus: '',
      orderedAt: '',
      deliveryMemo: '',
      raw: {},
    };
    const deduped = dedupeDomeggookOrders([
      { ...base, orderNo: '1', orderUid: 'u-1' },
      { ...base, orderNo: '1', orderUid: 'u-1' },
      { ...base, orderNo: '2', orderUid: '' },
      { ...base, orderNo: '2', orderUid: '' },
    ]);
    expect(deduped.map((o) => o.orderNo)).toEqual(['1', '2']);
  });

  it('reads list pagination header fields', () => {
    expect(
      extractDomeggookListPagination({
        header: { code: '0', currentPage: 2, numberOfPages: 5, numberOfItems: 50 },
      }),
    ).toEqual({ currentPage: 2, numberOfPages: 5, numberOfItems: 50 });
  });

  it('keeps receiver empty when consumer is absent and does not use buyerInfo', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0' },
      items: {
        orderNo: 7001,
        item: { title: '상품' },
        orderQty: 1,
        buyerInfo: {
          buyerName: '구매자',
          buyerMobile: '01099998888',
          buyerAddress: '구매자주소',
        },
      },
    });
    expect(orders[0]?.receiverName).toBe('');
    expect(orders[0]?.receiverPhone).toBe('');
    expect(orders[0]?.receiverAddress).toBe('');
  });

  it('treats single-item items object as one order (not inventing address)', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0', numberOfItems: 1 },
      items: {
        orderNo: 2001,
        orderUid: 'uid-2001',
        itemTitle: '단건상품',
        orderQty: 1,
        status: '배송준비중',
        date: '20260802',
      },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.orderNo).toBe('2001');
    expect(orders[0]?.productName).toBe('단건상품');
    expect(orders[0]?.receiverName).toBe('');
    expect(orders[0]?.receiverAddress).toBe('');
  });

  it('parses multi-item items array', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0', numberOfItems: 2 },
      items: [
        { orderNo: 'A-1', itemTitle: '상품A', orderQty: 1, status: '결제완료' },
        { orderNo: 'A-2', itemTitle: '상품B', orderQty: 3, status: '배송중' },
      ],
    });
    expect(orders.map((o) => o.orderNo)).toEqual(['A-1', 'A-2']);
  });

  it('returns empty list for success with no orders', () => {
    expect(
      extractDomeggookOrderRecords({
        header: { code: '0', message: 'ok', numberOfItems: 0 },
        items: [],
      }),
    ).toEqual([]);
  });

  it('does not invent quantity when orderQty is missing', () => {
    const orders = extractDomeggookOrderRecords({
      header: { code: '0' },
      items: { orderNo: 'Q-1', itemTitle: '수량없음', status: '결제완료' },
    });
    expect(orders[0]?.quantity).toBe('');
  });
});

describe('redactDomeggookSecrets', () => {
  it('redacts password, api key, and sId/cId fragments', () => {
    const text = redactDomeggookSecrets(
      'login fail pw=pw-secret-value aid=aid-secret-value sId=SESSION-XYZ cId=CART-ABC',
      ['pw-secret-value', 'aid-secret-value', 'SESSION-XYZ'],
    );
    expect(text).not.toContain('pw-secret-value');
    expect(text).not.toContain('aid-secret-value');
    expect(text).not.toContain('SESSION-XYZ');
    expect(text).not.toContain('CART-ABC');
    expect(text).toContain('[보호됨]');
  });
});

describe('toUserFacingDomeggookErrorMessage', () => {
  it('distinguishes api key, permission, login, and rate limit', () => {
    expect(toUserFacingDomeggookErrorMessage({ httpStatus: 401 })).toMatch(/API Key/);
    expect(toUserFacingDomeggookErrorMessage({ httpStatus: 403, message: '권한 없음' })).toMatch(/권한/);
    expect(toUserFacingDomeggookErrorMessage({ message: '로그인 실패' })).toMatch(/로그인/);
    expect(toUserFacingDomeggookErrorMessage({ httpStatus: 429 })).toMatch(/호출 제한/);
  });
});

describe('testDomeggookConnection', () => {
  it('requires setLogin then getOrderList and treats empty list as success', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', message: 'ok' },
          login: { sId: 'SESSION-ONLY-IN-MEMORY', cId: 'CID-SECRET' },
        }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', message: 'ok', numberOfItems: 0 },
          items: [],
        }),
      });

    const result = await testDomeggookConnection({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    });

    expect(result).toEqual({ ok: true, orderCount: 0 });
    expect(http).toHaveBeenCalledTimes(2);

    const loginCall = http.mock.calls[0]![0];
    expect(loginCall.method).toBe('POST');
    expect(loginCall.url).toContain('domeggook.com/ssl/api');
    expect(String(loginCall.body)).toContain('mode=setLogin');
    expect(String(loginCall.body)).toContain('ip=54.180.45.46');
    expect(String(loginCall.body)).toContain('userAgent=EXCLOAD');
    expect(String(loginCall.body)).not.toContain('setOrdChk');
    expect(String(loginCall.body)).not.toContain('setOrdOkDeli');

    const orderCall = http.mock.calls[1]![0];
    expect(orderCall.method).toBe('GET');
    expect(String(orderCall.url)).toContain('mode=getOrderList');
    expect(String(orderCall.url)).toContain('for=sell');
    expect(String(orderCall.url)).toContain('sId=SESSION-ONLY-IN-MEMORY');

    expect(JSON.stringify(result)).not.toContain('SESSION-ONLY-IN-MEMORY');
    expect(JSON.stringify(result)).not.toContain('CID-SECRET');
  });

  it('maps HTTP 200 body error code to failure', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: JSON.stringify({
        header: { code: 'E401', message: 'API Key invalid aid=aid-secret-value' },
      }),
    });

    await expect(
      testDomeggookConnection({
        credentials,
        outboundIp: '54.180.45.46',
        http,
      }),
    ).rejects.toThrow(/API Key/);

    const thrown = await testDomeggookConnection({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    }).catch((error: unknown) => error);
    expect(String(thrown)).not.toContain('aid-secret-value');
  });

  it('never calls mutation modes', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S1' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, list: [] }),
      });

    await testDomeggookConnection({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    });

    const payloads = http.mock.calls.map((call) => `${call[0].url}\n${call[0].body ?? ''}`);
    for (const payload of payloads) {
      expect(payload).not.toMatch(/setOrdChk|setOrdOkDeli|setOrdDeny/);
    }
  });
});

describe('fetchDomeggookOrders — pagination and getOrderView safety', () => {
  it('skips getOrderView when list is empty', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-EMPTY' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', currentPage: 1, numberOfPages: 0, numberOfItems: 0 },
          items: [],
        }),
      });

    const orders = await fetchDomeggookOrders({
      credentials,
      outboundIp: '54.180.45.46',
      days: 1,
      http,
    });

    expect(orders).toEqual([]);
    expect(http).toHaveBeenCalledTimes(2);
    const urls = http.mock.calls.map((call) => String(call[0].url));
    expect(urls.some((url) => url.includes('mode=getOrderView'))).toBe(false);
  });

  it('fetches all list pages with ic=50 and dedupes cross-page duplicates', async () => {
    const http = vi.fn().mockImplementation(async (req: { url: string; method: string; body?: string | null }) => {
      if (req.method === 'POST') {
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-PAGES' } }),
        };
      }
      const url = String(req.url);
      if (url.includes('mode=getOrderList') && url.includes('pg=1')) {
        expect(url).toContain(`ic=${DOMEGGOOK_LIST_PAGE_SIZE}`);
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({
            header: { code: '0', currentPage: 1, numberOfPages: 2, numberOfItems: 2 },
            items: [
              { orderNo: 101, orderUid: 'uid-101', itemTitle: 'P1-A', orderQty: 1 },
              { orderNo: 102, orderUid: 'uid-102', itemTitle: 'P1-B', orderQty: 1 },
            ],
          }),
        };
      }
      if (url.includes('mode=getOrderList') && url.includes('pg=2')) {
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({
            header: { code: '0', currentPage: 2, numberOfPages: 2, numberOfItems: 2 },
            // 페이지 간 중복 uid-101
            items: {
              orderNo: 101,
              orderUid: 'uid-101',
              itemTitle: 'P2-dup',
              orderQty: 1,
            },
          }),
        };
      }
      if (url.includes('mode=getOrderView') && url.includes('uid=uid-101')) {
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({
            header: { code: '0' },
            items: {
              orderNo: 101,
              orderUid: 'uid-101',
              orderQty: 1,
              item: { title: '상세101' },
              consumer: { name: '수취A', mobile: '01011110001' },
            },
          }),
        };
      }
      if (url.includes('mode=getOrderView') && url.includes('uid=uid-102')) {
        return {
          httpStatus: 200,
          bodyText: JSON.stringify({
            header: { code: '0' },
            items: {
              orderNo: 102,
              orderUid: 'uid-102',
              orderQty: 1,
              item: { title: '상세102' },
              selectOpt: {
                opt: [
                  { name: '색:레드', qty: 1 },
                  { name: '사이즈:M', qty: 1 },
                ],
              },
              consumer: { name: '수취B', mobile: '01011110002', addr1: '서울', addr2: '1호' },
            },
          }),
        };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const orders = await fetchDomeggookOrders({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    });

    expect(orders.map((o) => o.orderNo)).toEqual(['101', '102']);
    expect(orders[1]?.productOption).toBe('색:레드 / 사이즈:M');
    const listCalls = http.mock.calls.filter((call) => String(call[0].url).includes('mode=getOrderList'));
    const viewCalls = http.mock.calls.filter((call) => String(call[0].url).includes('mode=getOrderView'));
    expect(listCalls).toHaveLength(2);
    expect(viewCalls).toHaveLength(2);
  });

  it('fails explicitly when numberOfPages is missing while orders exist', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-BAD-PAGE' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', numberOfItems: 1 },
          items: [{ orderNo: 1, orderUid: 'u1', itemTitle: 'X', orderQty: 1 }],
        }),
      });

    await expect(
      fetchDomeggookOrders({
        credentials,
        outboundIp: '54.180.45.46',
        http,
      }),
    ).rejects.toThrow(/numberOfPages|페이지 정보/);
  });

  it('fails explicitly when numberOfPages exceeds safety limit', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-LIMIT' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: {
            code: '0',
            currentPage: 1,
            numberOfPages: DOMEGGOOK_MAX_LIST_PAGES + 1,
            numberOfItems: 1,
          },
          items: [{ orderNo: 1, orderUid: 'u1', itemTitle: 'X', orderQty: 1 }],
        }),
      });

    await expect(
      fetchDomeggookOrders({
        credentials,
        outboundIp: '54.180.45.46',
        http,
      }),
    ).rejects.toThrow(new RegExp(`안전 한도\\(${DOMEGGOOK_MAX_LIST_PAGES}`));
  });

  it('calls getOrderView v4.1 sequentially and prefers uid', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-DETAIL' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', currentPage: 1, numberOfPages: 1, numberOfItems: 1 },
          items: [{ orderNo: 'OR9001', orderUid: 'uid-9001', itemTitle: '목록상품', orderQty: 1 }],
        }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0' },
          items: {
            orderNo: 9001,
            orderUid: 'uid-9001',
            orderQty: 1,
            status: '결제완료',
            date: '2026-08-03',
            item: { title: '상세상품명' },
            selectOpt: { opt: { name: '옵션X', qty: 1 } },
            consumer: {
              name: '이수취',
              mobile: '010-7777-6666',
              zipcode: '12345',
              address: '인천시 연수구 송도동 1',
              deliReq: '문앞',
            },
          },
        }),
      });

    const orders = await fetchDomeggookOrders({
      credentials,
      outboundIp: '54.180.45.46',
      days: 1,
      http,
    });

    expect(http).toHaveBeenCalledTimes(3);
    const viewUrl = String(http.mock.calls[2]![0].url);
    expect(viewUrl).toContain('mode=getOrderView');
    expect(viewUrl).toContain('ver=4.1');
    expect(viewUrl).toContain('for=sell');
    expect(viewUrl).toContain('uid=uid-9001');

    expect(orders).toHaveLength(1);
    expect(orders[0]?.receiverName).toBe('이수취');
    expect(orders[0]?.productName).toBe('상세상품명');
    expect(orders[0]?.productOption).toBe('옵션X');
    expect(JSON.stringify(orders.map(({ raw: _r, ...rest }) => rest))).not.toContain('S-DETAIL');
    expect(JSON.stringify(orders.map(({ raw: _r, ...rest }) => rest))).not.toContain('pw-secret-value');

    const payloads = http.mock.calls.map((call) => `${call[0].url}\n${call[0].body ?? ''}`);
    for (const payload of payloads) {
      expect(payload).not.toMatch(/setOrdChk|setOrdOkDeli|setOrdDeny/);
    }
  });

  it('uses no= numeric when uid is absent', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-NO' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', currentPage: 1, numberOfPages: 1, numberOfItems: 1 },
          items: [{ orderNo: 'OR555', itemTitle: '목록', orderQty: 1 }],
        }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0' },
          items: {
            orderNo: 555,
            orderQty: 1,
            item: { title: '상세' },
            consumer: { name: '박수취', mobile: '01011112222' },
          },
        }),
      });

    await fetchDomeggookOrders({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    });

    const viewUrl = String(http.mock.calls[2]![0].url);
    expect(viewUrl).toContain('no=555');
    expect(viewUrl).not.toContain('uid=');
  });

  it('fails when list order lacks uid and numeric orderNo', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-BAD-ID' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', currentPage: 1, numberOfPages: 1, numberOfItems: 1 },
          items: [{ orderNo: 'DG-100', itemTitle: '식별불가', orderQty: 1 }],
        }),
      });

    await expect(
      fetchDomeggookOrders({
        credentials,
        outboundIp: '54.180.45.46',
        http,
      }),
    ).rejects.toThrow(/식별값|주문번호/);
    expect(http.mock.calls.some((call) => String(call[0].url).includes('mode=getOrderView'))).toBe(false);
  });

  it('fails the whole fetch when a mid detail call fails (no empty-receiver success)', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-MID-FAIL' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', currentPage: 1, numberOfPages: 1, numberOfItems: 2 },
          items: [
            { orderNo: 1, orderUid: 'uid-ok', itemTitle: 'A', orderQty: 1 },
            { orderNo: 2, orderUid: 'uid-fail', itemTitle: 'B', orderQty: 1 },
          ],
        }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0' },
          items: {
            orderNo: 1,
            orderUid: 'uid-ok',
            orderQty: 1,
            item: { title: 'A상세' },
            consumer: { name: '수취OK', mobile: '01000001111' },
          },
        }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: 'E500', message: 'view fail aid=aid-secret-value sId=S-MID-FAIL' },
        }),
      });

    const thrown = await fetchDomeggookOrders({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    }).catch((error: unknown) => error);

    expect(String(thrown)).toMatch(/상세조회에 실패|전체 주문 조회를 중단/);
    expect(String(thrown)).not.toContain('aid-secret-value');
    expect(String(thrown)).not.toContain('S-MID-FAIL');
    expect(String(thrown)).not.toContain('pw-secret-value');
  });

  it('allows detail success without consumer (empty receiver, no buyerInfo fallback)', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'S-NO-CONSUMER' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0', currentPage: 1, numberOfPages: 1, numberOfItems: 1 },
          items: [{ orderNo: 88, orderUid: 'uid-88', itemTitle: '목록', orderQty: 1 }],
        }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({
          header: { code: '0' },
          items: {
            orderNo: 88,
            orderUid: 'uid-88',
            orderQty: 1,
            item: { title: '상세' },
            buyerInfo: { buyerName: '구매자대체금지', buyerMobile: '01099990000' },
          },
        }),
      });

    const orders = await fetchDomeggookOrders({
      credentials,
      outboundIp: '54.180.45.46',
      http,
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.receiverName).toBe('');
    expect(orders[0]?.receiverPhone).toBe('');
    expect(orders[0]?.productName).toBe('상세');
  });
});
