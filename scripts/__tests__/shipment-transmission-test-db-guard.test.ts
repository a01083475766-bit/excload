import { describe, expect, it } from 'vitest';

import {
  evaluateMigrationSqlStatic,
  evaluateTestDbMutationPreflight,
  formatPreflightReport,
  reportContainsSecrets,
} from '../lib/shipment-transmission-test-db-guard.mjs';

const FAKE_PROD = 'prodref00000000000000';
const FAKE_TEST = 'testref11111111111111';

type GuardCheck = { name: string; status: string };

const GOOD_SQL = `
ALTER TYPE "OrderSyncTransmissionStatus" ADD VALUE 'PROCESSING' BEFORE 'SENT';
ALTER TYPE "OrderSyncTransmissionStatus" ADD VALUE 'UNKNOWN' AFTER 'SKIPPED';
CREATE TABLE "ShipmentTransmissionAttempt" (
  "id" TEXT NOT NULL
);
`;

function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const merged: Record<string, string | undefined> = {
    EXCLOAD_ENV_PROFILE: 'smoke',
    TEST_DB_ENV_FILE: '.env.smoke.local',
    ALLOW_TEST_DB_MUTATION: 'true',
    DATABASE_URL: `postgresql://u:p@db.${FAKE_TEST}.supabase.co:6543/postgres`,
    DIRECT_URL: `postgresql://u:p@db.${FAKE_TEST}.supabase.co:5432/postgres`,
    ...overrides,
  };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function runEnv(env: Record<string, string>, fileName = '.env.smoke.local') {
  return evaluateTestDbMutationPreflight({
    env,
    envFileName: fileName,
    envFileExists: true,
    prodRef: FAKE_PROD,
    testRef: FAKE_TEST,
  });
}

function statusOf(result: { checks: GuardCheck[] }, name: string) {
  return result.checks.find((c: GuardCheck) => c.name === name)?.status;
}

describe('evaluateTestDbMutationPreflight', () => {
  it('passes on valid smoke mutation env', () => {
    const result = runEnv(baseEnv());
    expect(result.ok).toBe(true);
    expect(result.failedNames).toEqual([]);
  });

  it('fails when ALLOW_TEST_DB_MUTATION is missing', () => {
    const result = runEnv(baseEnv({ ALLOW_TEST_DB_MUTATION: undefined }));
    expect(result.ok).toBe(false);
    expect(result.failedNames).toContain('ALLOW_TEST_DB_MUTATION');
    expect(statusOf(result, 'ALLOW_TEST_DB_MUTATION')).toBe('MISSING');
  });

  it('fails when ALLOW_TEST_DB_MUTATION is false', () => {
    const result = runEnv(baseEnv({ ALLOW_TEST_DB_MUTATION: 'false' }));
    expect(result.ok).toBe(false);
    expect(statusOf(result, 'ALLOW_TEST_DB_MUTATION')).toBe('BLOCKED');
  });

  it('fails when ALLOW_TEST_DB_MUTATION is TRUE (case mismatch)', () => {
    const result = runEnv(baseEnv({ ALLOW_TEST_DB_MUTATION: 'TRUE' }));
    expect(result.ok).toBe(false);
    expect(statusOf(result, 'ALLOW_TEST_DB_MUTATION')).toBe('BLOCKED');
  });

  it('fails when DATABASE_URL is missing', () => {
    const result = runEnv(baseEnv({ DATABASE_URL: undefined }));
    expect(result.failedNames).toContain('DATABASE_URL');
  });

  it('fails when DIRECT_URL is missing', () => {
    const result = runEnv(baseEnv({ DIRECT_URL: undefined }));
    expect(result.failedNames).toContain('DIRECT_URL');
  });

  it('fails when test ref is missing from both URLs', () => {
    const result = runEnv(
      baseEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/postgres',
        DIRECT_URL: 'postgresql://u:p@localhost:5432/postgres',
      }),
    );
    expect(result.failedNames).toContain('TEST_REF');
    expect(result.failedNames).toContain('DATABASE_URL_TEST_REF');
  });

  it('fails when DATABASE_URL lacks test ref', () => {
    const result = runEnv(
      baseEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/postgres',
      }),
    );
    expect(result.failedNames).toContain('DATABASE_URL_TEST_REF');
  });

  it('fails when DIRECT_URL lacks test ref', () => {
    const result = runEnv(
      baseEnv({
        DIRECT_URL: 'postgresql://u:p@localhost:5432/postgres',
      }),
    );
    expect(result.failedNames).toContain('DIRECT_URL_TEST_REF');
  });

  it('fails when URLs point at different projects', () => {
    const other = 'otherref22222222222222';
    const result = runEnv(
      baseEnv({
        DIRECT_URL: `postgresql://u:p@db.${other}.supabase.co:5432/postgres`,
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.failedNames).toContain('DIRECT_URL_TEST_REF');
  });

  it('fails when production ref is present', () => {
    const result = runEnv(
      baseEnv({
        DATABASE_URL: `postgresql://u:p@db.${FAKE_PROD}.supabase.co:6543/postgres`,
        DIRECT_URL: `postgresql://u:p@db.${FAKE_PROD}.supabase.co:5432/postgres`,
      }),
    );
    expect(result.failedNames).toContain('PROD_REF');
    expect(statusOf(result, 'PROD_REF')).toBe('BLOCKED');
  });

  it('fails when env profile is not smoke', () => {
    const result = runEnv(baseEnv({ EXCLOAD_ENV_PROFILE: 'production' }));
    expect(result.failedNames).toContain('EXCLOAD_ENV_PROFILE');
  });

  it('fails when env file name is not smoke file', () => {
    const result = evaluateTestDbMutationPreflight({
      env: baseEnv(),
      envFileName: '.env',
      envFileExists: true,
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
    });
    expect(result.failedNames).toContain('ENV_FILE_EXPLICIT');
  });
});

