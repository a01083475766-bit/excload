import { describe, expect, it, vi } from 'vitest';

import {
  acquireIntegrationLock,
  buildIntegrationChildEnv,
  buildIntegrationVitestSpawn,
  inspectIntegrationLock,
  integrationCommandLooksUnsafe,
  loadSmokeEnvFromDisk,
  runShipmentTransmissionDbIntegration,
  sanitizeIntegrationOutput,
  SHIPMENT_TRANSMISSION_IT_RUN_ENV,
} from '../lib/run-shipment-transmission-db-integration-core.mjs';

const FAKE_PROD = 'prodref00000000000000';
const FAKE_TEST = 'testref11111111111111';

const GOOD_SMOKE = {
  EXCLOAD_ENV_PROFILE: 'smoke',
  TEST_DB_ENV_FILE: '.env.smoke.local',
  ALLOW_TEST_DB_MUTATION: 'true',
  DATABASE_URL: `postgresql://u:p@db.${FAKE_TEST}.supabase.co:6543/postgres`,
  DIRECT_URL: `postgresql://u:p@db.${FAKE_TEST}.supabase.co:5432/postgres`,
};

describe('run-shipment-transmission-db-integration-core', () => {
  it('loadSmokeEnvFromDisk reads only the smoke file content', () => {
    const loaded = loadSmokeEnvFromDisk({
      cwd: '/fake',
      existsSync: () => true,
      readFileSync: () =>
        [
          'EXCLOAD_ENV_PROFILE=smoke',
          'TEST_DB_ENV_FILE=.env.smoke.local',
          'ALLOW_TEST_DB_MUTATION=true',
          `DATABASE_URL=${GOOD_SMOKE.DATABASE_URL}`,
          `DIRECT_URL=${GOOD_SMOKE.DIRECT_URL}`,
        ].join('\n'),
    });
    expect(loaded.envFileRel).toBe('.env.smoke.local');
    expect(loaded.env.DATABASE_URL).toBe(GOOD_SMOKE.DATABASE_URL);
  });

  it('buildIntegrationChildEnv ignores shell DB URLs and shell profile/mutation', () => {
    const child = buildIntegrationChildEnv({
      smokeEnv: GOOD_SMOKE,
      parentEnv: {
        PATH: '/usr/bin',
        DATABASE_URL: 'postgresql://shell-prod/should-ignore',
        DIRECT_URL: 'postgresql://shell-prod/should-ignore',
        EXCLOAD_ENV_PROFILE: 'production',
        ALLOW_TEST_DB_MUTATION: 'false',
        TEST_DB_ENV_FILE: '.env',
        OTHER: 'keep',
      },
    });
    expect(child.DATABASE_URL).toBe(GOOD_SMOKE.DATABASE_URL);
    expect(child.DIRECT_URL).toBe(GOOD_SMOKE.DIRECT_URL);
    expect(child.EXCLOAD_ENV_PROFILE).toBe('smoke');
    expect(child.ALLOW_TEST_DB_MUTATION).toBe('true');
    expect(child.TEST_DB_ENV_FILE).toBe('.env.smoke.local');
    expect(child.OTHER).toBe('keep');
    expect(child[SHIPMENT_TRANSMISSION_IT_RUN_ENV]).toBe('true');
    expect(child.DATABASE_URL).not.toContain('shell-prod');
  });

  it('sanitizeIntegrationOutput redacts urls and refs', () => {
    const raw = `fail ${GOOD_SMOKE.DATABASE_URL} ref=${FAKE_TEST} also ${FAKE_PROD}`;
    const out = sanitizeIntegrationOutput(raw, {
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      urls: [GOOD_SMOKE.DATABASE_URL],
    });
    expect(out).not.toContain(GOOD_SMOKE.DATABASE_URL);
    expect(out).not.toContain(FAKE_TEST);
    expect(out).not.toContain(FAKE_PROD);
    expect(out).toContain('[REDACTED_URL]');
    expect(out).toContain('[REDACTED_REF]');
  });

  it('does not start child when ALLOW_TEST_DB_MUTATION is false', () => {
    const spawnSync = vi.fn();
    const result = runShipmentTransmissionDbIntegration({
      cwd: process.cwd(),
      parentEnv: { DATABASE_URL: 'postgresql://shell/ignore' },
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      loadSmoke: () => ({
        envFileRel: '.env.smoke.local',
        envAbs: '/x/.env.smoke.local',
        envFileExists: true,
        env: { ...GOOD_SMOKE, ALLOW_TEST_DB_MUTATION: 'false' },
      }),
      spawnSync,
      log: () => {},
    });
    expect(result.childStarted).toBe(false);
    expect(result.preflightOk).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('does not start child when preflight fails (prod ref)', () => {
    const spawnSync = vi.fn();
    const result = runShipmentTransmissionDbIntegration({
      cwd: process.cwd(),
      parentEnv: {},
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      loadSmoke: () => ({
        envFileRel: '.env.smoke.local',
        envAbs: '/x/.env.smoke.local',
        envFileExists: true,
        env: {
          ...GOOD_SMOKE,
          DATABASE_URL: `postgresql://u:p@db.${FAKE_PROD}.supabase.co:6543/postgres`,
          DIRECT_URL: `postgresql://u:p@db.${FAKE_PROD}.supabase.co:5432/postgres`,
        },
      }),
      spawnSync,
      log: () => {},
    });
    expect(result.childStarted).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('injects smoke URLs into child on PASS; args/logs have no URL plaintext', () => {
    const lines: string[] = [];
    const spawnSync = vi.fn(() => ({
      status: 0,
      stdout: `connected ${GOOD_SMOKE.DATABASE_URL}`,
      stderr: '',
    }));
    const runId = 'testrun01';
    const goodSummary = {
      version: 1,
      runId,
      testsPassed: 12,
      testsFailed: 0,
      testsTimedOut: 0,
      cleanupStatus: 'PASS',
      disconnectStatus: 'PASS',
      lockReleased: null,
      cleanupDeletedCount: 3,
      pendingRegistryEntries: 0,
      cleanupErrorCode: null,
      suiteAborted: false,
    };
    const result = runShipmentTransmissionDbIntegration({
      cwd: process.cwd(),
      parentEnv: {
        DATABASE_URL: 'postgresql://shell-should-ignore/db',
        DIRECT_URL: 'postgresql://shell-should-ignore/db',
        EXCLOAD_ENV_PROFILE: 'production',
        ALLOW_TEST_DB_MUTATION: 'false',
        PATH: process.env.PATH,
      },
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      loadSmoke: () => ({
        envFileRel: '.env.smoke.local',
        envAbs: '/x/.env.smoke.local',
        envFileExists: true,
        env: GOOD_SMOKE,
      }),
      acquireLock: () => ({
        ok: true,
        lockPath: '/tmp/x.lock',
        reason: 'ACQUIRED',
        message: 'lock acquired',
        release: () => {},
      }),
      createRunId: () => runId,
      existsSync: () => false,
      readSummary: () => goodSummary,
      deleteSummary: () => ({ ok: true, errorCode: null }),
      spawnSync,
      log: (line) => lines.push(line),
    });
    expect(result.childStarted).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    const call = spawnSync.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    const args = call[1];
    const opts = call[2];
    expect(String(args.join(' '))).toContain('vitest.mjs');
    expect(String(args.join(' '))).not.toContain('postgresql://');
    expect(opts.env.DATABASE_URL).toBe(GOOD_SMOKE.DATABASE_URL);
    expect(opts.env.SHIPMENT_TRANSMISSION_IT_RUN_ID).toBe(runId);
    expect(opts.env.SHIPMENT_TRANSMISSION_IT_SUMMARY_PATH).toContain(runId);
    expect(lines.join('\n')).not.toContain(GOOD_SMOKE.DATABASE_URL);
  });

  it('fails when summary missing even if child exit 0', () => {
    const result = runShipmentTransmissionDbIntegration({
      cwd: process.cwd(),
      parentEnv: {},
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      loadSmoke: () => ({
        envFileRel: '.env.smoke.local',
        envAbs: '/x/.env.smoke.local',
        envFileExists: true,
        env: GOOD_SMOKE,
      }),
      acquireLock: () => ({
        ok: true,
        lockPath: '/tmp/x.lock',
        reason: 'ACQUIRED',
        message: 'lock acquired',
        release: () => {},
      }),
      createRunId: () => 'missing01',
      existsSync: () => false,
      readSummary: () => null,
      deleteSummary: () => ({ ok: true, errorCode: null }),
      spawnSync: () => ({ status: 0, stdout: 'ok', stderr: '' }),
      log: () => {},
    });
    expect(result.exitCode).toBe(1);
    expect(result.judged?.reasons).toContain('SUMMARY_MISSING');
  });

  it('rejects stale summary runId mismatch', () => {
    const result = runShipmentTransmissionDbIntegration({
      cwd: process.cwd(),
      parentEnv: {},
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      loadSmoke: () => ({
        envFileRel: '.env.smoke.local',
        envAbs: '/x/.env.smoke.local',
        envFileExists: true,
        env: GOOD_SMOKE,
      }),
      acquireLock: () => ({
        ok: true,
        lockPath: '/tmp/x.lock',
        reason: 'ACQUIRED',
        message: 'lock acquired',
        release: () => {},
      }),
      createRunId: () => 'expected01',
      existsSync: () => false,
      readSummary: () => ({
        version: 1,
        runId: 'other-run',
        testsPassed: 1,
        testsFailed: 0,
        testsTimedOut: 0,
        cleanupStatus: 'PASS',
        disconnectStatus: 'PASS',
        lockReleased: null,
        cleanupDeletedCount: 0,
        pendingRegistryEntries: 0,
        cleanupErrorCode: null,
        suiteAborted: false,
      }),
      deleteSummary: () => ({ ok: true, errorCode: null }),
      spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
      log: () => {},
    });
    expect(result.exitCode).toBe(1);
    expect(result.judged?.reasons).toContain('SUMMARY_RUN_ID_MISMATCH');
  });

  it('integration spawn command has no migrate', () => {
    const spawn = buildIntegrationVitestSpawn(process.cwd());
    expect(integrationCommandLooksUnsafe(spawn.commandText)).toBe(false);
    expect(spawn.commandText.toLowerCase()).not.toContain('migrate');
  });

  it('releases lock after child failure', () => {
    const release = vi.fn();
    runShipmentTransmissionDbIntegration({
      cwd: process.cwd(),
      parentEnv: {},
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      loadSmoke: () => ({
        envFileRel: '.env.smoke.local',
        envAbs: '/x/.env.smoke.local',
        envFileExists: true,
        env: GOOD_SMOKE,
      }),
      acquireLock: () => ({
        ok: true,
        lockPath: '/tmp/x.lock',
        reason: 'ACQUIRED',
        message: 'lock acquired',
        release,
      }),
      createRunId: () => 'failrun01',
      existsSync: () => false,
      readSummary: () => null,
      deleteSummary: () => ({ ok: true, errorCode: null }),
      spawnSync: () => ({ status: 2, stdout: '', stderr: 'fail' }),
      log: () => {},
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases lock when spawn throws', () => {
    const release = vi.fn();
    expect(() =>
      runShipmentTransmissionDbIntegration({
        cwd: process.cwd(),
        parentEnv: {},
        prodRef: FAKE_PROD,
        testRef: FAKE_TEST,
        loadSmoke: () => ({
          envFileRel: '.env.smoke.local',
          envAbs: '/x/.env.smoke.local',
          envFileExists: true,
          env: GOOD_SMOKE,
        }),
        acquireLock: () => ({
          ok: true,
          lockPath: '/tmp/x.lock',
          reason: 'ACQUIRED',
          message: 'lock acquired',
          release,
        }),
        createRunId: () => 'boom01',
        existsSync: () => false,
        readSummary: () => null,
        deleteSummary: () => ({ ok: true, errorCode: null }),
        spawnSync: () => {
          throw new Error('boom');
        },
        log: () => {},
      }),
    ).toThrow('boom');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('blocks second lock acquire without starting child', () => {
    const spawnSync = vi.fn();
    const result = runShipmentTransmissionDbIntegration({
      cwd: process.cwd(),
      parentEnv: {},
      prodRef: FAKE_PROD,
      testRef: FAKE_TEST,
      loadSmoke: () => ({
        envFileRel: '.env.smoke.local',
        envAbs: '/x/.env.smoke.local',
        envFileExists: true,
        env: GOOD_SMOKE,
      }),
      acquireLock: () => ({
        ok: false,
        lockPath: '/tmp/x.lock',
        reason: 'LOCK_HELD_ACTIVE',
        message: 'another integration run appears active',
        release: () => {},
      }),
      spawnSync,
      log: () => {},
    });
    expect(result.childStarted).toBe(false);
    expect(result.lockOk).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

describe('integration file lock', () => {
  it('acquires lock atomically and releases', () => {
    const files = new Map<string, string>();
    let fdSeq = 1;
    const openSync = vi.fn((p: string, flags: string) => {
      if (flags === 'wx' && files.has(p)) {
        const err = Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
        throw err;
      }
      files.set(p, '');
      return fdSeq++;
    });
    const writeSync = vi.fn((fd: number, data: string) => {
      for (const [path, _] of files) {
        if (path.endsWith('.shipment-transmission-it.lock')) {
          files.set(path, String(data));
        }
      }
    });
    const closeSync = vi.fn();
    const unlinkSync = vi.fn((p: string) => {
      files.delete(p);
    });

    const first = acquireIntegrationLock('/tmp/it-lock-test', {
      openSync: openSync as never,
      writeSync: writeSync as never,
      closeSync: closeSync as never,
      unlinkSync: unlinkSync as never,
    });
    expect(first.ok).toBe(true);
    expect(String(files.values().next().value ?? '')).toMatch(/^\d+/);
    expect(String(files.values().next().value ?? '')).not.toMatch(/postgres|password|secret/i);

    const second = acquireIntegrationLock('/tmp/it-lock-test', {
      openSync: openSync as never,
      writeSync: writeSync as never,
      closeSync: closeSync as never,
      unlinkSync: unlinkSync as never,
      readFileSync: ((p: string) => files.get(p) ?? '') as never,
      kill: () => true,
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/LOCK_HELD/);

    first.release();
    expect(unlinkSync).toHaveBeenCalled();
  });

  it('stale lock is reported without auto-delete', () => {
    const held = inspectIntegrationLock('/tmp/fake.lock', {
      readFileSync: () => '999999\n',
      kill: () => {
        throw new Error('ESRCH');
      },
    });
    expect(held.reason).toBe('LOCK_HELD_STALE');
    expect(held.message).toMatch(/manually/i);
    expect(held.message).not.toMatch(/postgres|password/i);
  });
});
