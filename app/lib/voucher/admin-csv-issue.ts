import {
  CSV_MAX_QTY_PER_ROW,
  CSV_MAX_ROWS,
  CSV_MAX_VOUCHERS_PER_BATCH,
  parseCsvText,
} from '@/app/lib/voucher/csv-parse';
import type { IssueUnitInput } from '@/app/lib/voucher/admin-issue';

export type CsvColumnMapping = {
  externalOrderId: string;
  rewardKey: string;
  quantity?: string | null;
  purchaseAmount?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  externalRewardName?: string | null;
  cancelFlag?: string | null;
  unitIndex?: string | null;
};

export type RewardNameMap = Record<string, string>; // external name -> rewardPolicyId

export type PreviewRow =
  | {
      kind: 'ok';
      externalOrderId: string;
      unitIndex: number;
      rewardPolicyId: string;
      externalRewardName: string;
      purchaseAmount: number | null;
      buyerName: string | null;
      buyerEmail: string | null;
    }
  | {
      kind: 'error';
      rowNumber: number;
      message: string;
      externalOrderId?: string;
    };

function col(row: string[], headers: string[], name: string | null | undefined): string {
  if (!name) return '';
  const idx = headers.indexOf(name);
  if (idx < 0) return '';
  return (row[idx] ?? '').trim();
}

function parseQty(raw: string, rowIsOneUnit: boolean): number | null {
  if (rowIsOneUnit && !raw) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function buildIssuePreviewFromCsv(input: {
  csvText: string;
  mapping: CsvColumnMapping;
  rewardNameMap: RewardNameMap;
  rowIsOneUnit?: boolean;
}): {
  headers: string[];
  previewRows: PreviewRow[];
  units: IssueUnitInput[];
  uniqueRewardNames: string[];
  estimatedCodes: number;
  errors: number;
} {
  const { headers, rows } = parseCsvText(input.csvText);
  if (headers.length === 0) {
    return {
      headers: [],
      previewRows: [{ kind: 'error', rowNumber: 0, message: 'CSV 헤더가 없습니다.' }],
      units: [],
      uniqueRewardNames: [],
      estimatedCodes: 0,
      errors: 1,
    };
  }
  if (rows.length > CSV_MAX_ROWS) {
    return {
      headers,
      previewRows: [
        {
          kind: 'error',
          rowNumber: 0,
          message: `행 수가 상한(${CSV_MAX_ROWS})을 초과합니다.`,
        },
      ],
      units: [],
      uniqueRewardNames: [],
      estimatedCodes: 0,
      errors: 1,
    };
  }

  const required = [input.mapping.externalOrderId, input.mapping.rewardKey];
  for (const h of required) {
    if (!headers.includes(h)) {
      return {
        headers,
        previewRows: [
          { kind: 'error', rowNumber: 0, message: `필수 헤더가 없습니다: ${h}` },
        ],
        units: [],
        uniqueRewardNames: [],
        estimatedCodes: 0,
        errors: 1,
      };
    }
  }

  const previewRows: PreviewRow[] = [];
  const units: IssueUnitInput[] = [];
  const rewardNames = new Set<string>();
  const seenKeys = new Set<string>();
  let errors = 0;

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const externalOrderId = col(row, headers, input.mapping.externalOrderId);
    const rewardRaw = col(row, headers, input.mapping.rewardKey);
    const qtyRaw = col(row, headers, input.mapping.quantity);
    const amountRaw = col(row, headers, input.mapping.purchaseAmount);
    const buyerName = col(row, headers, input.mapping.buyerName) || null;
    const buyerEmail = col(row, headers, input.mapping.buyerEmail) || null;
    const extName =
      col(row, headers, input.mapping.externalRewardName) || rewardRaw || null;

    if (!externalOrderId) {
      errors += 1;
      previewRows.push({
        kind: 'error',
        rowNumber,
        message: '주문번호가 비어 있습니다.',
      });
      return;
    }
    if (!rewardRaw) {
      errors += 1;
      previewRows.push({
        kind: 'error',
        rowNumber,
        message: '리워드 식별값이 비어 있습니다.',
        externalOrderId,
      });
      return;
    }

    rewardNames.add(rewardRaw);
    const rewardPolicyId = input.rewardNameMap[rewardRaw];
    if (!rewardPolicyId) {
      errors += 1;
      previewRows.push({
        kind: 'error',
        rowNumber,
        message: `리워드 미매핑: ${rewardRaw}`,
        externalOrderId,
      });
      return;
    }

    const qty = parseQty(qtyRaw, Boolean(input.rowIsOneUnit));
    if (qty == null) {
      errors += 1;
      previewRows.push({
        kind: 'error',
        rowNumber,
        message: '수량이 올바르지 않습니다.',
        externalOrderId,
      });
      return;
    }
    if (qty > CSV_MAX_QTY_PER_ROW) {
      errors += 1;
      previewRows.push({
        kind: 'error',
        rowNumber,
        message: `행 수량이 상한(${CSV_MAX_QTY_PER_ROW})을 초과합니다.`,
        externalOrderId,
      });
      return;
    }

    let purchaseAmount: number | null = null;
    if (amountRaw) {
      const n = Number(String(amountRaw).replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) {
        errors += 1;
        previewRows.push({
          kind: 'error',
          rowNumber,
          message: '구매금액이 올바르지 않습니다.',
          externalOrderId,
        });
        return;
      }
      purchaseAmount = Math.round(n);
    }

    for (let unitIndex = 0; unitIndex < qty; unitIndex++) {
      const key = `${externalOrderId}::${unitIndex}`;
      if (seenKeys.has(key)) {
        errors += 1;
        previewRows.push({
          kind: 'error',
          rowNumber,
          message: `파일 내 중복 주문단위: ${externalOrderId} #${unitIndex}`,
          externalOrderId,
        });
        continue;
      }
      seenKeys.add(key);
      units.push({
        externalOrderId,
        unitIndex,
        rewardPolicyId,
        externalRewardName: extName,
        purchaseAmount,
        buyerName,
        buyerEmail,
      });
      previewRows.push({
        kind: 'ok',
        externalOrderId,
        unitIndex,
        rewardPolicyId,
        externalRewardName: extName || rewardRaw,
        purchaseAmount,
        buyerName,
        buyerEmail,
      });
    }
  });

  if (units.length > CSV_MAX_VOUCHERS_PER_BATCH) {
    return {
      headers,
      previewRows: [
        {
          kind: 'error',
          rowNumber: 0,
          message: `생성 예정 코드 수가 상한(${CSV_MAX_VOUCHERS_PER_BATCH})을 초과합니다.`,
        },
      ],
      units: [],
      uniqueRewardNames: [...rewardNames],
      estimatedCodes: units.length,
      errors: errors + 1,
    };
  }

  return {
    headers,
    previewRows,
    units,
    uniqueRewardNames: [...rewardNames],
    estimatedCodes: units.length,
    errors,
  };
}

export function collectUniqueRewardNames(csvText: string, rewardHeader: string): string[] {
  const { headers, rows } = parseCsvText(csvText);
  const idx = headers.indexOf(rewardHeader);
  if (idx < 0) return [];
  const set = new Set<string>();
  for (const row of rows) {
    const v = (row[idx] ?? '').trim();
    if (v) set.add(v);
  }
  return [...set];
}
