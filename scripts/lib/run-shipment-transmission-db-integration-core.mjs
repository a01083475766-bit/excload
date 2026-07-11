/**
 * D-6g-e1 — smoke DB integration runner core (pure / injectable I/O).
 * Does not connect to DB by itself. Never print secrets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  EXCLOAD_PROD_SUPABASE_REF,
  EXCLOAD_TEST_SUPABASE_REF,
  parseEnvFileContent,
  SMOKE_ENV_FILE,
} from './excload-db-env-shared.mjs';
import {
  evaluateMigrationSqlStatic,
  evaluateTestDbMutationPreflight,
  formatPreflightReport,
  SHIPMENT_TRANSMISSION_MIGRATION_SQL_REL,
} from './shipment-transmission-test-db-guard.mjs';

export const SHIPMENT_TRANSMISSION_IT_RUN_ENV = 'SHIPMENT_TRANSMISSION_IT_RUN';
export const INTEGRATION_LOCK_FILE = '.shipment-transmission-it.lock';
export const INTEGRATION_VITEST_CONFIG = 'vitest.integration.config.ts';
export const INTEGRATION_SUMMARY_ENV = 'SHIPMENT_TRANSMISSION_IT_SUMMARY_PATH';
export const INTEGRATION_RUN_ID_ENV = 'SHIPMENT_TRANSMISSION_IT_RUN_ID';
export const INTEGRATION_SUMMARY_PREFIX = '.shipment-transmission-it-summary.';

/** Parent env keys that must never leak into child as-is (stripped then smoke-forced). */
export const CHILD_ENV_DB_RISK_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'SUPABASE_DB_URL',
  'PRISMA_DATABASE_URL',
];

/**
 * @param {string} text
 * @param {{ prodRef: string, testRef: string, urls?: string[] }} secrets
 */
