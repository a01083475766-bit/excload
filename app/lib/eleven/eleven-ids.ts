/**
 * 11번가 발주확인·송장전송용 식별자.
 * 가이드(Seller REST):
 * - reqpackaging: ordNo, ordPrdSeq, addPrdYn, addPrdNo, dlvNo
 * - reqdelivery: sendDt, dlvMthdCd, dlvEtprsCd, invcNo, dlvNo, partDlvYn, ordNo, ordPrdSeq
 */

export const ELEVEN_ADD_PRD_YN_PREFIX = 'addPrdYn:';
export const ELEVEN_ADD_PRD_NO_PREFIX = 'addPrdNo:';
export const ELEVEN_BUNDLE_PREFIX = 'bundle:';
/** 라인별 식별자 — ordNo|ordPrdSeq|dlvNo|addPrdYn|addPrdNo */
export const ELEVEN_LINE_PREFIX = 'elevenLine:';

export type ElevenLineIds = {
  ordNo: string;
  ordPrdSeq: string;
  dlvNo: string;
  addPrdYn: 'Y' | 'N';
  /** 가이드: 추가구성 없으면 path에 문자열 null */
  addPrdNo: string;
  ordStat: string;
};

export function buildElevenProductOrderNo(ordNo: string, ordPrdSeq: string): string {
  const no = ordNo.trim();
  const seq = ordPrdSeq.trim();
  if (!no) return '';
  return seq ? `${no}-${seq}` : no;
}

export function parseElevenProductOrderNo(
  productOrderNo: string,
  fallbackOrdNo = '',
): { ordNo: string; ordPrdSeq: string } {
  const raw = productOrderNo.trim();
  if (!raw) {
    return { ordNo: fallbackOrdNo.trim(), ordPrdSeq: '' };
  }
  const idx = raw.lastIndexOf('-');
  if (idx <= 0 || idx >= raw.length - 1) {
    return { ordNo: raw, ordPrdSeq: '' };
  }
  return { ordNo: raw.slice(0, idx), ordPrdSeq: raw.slice(idx + 1) };
}

export function normalizeElevenAddPrdYn(value: string | null | undefined): 'Y' | 'N' {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'Y' ? 'Y' : 'N';
}

/** path용 addPrdNo — 추가구성 없으면 가이드대로 문자열 "null" */
export function normalizeElevenAddPrdNoForPath(
  addPrdYn: 'Y' | 'N',
  addPrdNo: string | null | undefined,
): string {
  if (addPrdYn !== 'Y') return 'null';
  const raw = String(addPrdNo ?? '').trim();
  return raw || 'null';
}

export function encodeElevenAddPrdYnId(addPrdYn: 'Y' | 'N'): string {
  return `${ELEVEN_ADD_PRD_YN_PREFIX}${addPrdYn}`;
}

export function encodeElevenAddPrdNoId(addPrdNoForPath: string): string {
  return `${ELEVEN_ADD_PRD_NO_PREFIX}${addPrdNoForPath}`;
}

export function extractElevenBundleDlvNo(
  mallLineItemIds: readonly string[] | null | undefined,
): string | null {
  if (!mallLineItemIds?.length) return null;
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (value.startsWith(ELEVEN_BUNDLE_PREFIX)) {
      const dlvNo = value.slice(ELEVEN_BUNDLE_PREFIX.length).trim();
      if (dlvNo) return dlvNo;
    }
  }
  return null;
}

export function extractElevenAddPrdYn(
  mallLineItemIds: readonly string[] | null | undefined,
): 'Y' | 'N' {
  if (!mallLineItemIds?.length) return 'N';
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (value.startsWith(ELEVEN_ADD_PRD_YN_PREFIX)) {
      return normalizeElevenAddPrdYn(value.slice(ELEVEN_ADD_PRD_YN_PREFIX.length));
    }
  }
  return 'N';
}

export function extractElevenAddPrdNo(
  mallLineItemIds: readonly string[] | null | undefined,
): string {
  if (!mallLineItemIds?.length) return 'null';
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (value.startsWith(ELEVEN_ADD_PRD_NO_PREFIX)) {
      const no = value.slice(ELEVEN_ADD_PRD_NO_PREFIX.length).trim();
      return no || 'null';
    }
  }
  return 'null';
}

