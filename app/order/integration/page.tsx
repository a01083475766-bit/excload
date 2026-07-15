import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import OrderIntegrationHub from '@/app/components/order-integration/OrderIntegrationHub';
import OrderIntegrationPublicIntro from '@/app/components/order-integration/OrderIntegrationPublicIntro';

export default async function OrderIntegrationPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {session?.user?.email ? <OrderIntegrationHub /> : <OrderIntegrationPublicIntro />}
    </div>
  );
}
