import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (tagName) =>
    tagName === 'order_data' ||
    tagName === 'orderGoodsData' ||
    tagName === 'orderInfoData' ||
    tagName === 'orderDeliveryData',
});

const builder = new XMLBuilder({
  ignoreAttributes: true,
  suppressEmptyNode: true,
});

export function buildGodomallRequestXml(fields: Record<string, string | number | undefined>): string {
  const payload: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    payload[key] = text;
  }

  const body = builder.build({ data: payload });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

export function parseGodomallResponseXml(bodyText: string): Record<string, unknown> {
  try {
    const parsed = parser.parse(bodyText) as { data?: Record<string, unknown> };
    if (!parsed?.data || typeof parsed.data !== 'object') {
      throw new Error('고도몰 API 응답 XML에 data 노드가 없습니다.');
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.message.includes('data 노드')) {
      throw error;
    }
    throw new Error('고도몰 API 응답 XML 파싱에 실패했습니다.');
  }
}

export function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (typeof value === 'object') {
    return [value as Record<string, unknown>];
  }
  return [];
}
