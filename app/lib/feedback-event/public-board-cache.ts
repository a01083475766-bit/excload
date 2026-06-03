import { prisma } from '@/app/lib/prisma';
import { invalidatePublicPostDetailCache } from '@/app/lib/feedback-event/public-post-detail-cache';

const PUBLIC_BOARD_TAKE = 20;
const CACHE_MS = 60_000;

export type PublicBoardRow = {
  id: string;
  userId: string;
  featureUsed: string;
  conversionResult: string;
  content: string;
  publicConsent: boolean;
  createdAt: Date;
};

let rowsCache: { at: number; rows: PublicBoardRow[] } | null = null;

let anonymousPayloadCache: {
  at: number;
  payload: Record<string, unknown>;
} | null = null;

export function invalidatePublicBoardCache(): void {
  rowsCache = null;
  anonymousPayloadCache = null;
  invalidatePublicPostDetailCache();
}

export async function getPublicBoardRows(): Promise<PublicBoardRow[]> {
  const now = Date.now();
  if (rowsCache && now - rowsCache.at < CACHE_MS) {
    return rowsCache.rows;
  }

  const rows = await prisma.feedbackSubmission.findMany({
    orderBy: { createdAt: 'desc' },
    take: PUBLIC_BOARD_TAKE,
    select: {
      id: true,
      userId: true,
      featureUsed: true,
      conversionResult: true,
      content: true,
      publicConsent: true,
      createdAt: true,
    },
  });

  rowsCache = { at: now, rows };
  return rows;
}

export function getCachedAnonymousPublicPayload(): Record<string, unknown> | null {
  if (!anonymousPayloadCache) return null;
  if (Date.now() - anonymousPayloadCache.at >= CACHE_MS) {
    anonymousPayloadCache = null;
    return null;
  }
  return anonymousPayloadCache.payload;
}

export function setCachedAnonymousPublicPayload(payload: Record<string, unknown>): void {
  anonymousPayloadCache = { at: Date.now(), payload };
}

export const PUBLIC_BOARD_CACHE_SECONDS = Math.floor(CACHE_MS / 1000);
