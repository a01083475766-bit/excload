/**
 * Safe lifecycle markers + summary file for wrapper judgment.
 * Never includes DB IDs, URLs, refs, or PII.
 */

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const INTEGRATION_SUMMARY_ENV = 'SHIPMENT_TRANSMISSION_IT_SUMMARY_PATH';
export const INTEGRATION_RUN_ID_ENV = 'SHIPMENT_TRANSMISSION_IT_RUN_ID';
export const INTEGRATION_SUMMARY_PREFIX = '.shipment-transmission-it-summary.';

export const MARKER_CLEANUP_PASS = 'INTEGRATION CLEANUP: PASS';
export const MARKER_CLEANUP_FAIL = 'INTEGRATION CLEANUP: FAIL';
export const MARKER_DISCONNECT_PASS = 'INTEGRATION DISCONNECT: PASS';
export const MARKER_DISCONNECT_FAIL = 'INTEGRATION DISCONNECT: FAIL';
export const MARKER_TESTS_PASS = 'INTEGRATION TESTS: PASS';
export const MARKER_TESTS_FAIL = 'INTEGRATION TESTS: FAIL';

export type PassFailStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export type IntegrationRunSummary = {
  version: 1;
  runId: string;
  testsPassed: number;
  testsFailed: number;
  testsTimedOut: number;
  cleanupStatus: PassFailStatus;
  disconnectStatus: PassFailStatus;
  lockReleased: boolean | null;
  cleanupDeletedCount: number;
  pendingRegistryEntries: number;
  cleanupErrorCode: string | null;
  suiteAborted: boolean;
};

export function createIntegrationRunId(): string {
  return randomBytes(8).toString('hex');
}

export function buildIntegrationSummaryPath(cwd: string, runId: string): string {
  const safe = String(runId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe || safe !== runId) {
    throw new Error('invalid integration runId');
  }
  return path.resolve(cwd, `${INTEGRATION_SUMMARY_PREFIX}${safe}.json`);
}

export function createEmptySummary(runId: string): IntegrationRunSummary {
  return {
    version: 1,
    runId,
    testsPassed: 0,
    testsFailed: 0,
    testsTimedOut: 0,
    cleanupStatus: 'UNKNOWN',
    disconnectStatus: 'UNKNOWN',
    lockReleased: null,
    cleanupDeletedCount: 0,
    pendingRegistryEntries: 0,
    cleanupErrorCode: null,
    suiteAborted: false,
  };
}

export function resolveSummaryPathFromEnv(
  cwd: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { runId: string | null; summaryPath: string | null } {
  const runId = typeof env[INTEGRATION_RUN_ID_ENV] === 'string' ? env[INTEGRATION_RUN_ID_ENV].trim() : '';
  const override =
    typeof env[INTEGRATION_SUMMARY_ENV] === 'string' ? env[INTEGRATION_SUMMARY_ENV].trim() : '';
  if (!runId || !override) return { runId: null, summaryPath: null };
  const summaryPath = path.isAbsolute(override) ? override : path.resolve(cwd, override);
  return { runId, summaryPath };
}

function toStatus(value: unknown): PassFailStatus {
  if (value === 'PASS' || value === 'FAIL' || value === 'UNKNOWN') return value;
  return 'UNKNOWN';
}

export function normalizeIntegrationSummary(
  raw: unknown,
): IntegrationRunSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.runId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(o.runId)) return null;
  return {
    version: 1,
    runId: o.runId,
    testsPassed: Number(o.testsPassed) || 0,
    testsFailed: Number(o.testsFailed) || 0,
    testsTimedOut: Number(o.testsTimedOut) || 0,
    cleanupStatus: toStatus(o.cleanupStatus),
    disconnectStatus: toStatus(o.disconnectStatus),
    lockReleased: typeof o.lockReleased === 'boolean' ? o.lockReleased : null,
    cleanupDeletedCount: Number(o.cleanupDeletedCount) || 0,
    pendingRegistryEntries: Number(o.pendingRegistryEntries) || 0,
    cleanupErrorCode: o.cleanupErrorCode ? String(o.cleanupErrorCode) : null,
    suiteAborted: Boolean(o.suiteAborted),
  };
}

