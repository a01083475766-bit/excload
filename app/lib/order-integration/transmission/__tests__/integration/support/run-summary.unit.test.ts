import { describe, expect, it } from 'vitest';

import {
  buildIntegrationSummaryPath,
  createEmptySummary,
  createIntegrationRunId,
  evaluateIntegrationWrapperResult,
  formatLifecycleMarkers,
  normalizeIntegrationSummary,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/run-summary';

describe('integration summary runId / stale rejection (no DB)', () => {
  it('rejects previous-run summary with mismatched runId', () => {
    const expected = createIntegrationRunId();
    const stale = createEmptySummary('stale-run-id');
    stale.cleanupStatus = 'PASS';
    stale.disconnectStatus = 'PASS';
    const judged = evaluateIntegrationWrapperResult({
      childExitCode: 0,
      lockReleased: true,
      expectedRunId: expected,
      summary: stale,
    });
    expect(judged.ok).toBe(false);
    expect(judged.reasons).toContain('SUMMARY_RUN_ID_MISMATCH');
  });

  it('rejects missing summary', () => {
    const judged = evaluateIntegrationWrapperResult({
      childExitCode: 0,
      lockReleased: true,
      expectedRunId: 'abc',
      summary: null,
    });
    expect(judged.reasons).toContain('SUMMARY_MISSING');
  });

  it('rejects malformed summary', () => {
    expect(normalizeIntegrationSummary({ version: 1 })).toBeNull();
    expect(normalizeIntegrationSummary({ version: 2, runId: 'x' })).toBeNull();
    expect(normalizeIntegrationSummary({ version: 1, runId: '../evil' })).toBeNull();
  });

  it('accepts matching run summary with separated test/cleanup status', () => {
    const runId = 'runok01';
    const summary = createEmptySummary(runId);
    summary.testsPassed = 10;
    summary.testsFailed = 0;
    summary.testsTimedOut = 0;
    summary.cleanupStatus = 'PASS';
    summary.disconnectStatus = 'PASS';
    summary.cleanupDeletedCount = 5;
    const judged = evaluateIntegrationWrapperResult({
      childExitCode: 0,
      lockReleased: true,
      expectedRunId: runId,
      summary,
    });
    expect(judged.ok).toBe(true);
    expect(formatLifecycleMarkers(summary)).toContain('INTEGRATION CLEANUP: PASS');
    expect(formatLifecycleMarkers(summary)).toContain('INTEGRATION DISCONNECT: PASS');
    expect(formatLifecycleMarkers(summary)).toContain('TESTS_PASSED: 10');
  });

  it('can report tests failed while cleanup passed', () => {
    const runId = 'runmix01';
    const summary = createEmptySummary(runId);
    summary.testsPassed = 6;
    summary.testsFailed = 6;
    summary.testsTimedOut = 6;
    summary.cleanupStatus = 'PASS';
    summary.disconnectStatus = 'PASS';
    const judged = evaluateIntegrationWrapperResult({
      childExitCode: 1,
      lockReleased: true,
      expectedRunId: runId,
      summary,
    });
    expect(judged.ok).toBe(false);
    expect(judged.reasons).toContain('TESTS_FAILED');
    expect(judged.reasons).toContain('TESTS_TIMED_OUT');
    expect(judged.reasons).not.toContain('CLEANUP_FAIL');
    expect(formatLifecycleMarkers(summary)).toContain('INTEGRATION CLEANUP: PASS');
    expect(formatLifecycleMarkers(summary)).toContain('INTEGRATION TESTS: FAIL');
  });

  it('builds per-run summary path', () => {
    const p = buildIntegrationSummaryPath('/tmp', 'abc123');
    expect(p.replace(/\\/g, '/')).toContain('.shipment-transmission-it-summary.abc123.json');
  });
});
