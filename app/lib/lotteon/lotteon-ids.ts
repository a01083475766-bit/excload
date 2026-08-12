export const LOTTEON_LINE_PREFIX = 'lotteonLine:';

export type LotteonLineIds = {
  odNo: string;
  odSeq: string;
  procSeq: string;
  spdNo: string;
  sitmNo: string;
  dvRtrvDvsCd: string;
  odTypCd: string;
  slQty: string;
  clmNo: string;
  odPrgsStepCd: string;
};

export function buildLotteonLineKey(ids: LotteonLineIds): string {
  return [
    LOTTEON_LINE_PREFIX + ids.odNo.trim(),
    ids.odSeq.trim(),
    ids.procSeq.trim() || '1',
    ids.spdNo.trim(),
    ids.sitmNo.trim(),
    ids.dvRtrvDvsCd.trim() || 'DV',
    ids.odTypCd.trim() || '10',
    ids.slQty.trim() || '1',
    ids.clmNo.trim(),
    ids.odPrgsStepCd.trim(),
  ].join('|');
}

export function parseLotteonLineKey(value: string): LotteonLineIds | null {
  const raw = value.trim();
  if (!raw.startsWith(LOTTEON_LINE_PREFIX)) return null;
  const parts = raw.slice(LOTTEON_LINE_PREFIX.length).split('|');
  if (parts.length < 10) return null;
  const [odNo, odSeq, procSeq, spdNo, sitmNo, dvRtrvDvsCd, odTypCd, slQty, clmNo, odPrgsStepCd] =
    parts;
  if (!odNo?.trim() || !odSeq?.trim()) return null;
  return {
    odNo: odNo.trim(),
    odSeq: odSeq.trim(),
    procSeq: (procSeq ?? '1').trim() || '1',
    spdNo: (spdNo ?? '').trim(),
    sitmNo: (sitmNo ?? '').trim(),
    dvRtrvDvsCd: (dvRtrvDvsCd ?? 'DV').trim() || 'DV',
    odTypCd: (odTypCd ?? '10').trim() || '10',
    slQty: (slQty ?? '1').trim() || '1',
    clmNo: (clmNo ?? '').trim(),
    odPrgsStepCd: (odPrgsStepCd ?? '').trim(),
  };
}

export function extractLotteonLineIds(
  mallLineItemIds: string[] | null | undefined,
  mallOrderNo?: string,
): LotteonLineIds[] {
  const result: LotteonLineIds[] = [];
  const seen = new Set<string>();
  for (const value of mallLineItemIds ?? []) {
    const parsed = parseLotteonLineKey(value);
    if (!parsed) continue;
    if (mallOrderNo && parsed.odNo !== mallOrderNo.trim()) continue;
    const key = `${parsed.odNo}|${parsed.odSeq}|${parsed.procSeq}|${parsed.clmNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }
  return result;
}

export function isLotteonClaimLine(ids: Pick<LotteonLineIds, 'odTypCd' | 'dvRtrvDvsCd' | 'odPrgsStepCd'>): boolean {
  if ((ids.dvRtrvDvsCd ?? '').trim().toUpperCase() === 'RTRV') return true;
  const typ = (ids.odTypCd ?? '').trim();
  if (['20', '30', '31', '40', '41', '50'].includes(typ)) return true;
  const step = (ids.odPrgsStepCd ?? '').trim();
  return ['21', '22', '23', '24', '25', '26', '27'].includes(step);
}

/** 타임아웃·지연 응답. 즉시 재시도 가능으로 취급하지 않는다. */
export function isLotteonTimeoutLikeMessage(message: string): boolean {
  return /timeout|timed?\s*out|시간\s*초과|ECONNABORTED|ETIMEDOUT|응답\s*없|504|408|지연/i.test(
    message,
  );
}
