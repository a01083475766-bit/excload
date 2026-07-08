import {
  formatExcloadOrderNoDateKey,
  generateExcloadOrderNo,
} from '@/app/lib/order-integration/snapshots/excload-order-no';
import type {
  OrderSyncPersistTransactionClient,
  ReserveExcloadOrderNosInput,
} from '@/app/lib/order-integration/snapshots/types';

export function buildExcloadOrderNoRange(input: {
  dateKey: string;
  startSequence: number;
  count: number;
}): string[] {
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new Error('count는 0 이상의 정수여야 합니다.');
  }
  if (input.count === 0) return [];
  if (!Number.isInteger(input.startSequence) || input.startSequence < 1) {
    throw new Error('startSequence는 1 이상의 정수여야 합니다.');
  }

  const result: string[] = [];
  for (let index = 0; index < input.count; index++) {
    result.push(
      generateExcloadOrderNo({
        dateKey: input.dateKey,
        sequence: input.startSequence + index,
      }),
    );
  }
  return result;
}

/**
 * dateKey 기준 ExcloadOrderNoSequence를 upsert하고 연속 EXC 번호를 예약합니다.
 * transaction client 안에서 호출해야 합니다.
 */
export async function reserveExcloadOrderNos(
  tx: OrderSyncPersistTransactionClient,
  input: ReserveExcloadOrderNosInput,
): Promise<string[]> {
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new Error('count는 0 이상의 정수여야 합니다.');
  }
  if (input.count === 0) return [];

  const dateKey = input.dateKey ?? formatExcloadOrderNoDateKey(input.date ?? new Date());

  const sequence = await tx.excloadOrderNoSequence.upsert({
    where: { dateKey },
    create: { dateKey, lastNumber: input.count },
    update: { lastNumber: { increment: input.count } },
  });

  const endSequence = sequence.lastNumber;
  const startSequence = endSequence - input.count + 1;

  return buildExcloadOrderNoRange({
    dateKey,
    startSequence,
    count: input.count,
  });
}
