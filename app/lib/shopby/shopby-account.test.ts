import {
  OrderIntegrationAccountStatus,
  OrderIntegrationProvider,
  type OrderIntegrationAccount,
} from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptIntegrationSecret } from '@/app/lib/order-integration/encryption';
import { prisma } from '@/app/lib/prisma';
import { saveShopbyAccount } from '@/app/lib/order-integration/shopby-account';

vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    orderIntegrationAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');

function accountWithCredentials(): OrderIntegrationAccount {
  const mallKey = encryptIntegrationSecret('mall-key-old');
  const systemKey = encryptIntegrationSecret('system-key-old');
  return {
    id: 'shopby-account-1',
    userId: 'user-1',
    provider: OrderIntegrationProvider.SHOPBY,
    accountName: '본사',
    vendorId: 'mall.shopby.co.kr',
    apiKeyCiphertext: mallKey.ciphertext,
    apiKeyIv: mallKey.iv,
    apiKeyAuthTag: mallKey.authTag,
    secretKeyCiphertext: systemKey.ciphertext,
    secretKeyIv: systemKey.iv,
    secretKeyAuthTag: systemKey.authTag,
    encryptionKeyVersion: mallKey.keyVersion,
    status: OrderIntegrationAccountStatus.ACTIVE,
    healthStatus: 'HEALTHY',
    lastTestedAt: new Date(),
    lastSuccessAt: new Date(),
    consecutiveFailureCount: 0,
  } as OrderIntegrationAccount;
}

async function withEncryptionKey(run: () => Promise<void>): Promise<void> {
  const previous = process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
  process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY;
    else process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY = previous;
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('saveShopbyAccount connection verification reset', () => {
  it('keeps verified state when keys are unchanged or omitted', async () => {
    await withEncryptionKey(async () => {
      const existing = accountWithCredentials();
      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(existing);
      vi.mocked(prisma.orderIntegrationAccount.update).mockResolvedValue(existing);

      await saveShopbyAccount({
        userId: 'user-1',
        accountName: '이름만 변경',
        mallDomain: 'mall.shopby.co.kr',
      });

      const data = vi.mocked(prisma.orderIntegrationAccount.update).mock.calls[0]?.[0].data;
      expect(data).not.toHaveProperty('status');
      expect(data).not.toHaveProperty('healthStatus');
      expect(data).not.toHaveProperty('lastSuccessAt');
    });
  });

  it('clears verified state when systemKey changes', async () => {
    await withEncryptionKey(async () => {
      const existing = accountWithCredentials();
      vi.mocked(prisma.orderIntegrationAccount.findUnique).mockResolvedValue(existing);
      vi.mocked(prisma.orderIntegrationAccount.update).mockResolvedValue(existing);

      await saveShopbyAccount({
        userId: 'user-1',
        accountName: '본사',
        mallDomain: 'mall.shopby.co.kr',
        systemKey: 'system-key-new',
      });

      expect(prisma.orderIntegrationAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderIntegrationAccountStatus.INACTIVE,
            healthStatus: null,
            lastTestedAt: null,
            lastSuccessAt: null,
            lastCheckedAt: null,
          }),
        }),
      );
    });
  });
});