export function writeIntegrationSummary(filePath: string, summary: IntegrationRunSummary): void {
  const safe = normalizeIntegrationSummary(summary);
  if (!safe) throw new Error('invalid summary payload');
  fs.writeFileSync(filePath, `${JSON.stringify(safe)}\n`, 'utf8');
}

export function readIntegrationSummary(filePath: string): IntegrationRunSummary | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return normalizeIntegrationSummary(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

export function deleteIntegrationSummary(filePath: string): { ok: boolean; errorCode: string | null } {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true, errorCode: null };
  } catch {
    return { ok: false, errorCode: 'SUMMARY_DELETE_FAILED' };
  }
}

export function formatLifecycleMarkers(summary: IntegrationRunSummary): string {
  const testsOk = summary.testsFailed === 0 && summary.testsTimedOut === 0;
  const lines = [
    testsOk ? MARKER_TESTS_PASS : MARKER_TESTS_FAIL,
    `INTEGRATION TESTS_PASSED: ${summary.testsPassed}`,
    `INTEGRATION TESTS_FAILED: ${summary.testsFailed}`,
    `INTEGRATION TESTS_TIMED_OUT: ${summary.testsTimedOut}`,
    summary.cleanupStatus === 'PASS' ? MARKER_CLEANUP_PASS : MARKER_CLEANUP_FAIL,
    summary.disconnectStatus === 'PASS' ? MARKER_DISCONNECT_PASS : MARKER_DISCONNECT_FAIL,
    `INTEGRATION CLEANUP_DELETED_COUNT: ${summary.cleanupDeletedCount}`,
  ];
  if (summary.cleanupErrorCode) {
    lines.push(`INTEGRATION CLEANUP_ERROR: ${summary.cleanupErrorCode}`);
  }
  if (summary.suiteAborted) {
    lines.push('INTEGRATION SUITE: ABORTED');
  }
  return lines.join('\n');
}

/**
 * Final wrapper judgment: child exit + structured summary with matching runId.
 * Missing / stale / mismatched summary ⇒ fail.
 */
export function evaluateIntegrationWrapperResult(input: {
  childExitCode: number;
  lockReleased: boolean;
  expectedRunId: string;
  summary: IntegrationRunSummary | null;
}): { ok: boolean; exitCode: number; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.lockReleased) reasons.push('LOCK_NOT_RELEASED');
  if (!input.summary) {
    reasons.push('SUMMARY_MISSING');
  } else if (input.summary.runId !== input.expectedRunId) {
    reasons.push('SUMMARY_RUN_ID_MISMATCH');
  } else {
    if (input.summary.testsFailed > 0) reasons.push('TESTS_FAILED');
    if (input.summary.testsTimedOut > 0) reasons.push('TESTS_TIMED_OUT');
    if (input.summary.cleanupStatus !== 'PASS') reasons.push('CLEANUP_FAIL');
    if (input.summary.disconnectStatus !== 'PASS') reasons.push('DISCONNECT_FAIL');
    if (input.summary.pendingRegistryEntries > 0) reasons.push('REGISTRY_PENDING');
    if (input.summary.suiteAborted) reasons.push('SUITE_ABORTED');
  }
  if (input.childExitCode !== 0) reasons.push('CHILD_EXIT_NONZERO');

  const ok = reasons.length === 0;
  return { ok, exitCode: ok ? 0 : 1, reasons };
}

/** Fingerprint helper for unit tests — never includes secrets. */
export function summaryShapeFingerprint(summary: IntegrationRunSummary): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: summary.version,
        runId: summary.runId,
        testsPassed: summary.testsPassed,
        testsFailed: summary.testsFailed,
        testsTimedOut: summary.testsTimedOut,
        cleanupStatus: summary.cleanupStatus,
        disconnectStatus: summary.disconnectStatus,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}
