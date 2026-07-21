/**
 * OrderSyncOrder 수취인 PII 제거 (전송 성공·cron 공통).
 * 쇼핑몰 식별자·송장번호·전송상태는 유지합니다.
 */

export const ORDER_SYNC_ORDER_PII_CLEAR_DATA = {
  receiverName: null,
  receiverPhone: null,
  receiverAddress: null,
  deliveryMemo: null,
  productSummary: null,
  rawPayloadJson: null,
} as const;

export type OrderSyncOrderPiiClearClient = {
  orderSyncOrder: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

/**
 * 지정 주문의 수취인 PII를 지웁니다. 이미 지워진 행은 건너뜁니다.
 */
export async function clearOrderSyncOrderPii(
  client: OrderSyncOrderPiiClearClient,
  input: { userId: string; orderSyncOrderId: string; now?: Date },
): Promise<{ cleared: boolean }> {
  const now = input.now ?? new Date();
  const result = await client.orderSyncOrder.updateMany({
    where: {
      id: input.orderSyncOrderId,
      userId: input.userId,
      piiClearedAt: null,
    },
    data: {
      ...ORDER_SYNC_ORDER_PII_CLEAR_DATA,
      piiClearedAt: now,
    },
  });
  return { cleared: result.count === 1 };
}