export function sanitizeIntegrationOutput(text, secrets) {
  let out = String(text ?? '');
  for (const url of secrets.urls ?? []) {
    if (url && url.length > 0) {
      out = out.split(url).join('[REDACTED_URL]');
    }
  }
  if (secrets.prodRef) {
    out = out.split(secrets.prodRef).join('[REDACTED_REF]');
  }
  if (secrets.testRef) {
    out = out.split(secrets.testRef).join('[REDACTED_REF]');
  }
  out = out.replace(/postgres(ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]');
  out = out.replace(/password=[^\s&"']+/gi, 'password=[REDACTED]');
  return out;
}

/**
 * Load smoke env from disk only. Does not read process.env DB URLs.
 * @param {{ cwd: string, readFileSync?: (path: string, encoding: string) => string, existsSync?: (path: string) => boolean }} io
 */
export function loadSmokeEnvFromDisk(io) {
  const readFileSync = io.readFileSync ?? ((p, enc) => fs.readFileSync(p, enc));
  const existsSync = io.existsSync ?? ((p) => fs.existsSync(p));
  const envFileRel = SMOKE_ENV_FILE;
  const envAbs = path.resolve(io.cwd, envFileRel);
  const envFileExists = existsSync(envAbs);
  /** @type {Record<string, string>} */
  let env = {};
  if (envFileExists) {
    env = parseEnvFileContent(readFileSync(envAbs, 'utf8'));
  }
  return { envFileRel, envAbs, envFileExists, env };
}

/**
 * Build child process env: force smoke DB URLs; ignore parent shell DB URLs.
 * @param {{
 *   smokeEnv: Record<string, string>,
 *   parentEnv: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} input
 */
export function buildIntegrationChildEnv(input) {
  const risk = new Set(CHILD_ENV_DB_RISK_KEYS);
  /** @type {Record<string, string>} */
  const child = {};
  for (const [key, value] of Object.entries(input.parentEnv ?? {})) {
    if (value === undefined) continue;
    if (risk.has(key)) continue;
    // Always overwrite from smoke file — do not inherit shell copies
    if (
      key === 'EXCLOAD_ENV_PROFILE' ||
      key === 'TEST_DB_ENV_FILE' ||
      key === 'ALLOW_TEST_DB_MUTATION' ||
      key === SHIPMENT_TRANSMISSION_IT_RUN_ENV ||
      key === INTEGRATION_SUMMARY_ENV ||
      key === INTEGRATION_RUN_ID_ENV
    ) {
      continue;
    }
    child[key] = String(value);
  }

  const smoke = input.smokeEnv;
  child.DATABASE_URL = smoke.DATABASE_URL ?? '';
  child.DIRECT_URL = smoke.DIRECT_URL ?? '';
  child.EXCLOAD_ENV_PROFILE = smoke.EXCLOAD_ENV_PROFILE ?? '';
  child.TEST_DB_ENV_FILE = smoke.TEST_DB_ENV_FILE ?? '';
  child.ALLOW_TEST_DB_MUTATION = smoke.ALLOW_TEST_DB_MUTATION ?? '';
  child[SHIPMENT_TRANSMISSION_IT_RUN_ENV] = 'true';
  child.DOTENV_CONFIG_PATH = path.resolve(SMOKE_ENV_FILE);
  return child;
}

/**
 * @param {string} [runId]
 */
export function createIntegrationRunId(runId) {
  return runId && /^[a-zA-Z0-9_-]+$/.test(runId) ? runId : randomBytes(8).toString('hex');
}

/**
 * @param {string} cwd
 * @param {string} runId
 */
export function buildIntegrationSummaryPath(cwd, runId) {
  const safe = String(runId);
  if (!/^[a-zA-Z0-9_-]+$/.test(safe)) {
    throw new Error('invalid integration runId');
  }
  return path.resolve(cwd, `${INTEGRATION_SUMMARY_PREFIX}${safe}.json`);
}

/**
 * @param {{
 *   cwd: string,
 *   smokeEnv: Record<string, string>,
 *   envFileRel: string,
 *   envFileExists: boolean,
 *   prodRef?: string,
 *   testRef?: string,
 * }} input
 */
export function runIntegrationPreflight(input) {
  const prodRef = input.prodRef ?? EXCLOAD_PROD_SUPABASE_REF;
  const testRef = input.testRef ?? EXCLOAD_TEST_SUPABASE_REF;

  const envResult = evaluateTestDbMutationPreflight({
    env: input.smokeEnv,
    envFileName: input.envFileRel,
    envFileExists: input.envFileExists,
    prodRef,
    testRef,
  });

  const migrationAbs = path.resolve(input.cwd, SHIPMENT_TRANSMISSION_MIGRATION_SQL_REL);
  const migrationExists = fs.existsSync(migrationAbs);
  const sql = migrationExists ? fs.readFileSync(migrationAbs, 'utf8') : '';
  const migrationResult = evaluateMigrationSqlStatic({
    exists: migrationExists,
    sql,
    prodRef,
    testRef,
  });

  return formatPreflightReport(envResult, migrationResult);
}

/**
 * @param {number} pid
 * @param {{ kill?: (pid: number, signal?: number | string) => boolean }} [io]
 */
export function isProcessProbablyAlive(pid, io = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const kill = io.kill ?? ((p, sig) => process.kill(p, /** @type {NodeJS.Signals | number} */ (sig)));
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspect an existing lock without deleting it (stale ≠ auto-delete).
 * @param {string} lockPath
 * @param {{
 *   readFileSync?: (path: string, encoding: string) => string,
 *   kill?: (pid: number, signal?: number | string) => boolean,
 * }} [io]
 */
export function inspectIntegrationLock(lockPath, io = {}) {
  const readFileSync = io.readFileSync ?? ((p, enc) => fs.readFileSync(p, enc));
  try {
    const raw = String(readFileSync(lockPath, 'utf8')).trim();
    const pid = Number.parseInt(raw.split(/\s+/)[0] ?? '', 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return {
        reason: 'LOCK_HELD_UNKNOWN',
        message:
          'lock file present; remove .shipment-transmission-it.lock manually after confirming no other run',
        pid: null,
        alive: null,
      };
    }
    const alive = isProcessProbablyAlive(pid, io);
    if (alive) {
      return {
        reason: 'LOCK_HELD_ACTIVE',
        message: 'another integration run appears active; wait or stop that process',
        pid,
        alive: true,
      };
    }
    return {
      reason: 'LOCK_HELD_STALE',
      message:
        'lock file present but owner process not found; delete .shipment-transmission-it.lock manually if safe',
      pid,
      alive: false,
    };
  } catch {
    return {
      reason: 'LOCK_HELD_UNKNOWN',
      message:
        'lock file present; remove .shipment-transmission-it.lock manually after confirming no other run',
      pid: null,
      alive: null,
    };
  }
}

/**
 * Atomic lock (wx). Never auto-deletes a held lock by age.
 * @param {string} cwd
 * @param {{
 *   openSync?: typeof fs.openSync,
 *   writeSync?: typeof fs.writeSync,
 *   closeSync?: typeof fs.closeSync,
 *   unlinkSync?: typeof fs.unlinkSync,
 *   readFileSync?: (path: string, encoding: string) => string,
 *   kill?: (pid: number, signal?: number | string) => boolean,
 * }} [io]
 */
export function acquireIntegrationLock(cwd, io = {}) {
  const openSync = io.openSync ?? fs.openSync;
  const writeSync = io.writeSync ?? fs.writeSync;
  const closeSync = io.closeSync ?? fs.closeSync;
  const lockPath = path.resolve(cwd, INTEGRATION_LOCK_FILE);
  try {
    const fd = openSync(lockPath, 'wx');
    // PID only — never URL / ref / secret
    writeSync(fd, `${process.pid}\n`);
    return {
      ok: true,
      lockPath,
      reason: 'ACQUIRED',
      message: 'lock acquired',
      release() {
        try {
          closeSync(fd);
        } catch {
          /* ignore */
        }
        try {
          (io.unlinkSync ?? fs.unlinkSync)(lockPath);
        } catch {
          /* ignore */
        }
      },
    };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 'EEXIST') {
      const held = inspectIntegrationLock(lockPath, io);
      return {
        ok: false,
        lockPath,
        reason: held.reason,
        message: held.message,
        release() {},
      };
    }
    return {
      ok: false,
      lockPath,
      reason: 'LOCK_FAILED',
      message: 'lock create failed',
      release() {},
    };
  }
}

/**
 * Vitest spawn target for shipment-transmission integration only. No migrate / cleanup-all.
 * @param {string} cwd
 */
export function buildIntegrationVitestSpawn(cwd) {
  const config = path.resolve(cwd, INTEGRATION_VITEST_CONFIG);
  const vitestEntry = path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
  return {
    command: process.execPath,
    args: [vitestEntry, 'run', '--config', config],
    commandText: `${vitestEntry} run --config ${INTEGRATION_VITEST_CONFIG}`,
  };
}

/**
 * True if command text looks like migrate / destructive DB ops (unit-test helper).
 * @param {string} commandText
 */
export function integrationCommandLooksUnsafe(commandText) {
  const blob = String(commandText ?? '').toLowerCase();
  return (
    blob.includes('migrate deploy') ||
    blob.includes('migrate dev') ||
    blob.includes('migrate reset') ||
    blob.includes('db push') ||
    blob.includes('db pull') ||
    blob.includes('truncate') ||
    blob.includes('cleanup-all')
  );
}

/**
 * @param {string} filePath
 * @param {{ readFileSync?: typeof fs.readFileSync, existsSync?: typeof fs.existsSync }} [io]
 */
export function readIntegrationSummaryFile(filePath, io = {}) {
  const existsSync = io.existsSync ?? fs.existsSync;
  const readFileSync = io.readFileSync ?? fs.readFileSync;
  try {
    if (!existsSync(filePath)) return null;
    const raw = JSON.parse(String(readFileSync(filePath, 'utf8')));
    if (raw?.version !== 1) return null;
    if (typeof raw.runId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(raw.runId)) return null;
    const status = (v) => (v === 'PASS' || v === 'FAIL' || v === 'UNKNOWN' ? v : 'UNKNOWN');
    return {
      version: 1,
      runId: raw.runId,
      testsPassed: Number(raw.testsPassed) || 0,
      testsFailed: Number(raw.testsFailed) || 0,
      testsTimedOut: Number(raw.testsTimedOut) || 0,
      cleanupStatus: status(raw.cleanupStatus),
      disconnectStatus: status(raw.disconnectStatus),
      lockReleased: typeof raw.lockReleased === 'boolean' ? raw.lockReleased : null,
      cleanupDeletedCount: Number(raw.cleanupDeletedCount) || 0,
      pendingRegistryEntries: Number(raw.pendingRegistryEntries) || 0,
      cleanupErrorCode: raw.cleanupErrorCode ? String(raw.cleanupErrorCode) : null,
      suiteAborted: Boolean(raw.suiteAborted),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 * @param {{ unlinkSync?: typeof fs.unlinkSync, existsSync?: typeof fs.existsSync }} [io]
 */
export function deleteIntegrationSummaryFile(filePath, io = {}) {
  try {
    if ((io.existsSync ?? fs.existsSync)(filePath)) {
      (io.unlinkSync ?? fs.unlinkSync)(filePath);
    }
    return { ok: true, errorCode: null };
  } catch {
    return { ok: false, errorCode: 'SUMMARY_DELETE_FAILED' };
  }
}

/**
 * Final judgment: child exit + summary with matching runId. Stale/mismatch ⇒ fail.
 * @param {{
 *   childExitCode: number,
 *   lockReleased: boolean,
 *   expectedRunId: string,
 *   summary: null | Record<string, unknown>,
 * }} input
 */
export function evaluateIntegrationWrapperResult(input) {
  /** @type {string[]} */
  const reasons = [];
  if (!input.lockReleased) reasons.push('LOCK_NOT_RELEASED');
  if (!input.summary) {
    reasons.push('SUMMARY_MISSING');
  } else if (input.summary.runId !== input.expectedRunId) {
    reasons.push('SUMMARY_RUN_ID_MISMATCH');
  } else {
    if ((Number(input.summary.testsFailed) || 0) > 0) reasons.push('TESTS_FAILED');
    if ((Number(input.summary.testsTimedOut) || 0) > 0) reasons.push('TESTS_TIMED_OUT');
    if (input.summary.cleanupStatus !== 'PASS') reasons.push('CLEANUP_FAIL');
    if (input.summary.disconnectStatus !== 'PASS') reasons.push('DISCONNECT_FAIL');
    if ((Number(input.summary.pendingRegistryEntries) || 0) > 0) reasons.push('REGISTRY_PENDING');
    if (input.summary.suiteAborted) reasons.push('SUITE_ABORTED');
  }
  if (input.childExitCode !== 0) reasons.push('CHILD_EXIT_NONZERO');

  const ok = reasons.length === 0;
  return { ok, exitCode: ok ? 0 : 1, reasons };
}

/**
 * Orchestrate preflight → lock → spawn vitest. Injectable spawn for unit tests.
 * @param {{
 *   cwd: string,
 *   parentEnv: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   loadSmoke?: typeof loadSmokeEnvFromDisk,
 *   preflight?: typeof runIntegrationPreflight,
 *   acquireLock?: typeof acquireIntegrationLock,
 *   spawnSync?: (command: string, args: string[], opts: object) => { status: number | null, stdout: string | Buffer, stderr: string | Buffer },
 *   log?: (line: string) => void,
 *   prodRef?: string,
 *   testRef?: string,
 *   createRunId?: () => string,
 *   readSummary?: typeof readIntegrationSummaryFile,
 *   deleteSummary?: typeof deleteIntegrationSummaryFile,
 *   existsSync?: typeof fs.existsSync,
 * }} options
 */
export function runShipmentTransmissionDbIntegration(options) {
  const log = options.log ?? (() => {});
  const loadSmoke = options.loadSmoke ?? loadSmokeEnvFromDisk;
  const preflightFn = options.preflight ?? runIntegrationPreflight;
  const acquireLock = options.acquireLock ?? acquireIntegrationLock;
  const readSummary = options.readSummary ?? readIntegrationSummaryFile;
  const deleteSummary = options.deleteSummary ?? deleteIntegrationSummaryFile;
  const existsSync = options.existsSync ?? fs.existsSync;
  const createRunId = options.createRunId ?? (() => createIntegrationRunId());

  const loaded = loadSmoke({ cwd: options.cwd });
  const preflight = preflightFn({
    cwd: options.cwd,
    smokeEnv: loaded.env,
    envFileRel: loaded.envFileRel,
    envFileExists: loaded.envFileExists,
    prodRef: options.prodRef,
    testRef: options.testRef,
  });

  const safePreflightText = sanitizeIntegrationOutput(preflight.text, {
    prodRef: options.prodRef ?? EXCLOAD_PROD_SUPABASE_REF,
    testRef: options.testRef ?? EXCLOAD_TEST_SUPABASE_REF,
    urls: [loaded.env.DATABASE_URL, loaded.env.DIRECT_URL].filter(Boolean),
  });
  log(safePreflightText);
  if (!preflight.ok) {
    log('[shipment-transmission-it] preflight FAIL — child not started');
    return { exitCode: 1, childStarted: false, preflightOk: false };
  }

  const lock = acquireLock(options.cwd);
  if (!lock.ok) {
    log(
      `[shipment-transmission-it] lock FAIL (${lock.reason}) — child not started; ${lock.message ?? ''}`,
    );
    return { exitCode: 1, childStarted: false, preflightOk: true, lockOk: false };
  }

  const secrets = {
    prodRef: options.prodRef ?? EXCLOAD_PROD_SUPABASE_REF,
    testRef: options.testRef ?? EXCLOAD_TEST_SUPABASE_REF,
    urls: [loaded.env.DATABASE_URL, loaded.env.DIRECT_URL].filter(Boolean),
  };

  const runId = createRunId();
  const summaryPath = buildIntegrationSummaryPath(options.cwd, runId);
  if (existsSync(summaryPath)) {
    lock.release();
    log('[shipment-transmission-it] summary path collision — refuse stale reuse');
    return {
      exitCode: 1,
      childStarted: false,
      preflightOk: true,
      lockOk: true,
      judged: { ok: false, exitCode: 1, reasons: ['SUMMARY_PATH_EXISTS'] },
    };
  }

  let summaryDeleteWarning = null;
  try {
    const childEnv = buildIntegrationChildEnv({
      smokeEnv: loaded.env,
      parentEnv: options.parentEnv,
    });
    childEnv[INTEGRATION_SUMMARY_ENV] = summaryPath;
    childEnv[INTEGRATION_RUN_ID_ENV] = runId;

    const spawnTarget = buildIntegrationVitestSpawn(options.cwd);
    if (integrationCommandLooksUnsafe(spawnTarget.commandText)) {
      log('[shipment-transmission-it] unsafe command blocked');
      return { exitCode: 1, childStarted: false, preflightOk: true, lockOk: true };
    }

    const spawnSync = options.spawnSync;
    if (!spawnSync) {
      throw new Error('spawnSync is required');
    }

    const result = spawnSync(spawnTarget.command, spawnTarget.args, {
      cwd: options.cwd,
      env: childEnv,
      encoding: 'utf8',
    });

    const stdout = sanitizeIntegrationOutput(String(result.stdout ?? ''), secrets);
    const stderr = sanitizeIntegrationOutput(String(result.stderr ?? ''), secrets);
    if (stdout) log(stdout);
    if (stderr) log(stderr);

    const childExitCode = typeof result.status === 'number' ? result.status : 1;
    const summary = readSummary(summaryPath);
    const del = deleteSummary(summaryPath);
    if (del && del.ok === false) {
      summaryDeleteWarning = del.errorCode ?? 'SUMMARY_DELETE_FAILED';
      log(`[shipment-transmission-it] warning: ${summaryDeleteWarning}`);
    }

    const judged = evaluateIntegrationWrapperResult({
      childExitCode,
      lockReleased: true,
      expectedRunId: runId,
      summary,
    });
    if (!judged.ok) {
      log(`[shipment-transmission-it] final FAIL: ${judged.reasons.join(',')}`);
    } else {
      log('[shipment-transmission-it] final PASS');
    }

    return {
      exitCode: judged.exitCode,
      childStarted: true,
      preflightOk: true,
      lockOk: true,
      lockReleased: true,
      childExitCode,
      runId,
      judged,
      summaryDeleteWarning,
      childEnvKeys: Object.keys(childEnv).sort(),
      injectedDatabaseUrl: childEnv.DATABASE_URL === loaded.env.DATABASE_URL,
      ignoredParentDatabaseUrl: true,
    };
  } catch (error) {
    log('[shipment-transmission-it] runner error — child aborted');
    throw error;
  } finally {
    lock.release();
    deleteSummary(summaryPath);
  }
}
