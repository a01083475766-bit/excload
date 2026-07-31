import type { OrderIntegrationAccount, OrderIntegrationProvider } from '@prisma/client';

import {
  fetchCoupangOrderSheetByShipmentBoxId,
  postCoupangOrderInvoices,
} from '@/app/lib/coupang/client';
import { runCoupangInvoiceTransmission } from '@/app/lib/coupang/coupang-invoice';
import {
  fetchSmartstoreProductOrdersByIds,
  postSmartstoreProductOrdersDispatch,
} from '@/app/lib/smartstore/client';
import {
  buildSmartstoreItemShipmentFingerprint,
  runSmartstoreCrossMatchBatchDispatch,
} from '@/app/lib/smartstore/smartstore-batch-dispatch';
import {
  resolveSmartstoreDeliveryCompanyCode,
  runSmartstoreInvoiceTransmission,
} from '@/app/lib/smartstore/smartstore-invoice';
import { toSmartstoreCredentials } from '@/app/lib/order-integration/smartstore-account';
import { decryptIntegrationSecret } from '@/app/lib/order-integration/encryption';
import { createShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/adapter-registry';
import { evaluateLiveTransmitAccountStatus } from '@/app/lib/order-integration/transmission/live-transmit-guard';
import type {
  ShipmentTransmissionAdapter,
  ShipmentTransmissionAdapterResult,
  ShipmentTransmissionCandidate,
  ShipmentTransmissionItemResultSummary,
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
  outcomeKind?: ShipmentTransmissionAdapterResult['outcomeKind'];
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
    outcomeKind: input.outcomeKind ?? 'failure',
  };
}

function rejectIfAccountNotActiveForLiveTransmit(input: {
  provider: OrderIntegrationProvider;
  matchId: string;
  status: string | null | undefined;
}): ShipmentTransmissionAdapterResult | null {
  const statusGate = evaluateLiveTransmitAccountStatus(input.status);
  if (statusGate.allowed) return null;
  return buildFailure({
    provider: input.provider,
    matchId: input.matchId,
    errorCode: statusGate.reasonCode,
    errorMessage: statusGate.safeMessage,
  });
}

const DEFERRED_SPECS: ProviderDeferredSpec[] = [
  {
    provider: 'ELEVEN',
    missingInfo:
      'delivery registration XML endpoint, field names, and success/error XML schema are not confirmed in repository specs.',
  },
  {
    provider: 'CAFE24',
    missingInfo:
      'shipment creation endpoint, required OAuth scope, item fields, and result schema are not confirmed in repository specs.',
  },
  {
    provider: 'LOTTEON',
    missingInfo:
      'invoice registration endpoint and body fields are not present in the existing LotteON order client/spec.',
  },
  {
    provider: 'SSG',
    missingInfo: 'invoice save endpoint and field names are not present in the existing SSG order client/spec.',
  },
  {
    provider: 'CJONSTYLE',
    missingInfo:
      'shipment transmission endpoint/path/query and per-order result schema are placeholder-only in repository specs.',
  },
  {
    provider: 'SHOPBY',
    missingInfo:
      'delivery registration endpoint and order-option result schema are not present in the existing Shopby order spec.',
  },
  {
    provider: 'GODOMALL',
    missingInfo:
      'shipment registration endpoint, XML fields, and response schema are not present in the existing Godomall order spec.',
  },
  {
    provider: 'MAKESHOP',
    missingInfo:
      'order_delivery path exists, but confirmed request fields, auth token usage, and response schema are missing.',
  },
  {
    provider: 'SHOPIFY',
    missingInfo:
      'fulfillment mutation variables, fulfillment-order identifier source, and userErrors mapping are not confirmed in repository specs.',
  },
];

function hasAnyCredential(secrets: AccountSecretBundle): boolean {
  return Boolean(secrets.accessKey || secrets.secretKey || secrets.apiKey);
}

