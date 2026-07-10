/**
 * Pure preflight for shipment-transmission test-DB mutation.
 * No DB I/O. Never include URL / password / project ref in status messages.
 */

import {
  classifyRefsInText,
  isPresent,
  looksLikePostgresUrl,
  SMOKE_ENV_FILE,
  SMOKE_ENV_PROFILE,
} from './excload-db-env-shared.mjs';

export const SHIPMENT_TRANSMISSION_MIGRATION_DIR =
  'prisma/migrations/20260710230000_add_shipment_transmission_attempts';

export const SHIPMENT_TRANSMISSION_MIGRATION_SQL_REL =
  `${SHIPMENT_TRANSMISSION_MIGRATION_DIR}/migration.sql`;

/**
 * @typedef {{ name: string, status: string }} GuardCheck
 * @typedef {{
 *   ok: boolean,
 *   checks: GuardCheck[],
 *   failedNames: string[],
 * }} GuardResult
 */

/**
 * @param {object} input
 * @param {Record<string, string>} input.env — values from the explicit smoke env file only
 * @param {string} input.envFileName — basename or relative path that was loaded
 * @param {string} input.prodRef
 * @param {string} input.testRef
 * @param {boolean} [input.envFileExists]
 */
export function evaluateTestDbMutationPreflight(input) {
  /** @type {GuardCheck[]} */
  const checks = [];
  /** @type {string[]} */
  const failedNames = [];

  /**
   * @param {string} name
   * @param {string} status
   * @param {boolean} ok
   */
  function add(name, status, ok) {
    checks.push({ name, status });
    if (!ok) failedNames.push(name);
  }

  const envFileExists = input.envFileExists !== false;
  if (!envFileExists) {
    add('ENV_FILE', 'MISSING', false);
    return { ok: false, checks, failedNames };
  }

  const env = input.env ?? {};
  const envFileName = String(input.envFileName ?? '').replace(/\\/g, '/');
  const baseName = envFileName.split('/').pop() ?? '';
  const expectedFile = SMOKE_ENV_FILE;
  const fileOk = baseName === expectedFile || envFileName.endsWith(`/${expectedFile}`);
  add('ENV_FILE_EXPLICIT', fileOk ? 'MATCH' : 'MISMATCH', fileOk);

  const profile = (env.EXCLOAD_ENV_PROFILE ?? '').trim();
  const profileOk = profile === SMOKE_ENV_PROFILE;
  add(
    'EXCLOAD_ENV_PROFILE',
    profileOk ? 'MATCH' : isPresent(profile) ? 'MISMATCH' : 'MISSING',
    profileOk,
  );

  const marker = (env.TEST_DB_ENV_FILE ?? '').trim();
  const markerOk = marker === expectedFile;
  add(
    'TEST_DB_ENV_FILE',
    markerOk ? 'MATCH' : isPresent(marker) ? 'MISMATCH' : 'MISSING',
    markerOk,
  );

  const allowRaw = env.ALLOW_TEST_DB_MUTATION;
  const allowOk = allowRaw === 'true';
  if (allowRaw == null || String(allowRaw).trim() === '') {
    add('ALLOW_TEST_DB_MUTATION', 'MISSING', false);
  } else if (allowOk) {
    add('ALLOW_TEST_DB_MUTATION', 'MATCH', true);
  } else {
    add('ALLOW_TEST_DB_MUTATION', 'BLOCKED', false);
  }

  const databaseUrl = env.DATABASE_URL ?? '';
  const directUrl = env.DIRECT_URL ?? '';

  const dbSet = isPresent(databaseUrl);
  const directSet = isPresent(directUrl);
  add('DATABASE_URL', dbSet ? 'SET' : 'MISSING', dbSet);
  add('DIRECT_URL', directSet ? 'SET' : 'MISSING', directSet);

  const dbPg = dbSet && looksLikePostgresUrl(databaseUrl);
  const directPg = directSet && looksLikePostgresUrl(directUrl);
  add('DATABASE_URL_POSTGRES', dbPg ? 'MATCH' : 'MISMATCH', dbPg);
  add('DIRECT_URL_POSTGRES', directPg ? 'MATCH' : 'MISMATCH', directPg);

  const prodRef = input.prodRef;
  const testRef = input.testRef;

  const dbRefs = classifyRefsInText(databaseUrl, prodRef, testRef);
  const directRefs = classifyRefsInText(directUrl, prodRef, testRef);
  const combined = classifyRefsInText(
    `${databaseUrl}\n${directUrl}`,
    prodRef,
    testRef,
  );

  if (combined.hasProd) {
    add('PROD_REF', 'BLOCKED', false);
  } else {
    add('PROD_REF', 'MATCH', true);
  }

  const testPresent = combined.hasTest;
  add('TEST_REF', testPresent ? 'MATCH' : 'MISSING', testPresent);

  const dbTestOk = dbSet && dbRefs.hasTest && !dbRefs.hasProd;
  add('DATABASE_URL_TEST_REF', dbTestOk ? 'MATCH' : 'MISMATCH', dbTestOk);

  const directTestOk = directSet && directRefs.hasTest && !directRefs.hasProd;
  add('DIRECT_URL_TEST_REF', directTestOk ? 'MATCH' : 'MISMATCH', directTestOk);

  const sameProject =
    dbTestOk &&
    directTestOk &&
    dbRefs.hasTest &&
    directRefs.hasTest &&
    !dbRefs.hasProd &&
    !directRefs.hasProd;
  add('URL_SAME_PROJECT', sameProject ? 'MATCH' : 'MISMATCH', sameProject);

  return {
    ok: failedNames.length === 0,
    checks,
    failedNames,
  };
}

