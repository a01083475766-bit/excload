import OrderIntegrationPanel from '@/app/components/order-integration/OrderIntegrationPanel';

/** 쇼핑몰 API 등록·테스트 (주문연동하기) */
export default function OrderIntegrationConnectPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <OrderIntegrationPanel />
    </div>
  );
}
