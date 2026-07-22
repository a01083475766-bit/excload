import type { OrderIntegrationMallId } from './malls';

export type OrderFetchRequestBody =
  | { days: number; accountId?: string }
  | { from: string; to: string; accountId?: string };

/**
 * 화면에 표시된 달력 범위와 스마트스토어 실제 요청 범위를 일치시킨다.
 * 다른 몰은 각 API가 기대하는 기존 최근 N일 요청을 유지한다.
 */
export function buildOrderFetchRequestBody(input: {
  mallId: OrderIntegrationMallId;
  days: number;
  from: string;
  to: string;
  accountId?: string;
}): OrderFetchRequestBody {
  const accountId = input.accountId?.trim() || undefined;
  if (input.mallId === 'smartstore') {
    return accountId
      ? { from: input.from, to: input.to, accountId }
      : { from: input.from, to: input.to };
  }
  return accountId ? { days: input.days, accountId } : { days: input.days };
}
