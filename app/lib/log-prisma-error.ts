/**
 * Prisma 동기화 실패 로그 — Vercel 로그에서 code/meta 확인용
 */
import { Prisma } from '@prisma/client';

export function logPrismaError(context: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`[template-header-logs] ${context}: PrismaKnownRequestError`, {
      code: error.code,
      meta: error.meta,
      message: error.message,
      clientVersion: error.clientVersion,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(`[template-header-logs] ${context}: PrismaValidationError`, {
      message: error.message,
    });
    return;
  }

  console.error(`[template-header-logs] ${context}:`, error);
}
