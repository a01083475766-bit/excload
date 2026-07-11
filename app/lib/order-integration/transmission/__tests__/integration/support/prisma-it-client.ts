import type { PrismaClient } from '@prisma/client';
import { PrismaClient as PrismaClientCtor } from '@prisma/client';

import { assertIntegrationMutationAllowed } from '@/app/lib/order-integration/transmission/__tests__/integration/support/mutation-gate';

export type IntegrationPrismaFactory = (url: string) => PrismaClient;

function defaultPrismaFactory(url: string): PrismaClient {
  return new PrismaClientCtor({
    datasources: {
      db: { url },
    },
  });
}

/**
 * Prisma client for integration tests only.
 * Safety gate must pass before the factory is invoked.
 * Explicit datasources.url — does not rely on project `.env` fallback alone.
 */
export function createIntegrationPrismaClient(
  factory: IntegrationPrismaFactory = defaultPrismaFactory,
): PrismaClient {
  assertIntegrationMutationAllowed();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('integration prisma: DATABASE_URL missing');
  }
  return factory(url);
}

export async function disconnectIntegrationPrisma(
  prisma: PrismaClient | null | undefined,
): Promise<void> {
  if (!prisma) return;
  await prisma.$disconnect();
}