describe('evaluateMigrationSqlStatic', () => {
  it('passes on expected migration shape', () => {
    const result = evaluateMigrationSqlStatic({
      exists: true,
      sql: GOOD_SQL,
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
    });
    expect(result.ok).toBe(true);
  });

  it('fails when migration file is missing', () => {
    const result = evaluateMigrationSqlStatic({
      exists: false,
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
    });
    expect(result.failedNames).toContain('MIGRATION_FILE');
    expect(result.checks[0]?.status).toBe('MISSING');
  });

  it('fails when migration file is empty', () => {
    const result = evaluateMigrationSqlStatic({
      exists: true,
      sql: '   \n',
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
    });
    expect(statusOf(result, 'MIGRATION_FILE')).toBe('EMPTY');
  });

  it('fails on destructive SQL', () => {
    const result = evaluateMigrationSqlStatic({
      exists: true,
      sql: `${GOOD_SQL}\nDROP TABLE "ShipmentMatch";`,
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
    });
    expect(statusOf(result, 'DESTRUCTIVE_SQL')).toBe('UNSAFE');
  });
});

describe('formatPreflightReport secrecy', () => {
  it('PASS/FAIL report does not include urls, passwords, or refs', () => {
    const env = baseEnv();
    const envResult = runEnv(env);
    const migrationResult = evaluateMigrationSqlStatic({
      exists: true,
      sql: GOOD_SQL,
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
    });
    const { ok, text } = formatPreflightReport(envResult, migrationResult);
    expect(ok).toBe(true);
    expect(text).toContain('TEST DB MUTATION PREFLIGHT: PASS');
    expect(
      reportContainsSecrets(text, {
        prodRef: FAKE_PROD,
        testRef: FAKE_TEST,
        urls: [env.DATABASE_URL, env.DIRECT_URL],
      }),
    ).toBe(false);

    const failEnv = runEnv(baseEnv({ ALLOW_TEST_DB_MUTATION: 'false' }));
    const failReport = formatPreflightReport(failEnv, migrationResult);
    expect(failReport.ok).toBe(false);
    expect(failReport.text).toContain('TEST DB MUTATION PREFLIGHT: FAIL');
    expect(
      reportContainsSecrets(failReport.text, {
        prodRef: FAKE_PROD,
        testRef: FAKE_TEST,
        urls: [env.DATABASE_URL, env.DIRECT_URL],
      }),
    ).toBe(false);
  });
});
