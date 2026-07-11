/** Integration test ID prefixes (D-6g-e1). Never use real customer-looking values. */

export const SHIPMENT_TRANSMISSION_IT_PREFIX = {
  emailLocal: 'shipment-transmission-it-',
  name: 'shipment-transmission-it-',
  mallOrderNo: 'TX-IT-MALL-',
  excloadOrderNo: 'TX-IT-EXC-',
  trackingNumber: 'TXIT',
  fileName: 'shipment-transmission-it-',
  accountName: 'shipment-transmission-it-account-',
  vendorId: 'TX-IT-VENDOR-',
} as const;

export const SHIPMENT_TRANSMISSION_IT_EMAIL_DOMAIN = 'example.test';

export function createShipmentTransmissionItRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildItEmail(runId: string, slot = 'u'): string {
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.emailLocal}${runId}-${slot}@${SHIPMENT_TRANSMISSION_IT_EMAIL_DOMAIN}`;
}

export function buildItName(runId: string, slot = 'u'): string {
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.name}${runId}-${slot}`;
}

export function buildItMallOrderNo(runId: string, slot: string): string {
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.mallOrderNo}${runId}-${slot}`;
}

export function buildItExcloadOrderNo(runId: string, slot: string): string {
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.excloadOrderNo}${runId}-${slot}`;
}

export function buildItTrackingNumber(runId: string, slot: string): string {
  const safeRun = runId.replace(/[^A-Za-z0-9]/g, '');
  const safeSlot = slot.replace(/[^A-Za-z0-9]/g, '');
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.trackingNumber}${safeRun}${safeSlot}`;
}

export function buildItFileName(runId: string, slot: string): string {
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.fileName}${runId}-${slot}.csv`;
}

export function buildItAccountName(runId: string): string {
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.accountName}${runId}`;
}

export function buildItVendorId(runId: string): string {
  return `${SHIPMENT_TRANSMISSION_IT_PREFIX.vendorId}${runId}`;
}

export function isItEmail(email: string): boolean {
  return (
    email.startsWith(SHIPMENT_TRANSMISSION_IT_PREFIX.emailLocal) &&
    email.endsWith(`@${SHIPMENT_TRANSMISSION_IT_EMAIL_DOMAIN}`)
  );
}
