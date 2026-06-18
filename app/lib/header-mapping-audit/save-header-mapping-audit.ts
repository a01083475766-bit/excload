import { prisma } from '@/app/lib/prisma';

import type { HeaderMappingAuditEntry } from './build-header-mapping-audit';

export type HeaderMappingAuditSummary = {
  totalHeaders: number;
  autoMatchedCount: number;
  unmappedCount: number;
  lowConfidenceCount: number;
  needsReviewCount: number;
  entriesWithMaskedSamplesCount: number;
};

export type SaveHeaderMappingAuditLogInput = {
  entries: HeaderMappingAuditEntry[];
  summary: HeaderMappingAuditSummary;
  userId?: string | null;
  fileHash?: string | null;
  source?: string | null;
  expiresAt?: Date | null;
  throwOnError?: boolean;
};

export type SaveHeaderMappingAuditLogResult =
  | {
      ok: true;
      id: string;
      entryCount: number;
    }
  | {
      ok: false;
      skipped: boolean;
      error?: unknown;
    };

const DEFAULT_EXPIRES_IN_DAYS = 30;

function defaultExpiresAt(now = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRES_IN_DAYS);
  return expiresAt;
}

function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEntries(entries: HeaderMappingAuditEntry[]): HeaderMappingAuditEntry[] {
  return entries.filter((entry) => entry.originalHeader.trim().length > 0);
}

export function buildHeaderMappingAuditSummary(
  entries: HeaderMappingAuditEntry[],
): HeaderMappingAuditSummary {
  return {
    totalHeaders: entries.length,
    autoMatchedCount: entries.filter((entry) => entry.status === 'AUTO_MATCHED').length,
    unmappedCount: entries.filter((entry) => entry.status === 'UNMAPPED').length,
    lowConfidenceCount: entries.filter((entry) => entry.status === 'LOW_CONFIDENCE').length,
    needsReviewCount: entries.filter((entry) => entry.status === 'NEEDS_REVIEW').length,
    entriesWithMaskedSamplesCount: entries.filter((entry) => entry.hasMaskedSamples).length,
  };
}

export async function saveHeaderMappingAuditLog(
  input: SaveHeaderMappingAuditLogInput,
): Promise<SaveHeaderMappingAuditLogResult> {
  const entries = normalizeEntries(input.entries);
  if (entries.length === 0) {
    return {
      ok: false,
      skipped: true,
    };
  }

  try {
    const row = await prisma.$transaction(async (tx) =>
      tx.headerMappingAuditLog.create({
        data: {
          userId: optionalString(input.userId),
          fileHash: optionalString(input.fileHash),
          source: optionalString(input.source),
          totalHeaders: input.summary.totalHeaders,
          autoMatchedCount: input.summary.autoMatchedCount,
          unmappedCount: input.summary.unmappedCount,
          lowConfidenceCount: input.summary.lowConfidenceCount,
          needsReviewCount: input.summary.needsReviewCount,
          entriesWithMaskedSamplesCount: input.summary.entriesWithMaskedSamplesCount,
          expiresAt: input.expiresAt ?? defaultExpiresAt(),
          entries: {
            create: entries.map((entry) => ({
              originalHeader: entry.originalHeader,
              baseHeader: entry.baseHeader,
              status: entry.status,
              method: entry.method,
              confidenceReason: entry.confidenceReason || null,
              sampleValueType: entry.sampleValueType,
              maskedSamples: entry.maskedSamples,
              sampleCount: entry.sampleCount,
              hasMaskedSamples: entry.hasMaskedSamples,
            })),
          },
        },
        select: {
          id: true,
        },
      }),
    );

    return {
      ok: true,
      id: row.id,
      entryCount: entries.length,
    };
  } catch (error) {
    if (input.throwOnError) {
      throw error;
    }

    return {
      ok: false,
      skipped: false,
      error,
    };
  }
}
