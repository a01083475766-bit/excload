import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/app/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/components/order-integration/OrderIntegrationHub', () => ({
  default: () => <div>authenticated-order-integration-hub</div>,
}));

import OrderIntegrationPage from '@/app/order/integration/page';

describe('/order/integration page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a static public introduction without calling a user API', async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const html = renderToStaticMarkup(await OrderIntegrationPage());

    expect(html).toContain('쇼핑몰 주문연동');
    expect(html).toContain('주문조회');
    expect(html).toContain('송장 매칭');
    expect(html).toContain('mode=login&amp;callbackUrl=%2Forder%2Fintegration%2Fconnect');
    expect(html).not.toContain('authenticated-order-integration-hub');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('renders the existing work hub for an authenticated regular user', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: 'user@example.com', isAdmin: false },
    });

    const html = renderToStaticMarkup(await OrderIntegrationPage());

    expect(html).toContain('authenticated-order-integration-hub');
  });
});
