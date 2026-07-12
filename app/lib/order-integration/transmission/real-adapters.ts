import type { OrderIntegrationAccount, OrderIntegrationProvider } from '@prisma/client';

import { decryptIntegrationSecret } from '@/app/lib/order-integration/encryption';
import { createShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/adapter-registry';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionAdapterResult,
  ShipmentTransmissionCandidate,
} from '@/app/lib/order-integration/transmission/types';

type AccountSecretBundle = {
  accountId: string;
  vendorId: string | null;
  sellerId: string | null;
  accessKey: string | null;
  secretKey: string | null;
  apiKey: string | null;
};

type ProviderDeferredSpec = {
  provider: OrderIntegrationProvider;
  missingInfo: string;
};

export type RealShipmentAdapterAccountLoader = (input: {
  userId: string;
  accountId: string;
  provider: OrderIntegrationProvider;
}) => Promise<OrderIntegrationAccount | null>;

export type CreateRealShipmentTransmissionAdaptersOptions = {
  userId: string;
  loadAccount: RealShipmentAdapterAccountLoader;
  resolveAccountSecrets?: (account: OrderIntegrationAccount) => AccountSecretBundle;
};

export type ShipmentTransmissionAccountPrismaClient = {
  orderIntegrationAccount: {
    findFirst: (args: {
      where: { id: string; userId: string; provider: OrderIntegrationProvider };
    }) => Promise<OrderIntegrationAccount | null>;
  };
};

function encryptedField(account: OrderIntegrationAccount, prefix: 'accessKey' | 'secretKey' | 'apiKey') {
  const ciphertext = account[`${prefix}Ciphertext`];
  const iv = account[`${prefix}Iv`];
  const authTag = account[`${prefix}AuthTag`];
  if (!ciphertext || !iv || !authTag) return null;
  return { ciphertext, iv, authTag, keyVersion: account.encryptionKeyVersion };
}

function decryptOptional(
  account: OrderIntegrationAccount,
  prefix: 'accessKey' | 'secretKey' | 'apiKey',
): string | null {
  const field = encryptedField(account, prefix);
  if (!field) return null;
  return decryptIntegrationSecret(field);
}

function toSecretBundle(account: OrderIntegrationAccount): AccountSecretBundle {
  return {
    accountId: account.id,
    vendorId: account.vendorId?.trim() || null,
    sellerId: account.sellerId?.trim() || null,
    accessKey: decryptOptional(account, 'accessKey'),
    secretKey: decryptOptional(account, 'secretKey'),
    apiKey: decryptOptional(account, 'apiKey'),
  };
}

function buildFailure(input: {
  provider: OrderIntegrationProvider;
  matchId: string;
  errorCode: string;
  errorMessage: string;
}): ShipmentTransmissionAdapterResult {
  return {
    success: false,
    provider: input.provider,
    matchId: input.matchId,
    providerRequestId: null,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryable: false,
    responseSummary: {
      httpStatus: null,
      providerStatusCode: input.errorCode,
      message: input.errorMessage,
    },
    outcomeKind: 'failure',
  };
}

const DEFERRED_SPECS: ProviderDeferredSpec[] = [
  {
    provider: 'COUPANG',
    missingInfo: 'shipment registration endpoint, HMAC signing path, and response schema are not confirmed in repository specs.',
  },
  {
    provider: 'SMARTSTORE',
    missingInfo: 'dispatch endpoint request fields and product-order result schema are not confirmed in repository specs.',
  },
  {
    provider: 'ELEVEN',
    missingInfo: 'delivery registration XML endpoint, field names, and success/error XML schema are not confirmed in repository specs.',
  },
  {
    provider: 'CAFE24',
    missingInfo: 'shipment creation endpoint, required OAuth scope, item fields, and result schema are not confirmed in repository specs.',
  },
  {
    provider: 'LOTTEON',
    missingInfo: 'invoice registration endpoint and body fields are not present in the existing LotteON order client/spec.',
  },
  {
    provider: 'SSG',
    missingInfo: 'invoice save endpoint and field names are not present in the existing SSG order client/spec.',
  },
  {
    provider: 'CJONSTYLE',
    missingInfo: 'shipment transmission endpoint/path/query and per-order result schema are placeholder-only in repository specs.',
  },
  {
    provider: 'SHOPBY',
    missingInfo: 'delivery registration endpoint and order-option result schema are not present in the existing Shopby order spec.',
  },
  {
    provider: 'GODOMALL',
    missingInfo: 'shipment registration endpoint, XML fields, and response schema are not present in the existing Godomall order spec.',
  },
  {
    provider: 'MAKESHOP',
    missingInfo: 'order_delivery path exists, but confirmed request fields, auth token usage, and response schema are missing.',
  },
  {
    provider: 'SHOPIFY',
    missingInfo: 'fulfillment mutation variables, fulfillment-order identifier source, and userErrors mapping are not confirmed in repository specs.',
  },
];

function hasAnyCredential(secrets: AccountSecretBundle): boolean {
  return Boolean(secrets.accessKey || secrets.secretKey || secrets.apiKey);
}

function createDeferredAdapter(
  spec: ProviderDeferredSpec,
  options: CreateRealShipmentTransmissionAdaptersOptions,
): ShipmentTransmissionAdapter {
  return {
    provider: spec.provider,
    buildPayload(candidate) {
      return {
        provider: spec.provider,
        mallOrderNo: candidate.mallOrderNo,
        mallLineItemIds: candidate.mallLineItemIds,
        trackingNumber: candidate.trackingNumber,
        courierCode: candidate.courierCode,
        courierName: candidate.courierName,
        missingInfo: spec.missingInfo,
      };
    },
    async transmit(candidate) {
      const account = await options.loadAccount({
        userId: options.userId,
        accountId: candidate.integrationAccountId,
        provider: spec.provider,
      });
      if (!account) {
        return buildFailure({
          provider: spec.provider,
          matchId: candidate.matchId,
          errorCode: 'NOT_CONFIGURED',
          errorMessage: 'Integration account is not connected.',
        });
      }

      const secrets = options.resolveAccountSecrets?.(account) ?? toSecretBundle(account);
      if (!hasAnyCredential(secrets)) {
        return buildFailure({
          provider: spec.provider,
          matchId: candidate.matchId,
          errorCode: 'NOT_CONFIGURED',
          errorMessage: 'Integration account credentials are not configured.',
        });
      }

      return buildFailure({
        provider: spec.provider,
        matchId: candidate.matchId,
        errorCode: 'PROVIDER_SPEC_INCOMPLETE',
        errorMessage: spec.missingInfo,
      });
    },
  };
}

export function createRealShipmentTransmissionAdapters(
  options: CreateRealShipmentTransmissionAdaptersOptions,
): ShipmentTransmissionAdapter[] {
  return DEFERRED_SPECS.map((spec) => createDeferredAdapter(spec, options));
}

export function createRealShipmentTransmissionAdapterRegistry(
  options: CreateRealShipmentTransmissionAdaptersOptions,
) {
  return createShipmentTransmissionAdapterRegistry(
    createRealShipmentTransmissionAdapters(options),
  );
}

export function createPrismaShipmentTransmissionAccountLoader(
  client: ShipmentTransmissionAccountPrismaClient,
): RealShipmentAdapterAccountLoader {
  return ({ userId, accountId, provider }) =>
    client.orderIntegrationAccount.findFirst({
      where: { id: accountId, userId, provider },
    });
}