export function extractElevenProductOrderKeys(
  mallLineItemIds: readonly string[] | null | undefined,
): Array<{ ordNo: string; ordPrdSeq: string }> {
  if (!mallLineItemIds?.length) return [];
  const out: Array<{ ordNo: string; ordPrdSeq: string }> = [];
  const seen = new Set<string>();
  for (const raw of mallLineItemIds) {
    const value = String(raw ?? '').trim();
    if (
      !value ||
      value.startsWith(ELEVEN_BUNDLE_PREFIX) ||
      value.startsWith(ELEVEN_ADD_PRD_YN_PREFIX) ||
      value.startsWith(ELEVEN_ADD_PRD_NO_PREFIX) ||
      value.startsWith(ELEVEN_LINE_PREFIX) ||
      value.startsWith('shop_no:')
    ) {
      continue;
    }
    const parsed = parseElevenProductOrderNo(value);
    if (!parsed.ordNo || !parsed.ordPrdSeq) continue;
    const key = `${parsed.ordNo}|${parsed.ordPrdSeq}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

export function encodeElevenLineId(input: {
  ordNo: string;
  ordPrdSeq: string;
  dlvNo: string;
  addPrdYn?: string | null;
  addPrdNo?: string | null;
}): string {
  const addPrdYn = normalizeElevenAddPrdYn(input.addPrdYn);
  const addPrdNo = normalizeElevenAddPrdNoForPath(addPrdYn, input.addPrdNo);
  return [
    ELEVEN_LINE_PREFIX,
    [input.ordNo.trim(), input.ordPrdSeq.trim(), input.dlvNo.trim(), addPrdYn, addPrdNo].join('|'),
  ].join('');
}

export function parseElevenLineId(raw: string): ElevenLineIds | null {
  const value = raw.trim();
  if (!value.startsWith(ELEVEN_LINE_PREFIX)) return null;
  const parts = value.slice(ELEVEN_LINE_PREFIX.length).split('|');
  if (parts.length < 5) return null;
  const [ordNo = '', ordPrdSeq = '', dlvNo = '', ynRaw = 'N', noRaw = 'null'] = parts;
  if (!ordNo.trim() || !ordPrdSeq.trim() || !dlvNo.trim()) return null;
  const addPrdYn = normalizeElevenAddPrdYn(ynRaw);
  return {
    ordNo: ordNo.trim(),
    ordPrdSeq: ordPrdSeq.trim(),
    dlvNo: dlvNo.trim(),
    addPrdYn,
    addPrdNo: normalizeElevenAddPrdNoForPath(addPrdYn, noRaw),
    ordStat: '',
  };
}

export function buildElevenMallLineItemIds(input: {
  ordNo: string;
  ordPrdSeq: string;
  dlvNo: string;
  addPrdYn?: string | null;
  addPrdNo?: string | null;
}): string[] {
  const ids: string[] = [];
  const productOrderNo = buildElevenProductOrderNo(input.ordNo, input.ordPrdSeq);
  if (productOrderNo) ids.push(productOrderNo);
  const dlvNo = input.dlvNo.trim();
  if (dlvNo) ids.push(`${ELEVEN_BUNDLE_PREFIX}${dlvNo}`);
  const addPrdYn = normalizeElevenAddPrdYn(input.addPrdYn);
  ids.push(encodeElevenAddPrdYnId(addPrdYn));
  ids.push(encodeElevenAddPrdNoId(normalizeElevenAddPrdNoForPath(addPrdYn, input.addPrdNo)));
  if (productOrderNo && dlvNo) {
    ids.push(
      encodeElevenLineId({
        ordNo: input.ordNo,
        ordPrdSeq: input.ordPrdSeq,
        dlvNo,
        addPrdYn: input.addPrdYn,
        addPrdNo: input.addPrdNo,
      }),
    );
  }
  return ids;
}

/** mallLineItemIds에서 전송·발주확인용 라인 목록 복원 */
export function extractElevenLineIds(
  mallLineItemIds: readonly string[] | null | undefined,
  fallbackOrdNo = '',
): ElevenLineIds[] {
  if (!mallLineItemIds?.length) return [];
  const fromComposite: ElevenLineIds[] = [];
  const seen = new Set<string>();
  for (const raw of mallLineItemIds) {
    const parsed = parseElevenLineId(String(raw ?? ''));
    if (!parsed) continue;
    const key = `${parsed.ordNo}|${parsed.ordPrdSeq}|${parsed.dlvNo}|${parsed.addPrdYn}|${parsed.addPrdNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fromComposite.push(parsed);
  }
  if (fromComposite.length > 0) return fromComposite;

  const dlvNo = extractElevenBundleDlvNo(mallLineItemIds) ?? '';
  const addPrdYn = extractElevenAddPrdYn(mallLineItemIds);
  const addPrdNo = extractElevenAddPrdNo(mallLineItemIds);
  const productKeys = extractElevenProductOrderKeys(mallLineItemIds);
  if (productKeys.length === 0 && fallbackOrdNo.trim()) {
    return [];
  }
  const out: ElevenLineIds[] = [];
  for (const key of productKeys) {
    if (!dlvNo) continue;
    const row: ElevenLineIds = {
      ordNo: key.ordNo,
      ordPrdSeq: key.ordPrdSeq,
      dlvNo,
      addPrdYn,
      addPrdNo,
      ordStat: '',
    };
    const dedupe = `${row.ordNo}|${row.ordPrdSeq}|${row.dlvNo}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(row);
  }
  return out;
}

export function isElevenConfirmableStatus(ordStat: string, ordStatNm = ''): boolean {
  const code = ordStat.trim();
  if (code === '101') return true;
  const label = ordStatNm.trim();
  return label === '결제완료';
}

export function isElevenAlreadyPackagingStatus(ordStat: string, ordStatNm = ''): boolean {
  const code = ordStat.trim();
  if (code === '201') return true;
  const label = ordStatNm.trim();
  return label === '배송준비중' || label.includes('발주확인');
}
