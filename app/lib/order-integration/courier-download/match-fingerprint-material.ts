/**
 * 매칭 지문 재료·파싱 — 브라우저/서버 공용 (node:crypto 금지).
 */

export type MatchFingerprintMaterial = {
  receiverPhone?: string | null;
  receiverName?: string | null;
  receiverAddress?: string | null;
};

export type ParsedMatchFingerprint = {
  phone?: string;
  name?: string;
  address?: string;
};

export function parseMatchFingerprintHmac(
  raw: string | null | undefined,
): ParsedMatchFingerprint | null {
  const text = raw?.trim();
  if (!text || !text.startsWith('v1|')) return null;
  const out: ParsedMatchFingerprint = {};
  for (const part of text.split('|').slice(1)) {
    if (part.startsWith('p:')) out.phone = part.slice(2);
    else if (part.startsWith('n:')) out.name = part.slice(2);
    else if (part.startsWith('a:')) out.address = part.slice(2);
  }
  return out.phone || out.name || out.address ? out : null;
}

/** 미리보기 표준행·표시행에서 지문 재료 추출 (서버 HMAC 전 일시 사용) */
export function extractMatchFingerprintMaterialFromRow(
  row: Record<string, unknown> | null | undefined,
): MatchFingerprintMaterial {
  if (!row) return {};
  const str = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };
  const phone = str(
    '받는사람전화1',
    '받는분전화번호',
    '수취인전화',
    '전화번호',
    'receiverPhone',
  );
  const name = str('받는사람', '받는분성명', '수취인', 'receiverName');
  const addr1 = str('받는사람주소1', '받는분주소', '주소', 'receiverAddress');
  const addr2 = str('받는사람주소2');
  const address = [addr1, addr2].filter(Boolean).join(' ').trim() || addr1;
  return { receiverPhone: phone, receiverName: name, receiverAddress: address };
}