function hasCoupangCredentials(secrets: AccountSecretBundle): boolean {
  return Boolean(secrets.vendorId && secrets.accessKey && secrets.secretKey);
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

      const inactive = rejectIfAccountNotActiveForLiveTransmit({
        provider: spec.provider,
        matchId: candidate.matchId,
        status: account.status,
      });
      if (inactive) return inactive;

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

function createCoupangLiveAdapter(
  options: CreateRealShipmentTransmissionAdaptersOptions,
): ShipmentTransmissionAdapter {
  return {
    provider: 'COUPANG',
    buildPayload(candidate: ShipmentTransmissionCandidate) {
      return {
        provider: 'COUPANG',
        mallOrderNo: candidate.mallOrderNo,
        mallLineItemIds: candidate.mallLineItemIds,
        trackingNumber: candidate.trackingNumber,
        courierCode: candidate.courierCode,
        courierName: candidate.courierName,
      };
    },
    async transmit(candidate): Promise<ShipmentTransmissionAdapterResult> {
      const account = await options.loadAccount({
        userId: options.userId,
        accountId: candidate.integrationAccountId,
        provider: 'COUPANG',
      });
      if (!account) {
        return buildFailure({
          provider: 'COUPANG',
          matchId: candidate.matchId,
          errorCode: 'NOT_CONFIGURED',
          errorMessage: 'Integration account is not connected.',
        });
      }

      const inactive = rejectIfAccountNotActiveForLiveTransmit({
        provider: 'COUPANG',
        matchId: candidate.matchId,
        status: account.status,
      });
      if (inactive) return inactive;

      const secrets = options.resolveAccountSecrets?.(account) ?? toSecretBundle(account);
      if (!hasCoupangCredentials(secrets)) {
        return buildFailure({
          provider: 'COUPANG',
          matchId: candidate.matchId,
          errorCode: 'NOT_CONFIGURED',
          errorMessage: 'Integration account credentials are not configured.',
        });
      }

      const vendorId = secrets.vendorId!;
      const accessKey = secrets.accessKey!;
      const secretKey = secrets.secretKey!;

      const result = await runCoupangInvoiceTransmission({
        vendorId,
        accessKey,
        secretKey,
        mallOrderNo: candidate.mallOrderNo,
        mallLineItemIds: candidate.mallLineItemIds,
        courierCode: candidate.courierCode,
        courierName: candidate.courierName,
        invoiceNumber: candidate.trackingNumber,
        fetchByBoxId: (shipmentBoxId) =>
          fetchCoupangOrderSheetByShipmentBoxId({
            vendorId,
            accessKey,
            secretKey,
            shipmentBoxId,
          }),
        postInvoices: (bodyText) =>
          postCoupangOrderInvoices({
            vendorId,
            accessKey,
            secretKey,
            bodyText,
          }),
      });

      return {
        success: result.success,
        provider: 'COUPANG',
        matchId: candidate.matchId,
        providerRequestId: result.providerRequestId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        retryable: false,
        responseSummary: {
          httpStatus: result.responseSummary.httpStatus,
          providerStatusCode: result.responseSummary.providerStatusCode,
          message: result.responseSummary.message,
        },
        outcomeKind: result.outcomeKind,
      };
    },
  };
}

function mapSmartstoreInvoiceItemsToPersisted(input: {
  userId: string;
  candidate: ShipmentTransmissionCandidate;
  itemResults: Array<{ productOrderId: string; status: string; message: string }>;
}): ShipmentTransmissionItemResultSummary[] {
  const courier = resolveSmartstoreDeliveryCompanyCode({
    courierCode: input.candidate.courierCode,
    courierName: input.candidate.courierName,
  });
  const deliveryCompanyCode = courier.ok ? courier.deliveryCompanyCode : 'UNRESOLVED';
  return input.itemResults
    .filter((row) => row.productOrderId.trim())
    .map((row) => {
      const status =
        row.status === 'DISPATCHED'
          ? 'SUCCESS'
          : row.status === 'ORDER_STATE_NOT_ELIGIBLE'
            ? 'STATE_NOT_ELIGIBLE'
            : row.status === 'QUANTITY_UNCLEAR'
              ? 'QUANTITY_UNCLEAR'
              : (row.status as ShipmentTransmissionItemResultSummary['status']);
      return {
        productOrderId: row.productOrderId,
        status,
        providerCode: null,
        message: row.message,
        shipmentFingerprint: buildSmartstoreItemShipmentFingerprint({
          userId: input.userId,
          integrationAccountId: input.candidate.integrationAccountId,
          productOrderId: row.productOrderId,
          deliveryCompanyCode,
          trackingNumber: input.candidate.trackingNumber,
        }),
      };
    });
}

function createSmartstoreLiveAdapter(
  options: CreateRealShipmentTransmissionAdaptersOptions,
): ShipmentTransmissionAdapter {
  async function loadSmartstoreRuntime(accountId: string) {
    const account = await options.loadAccount({
      userId: options.userId,
      accountId,
      provider: 'SMARTSTORE',
    });
    if (!account) {
      return { ok: false as const, errorCode: 'NOT_CONFIGURED', errorMessage: 'Integration account is not connected.' };
    }
    const statusGate = evaluateLiveTransmitAccountStatus(account.status);
    if (!statusGate.allowed) {
      return {
        ok: false as const,
        errorCode: statusGate.reasonCode,
        errorMessage: statusGate.safeMessage,
      };
    }
    let credentials;
    try {
      credentials = toSmartstoreCredentials(account);
    } catch {
      return {
        ok: false as const,
        errorCode: 'NOT_CONFIGURED',
        errorMessage: 'Integration account credentials are not configured.',
      };
    }
    if (!credentials.clientId || !credentials.clientSecret) {
      return {
        ok: false as const,
        errorCode: 'NOT_CONFIGURED',
        errorMessage: 'Integration account credentials are not configured.',
      };
    }
    return { ok: true as const, credentials };
  }

  return {
    provider: 'SMARTSTORE',
    buildPayload(candidate: ShipmentTransmissionCandidate) {
      return {
        provider: 'SMARTSTORE',
        mallOrderNo: candidate.mallOrderNo,
        mallLineItemIds: candidate.mallLineItemIds,
        trackingNumber: candidate.trackingNumber,
        courierCode: candidate.courierCode,
        courierName: candidate.courierName,
      };
    },
    async transmit(candidate): Promise<ShipmentTransmissionAdapterResult> {
      const runtime = await loadSmartstoreRuntime(candidate.integrationAccountId);
      if (!runtime.ok) {
        return buildFailure({
          provider: 'SMARTSTORE',
          matchId: candidate.matchId,
          errorCode: runtime.errorCode,
          errorMessage: runtime.errorMessage,
        });
      }

      const result = await runSmartstoreInvoiceTransmission({
        mallOrderNo: candidate.mallOrderNo,
        mallLineItemIds: candidate.mallLineItemIds,
        courierCode: candidate.courierCode,
        courierName: candidate.courierName,
        trackingNumber: candidate.trackingNumber,
        fetchByIds: (productOrderIds) =>
          fetchSmartstoreProductOrdersByIds({
            credentials: runtime.credentials,
            productOrderIds,
          }),
        dispatchBatch: (dispatchProductOrders) =>
          postSmartstoreProductOrdersDispatch({
            credentials: runtime.credentials,
            dispatchProductOrders,
          }),
      });

      const itemResults = mapSmartstoreInvoiceItemsToPersisted({
        userId: options.userId,
        candidate,
        itemResults: result.itemResults,
      });

      return {
        success: result.success,
        provider: 'SMARTSTORE',
        matchId: candidate.matchId,
        providerRequestId: result.providerRequestId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        retryable: false,
        responseSummary: {
          httpStatus: result.responseSummary.httpStatus,
          providerStatusCode: result.responseSummary.providerStatusCode,
          message: result.responseSummary.message,
          itemResults,
        },
        outcomeKind: result.outcomeKind,
      };
    },
    async transmitAccountBatch({ integrationAccountId, entries }) {
      const runtime = await loadSmartstoreRuntime(integrationAccountId);
      if (!runtime.ok) {
        return entries.map((entry) => ({
          matchId: entry.candidate.matchId,
          success: false,
          outcomeKind: 'failure' as const,
          errorCode: runtime.errorCode,
          errorMessage: runtime.errorMessage,
          providerRequestId: null,
          retryable: false,
          responseSummary: {
            providerStatusCode: runtime.errorCode,
            message: runtime.errorMessage,
          },
        }));
      }

      const outcomes = await runSmartstoreCrossMatchBatchDispatch({
        userId: options.userId,
        integrationAccountId,
        entries: entries.map((entry) => ({
          matchId: entry.candidate.matchId,
          candidate: entry.candidate,
          priorItemResults: entry.priorItemResults,
        })),
        fetchByIds: (productOrderIds) =>
          fetchSmartstoreProductOrdersByIds({
            credentials: runtime.credentials,
            productOrderIds,
          }),
        dispatchBatch: (dispatchProductOrders) =>
          postSmartstoreProductOrdersDispatch({
            credentials: runtime.credentials,
            dispatchProductOrders,
          }),
      });

      return outcomes.map((outcome) => ({
        matchId: outcome.matchId,
        success: outcome.success,
        outcomeKind: outcome.outcomeKind,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        providerRequestId: null,
        retryable: false,
        responseSummary: outcome.responseSummary,
        externallyPosted: outcome.externallyPosted,
      }));
    },
  };
}

export function createRealShipmentTransmissionAdapters(
  options: CreateRealShipmentTransmissionAdaptersOptions,
): ShipmentTransmissionAdapter[] {
  return [
    createCoupangLiveAdapter(options),
    createSmartstoreLiveAdapter(options),
    ...DEFERRED_SPECS.map((spec) => createDeferredAdapter(spec, options)),
  ];
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
  // status는 loader에서 필터하지 않는다. ACTIVE 여부는 adapter가 외부 API 직전에
  // evaluateLiveTransmitAccountStatus로 판별해 ACCOUNT_NOT_ACTIVE를 반환한다.
  return ({ userId, accountId, provider }) =>
    client.orderIntegrationAccount.findFirst({
      where: { id: accountId, userId, provider },
    });
}
