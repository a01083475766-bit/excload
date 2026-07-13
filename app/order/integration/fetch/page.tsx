import OrderIntegrationFetchPanel from '@/app/components/order-integration/OrderIntegrationFetchPanel';

/** 주문조회 (날짜·몰 선택 골격) */
export default function OrderIntegrationFetchPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <OrderIntegrationFetchPanel />
    </div>
  );
}