/**
 * Static safety scan of migration.sql (not a full SQL proof).
 * @param {object} input
 * @param {boolean} input.exists
 * @param {string} [input.sql]
 * @param {string} input.prodRef
 * @param {string} input.testRef
 * @returns {GuardResult}
 */
export function evaluateMigrationSqlStatic(input) {
  /** @type {GuardCheck[]} */
  const checks = [];
  /** @type {string[]} */
  const failedNames = [];

  /**
   * @param {string} name
   * @param {string} status
   * @param {boolean} ok
   */
  function add(name, status, ok) {
    checks.push({ name, status });
    if (!ok) failedNames.push(name);
  }

  if (!input.exists) {
    add('MIGRATION_FILE', 'MISSING', false);
    return { ok: false, checks, failedNames };
  }

  const sql = String(input.sql ?? '');
  if (sql.trim().length === 0) {
    add('MIGRATION_FILE', 'EMPTY', false);
    return { ok: false, checks, failedNames };
  }
  add('MIGRATION_FILE', 'SET', true);

  const hasAttemptTable = /CREATE\s+TABLE\s+"ShipmentTransmissionAttempt"/i.test(sql);
  add('ATTEMPT_TABLE', hasAttemptTable ? 'MATCH' : 'MISSING', hasAttemptTable);

  const hasProcessing = /ADD\s+VALUE\s+'PROCESSING'/i.test(sql);
  const hasUnknown = /ADD\s+VALUE\s+'UNKNOWN'/i.test(sql);
  add('ENUM_PROCESSING', hasProcessing ? 'MATCH' : 'MISSING', hasProcessing);
  add('ENUM_UNKNOWN', hasUnknown ? 'MATCH' : 'MISSING', hasUnknown);

  const destructive =
    /\bDROP\s+TABLE\b/i.test(sql) ||
    /\bDROP\s+COLUMN\b/i.test(sql) ||
    /\bTRUNCATE\b/i.test(sql) ||
    /\bDELETE\s+FROM\b/i.test(sql);
  add('DESTRUCTIVE_SQL', destructive ? 'UNSAFE' : 'SAFE', !destructive);

  const hasConn =
    /postgres(ql)?:\/\//i.test(sql) ||
    /\bDATABASE_URL\b/i.test(sql) ||
    /\bDIRECT_URL\b/i.test(sql) ||
    /\bAuthorization\b/i.test(sql) ||
    /\bpassword\s*=/i.test(sql) ||
    /\b(api[_-]?key|secret)\s*[:=]/i.test(sql);
  add('SECRET_LIKE', hasConn ? 'UNSAFE' : 'SAFE', !hasConn);

  const refs = classifyRefsInText(sql, input.prodRef, input.testRef);
  add('REF_LEAK', refs.hasProd || refs.hasTest ? 'UNSAFE' : 'SAFE', !refs.hasProd && !refs.hasTest);

  return {
    ok: failedNames.length === 0,
    checks,
    failedNames,
  };
}

/**
 * Ensure report text does not leak sensitive material.
 * @param {string} text
 * @param {{ prodRef: string, testRef: string, urls?: string[] }} secrets
 */
export function reportContainsSecrets(text, secrets) {
  const blob = String(text ?? '');
  if (secrets.prodRef && blob.includes(secrets.prodRef)) return true;
  if (secrets.testRef && blob.includes(secrets.testRef)) return true;
  for (const url of secrets.urls ?? []) {
    if (url && blob.includes(url)) return true;
  }
  if (/postgres(ql)?:\/\/[^\s]+/i.test(blob)) return true;
  if (/password=/i.test(blob)) return true;
  return false;
}

/**
 * @param {GuardResult} envResult
 * @param {GuardResult} migrationResult
 */
export function formatPreflightReport(envResult, migrationResult) {
  const lines = [];
  lines.push('[shipment-transmission-test-db] preflight start');
  for (const check of envResult.checks) {
    lines.push(`  ${check.name}: ${check.status}`);
  }
  lines.push('  --- migration static ---');
  for (const check of migrationResult.checks) {
    lines.push(`  ${check.name}: ${check.status}`);
  }
  const ok = envResult.ok && migrationResult.ok;
  if (!ok) {
    const failed = [...envResult.failedNames, ...migrationResult.failedNames];
    lines.push(`FAIL items: ${failed.join(', ')}`);
    lines.push('TEST DB MUTATION PREFLIGHT: FAIL');
  } else {
    lines.push('TEST DB MUTATION PREFLIGHT: PASS');
  }
  return { ok, text: lines.join('\n') };
}
