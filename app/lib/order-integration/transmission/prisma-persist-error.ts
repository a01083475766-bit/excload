import { Prisma } from '@prisma/client';

import type { ShipmentTransmissionPersistReasonCode } from '@/app/lib/order-integration/transmission/repository';

export type ClassifiedPrismaPersistFailure = {
  reasonCode: Extract<
    ShipmentTransmissionPersistReasonCode,
    'ATTEMPT_NUMBER_CONFLICT' | 'PERSISTENCE_ERROR'
  >;
  /** 외부/결과에 넣어도 되는 짧은 메시지 (SQL·host·stack 없음) */
  safeMessage: string;
  /** 테스트용 Prisma code (P2002 등). 사용자 응답에 넣지 말 것 */
  prismaCode: string | null;
};

function isPrismaKnownRequestLike(
  error: unknown,
): error is { code: string; name?: string } {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return true;
  if (!error || typeof error !== 'object') return false;
  const rec = error as { code?: unknown; name?: unknown };
  return typeof rec.code === 'string' && rec.code.startsWith('P');
}

/**
 * Prisma 오류를 외부 노출 가능한 코드로만 정규화합니다.
 * message / meta / connection 정보는 반환하지 않습니다.
 */
export function classifyPrismaPersistFailure(error: unknown): ClassifiedPrismaPersistFailure {
  if (isPrismaKnownRequestLike(error)) {
    if (error.code === 'P2002') {
      return {
        reasonCode: 'ATTEMPT_NUMBER_CONFLICT',
        safeMessage: 'attempt number conflict',
        prismaCode: 'P2002',
      };
    }
    return {
      reasonCode: 'PERSISTENCE_ERROR',
      safeMessage: 'persistence error',
      prismaCode: error.code,
    };
  }

  const message = error instanceof Error ? error.message : '';
  // memory client / 래핑 Error 호환 (원문은 결과에 넣지 않음)
  if (/unique|Unique|P2002/i.test(message)) {
    return {
      reasonCode: 'ATTEMPT_NUMBER_CONFLICT',
      safeMessage: 'attempt number conflict',
      prismaCode: 'P2002',
    };
  }

  return {
    reasonCode: 'PERSISTENCE_ERROR',
    safeMessage: 'persistence error',
    prismaCode: null,
  };
}
