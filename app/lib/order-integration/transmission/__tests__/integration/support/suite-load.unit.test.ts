/**
 * Loads the smoke integration Vitest suite without mutation gate / real DB.
 * Catches describe-time hook misuse (e.g. onTestFinished outside a test).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const FAKE_PROD = 'prodref00000000000000';
const FAKE_TEST = 'testref11111111111111';

describe('transmission integration suite-load (no DB)', () => {
  it('loads integration config without suite setup hook errors', () => {
    const cwd = process.cwd();
    const vitestEntry = path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
    const config = path.join(cwd, 'vitest.integration.config.ts');

    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DIRECT_URL;
    delete env.ALLOW_TEST_DB_MUTATION;
    delete env.SHIPMENT_TRANSMISSION_IT_RUN;
    delete env.SHIPMENT_TRANSMISSION_IT_SUMMARY_PATH;
    delete env.SHIPMENT_TRANSMISSION_IT_RUN_ID;
    delete env.EXCLOAD_ENV_PROFILE;
    delete env.TEST_DB_ENV_FILE;
    // Explicit non-smoke markers — gate must block Prisma/fixture
    env.ALLOW_TEST_DB_MUTATION = 'false';
    env.EXCLOAD_ENV_PROFILE = 'unit';
    env.TEST_DB_ENV_FILE = 'not-smoke.env';
    env.DATABASE_URL = 'postgresql://suite-load-fake:fake@127.0.0.1:1/no_connect';
    env.DIRECT_URL = 'postgresql://suite-load-fake:fake@127.0.0.1:1/no_connect';

    const result = spawnSync(process.execPath, [vitestEntry, 'run', '--config', config], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
    const stdout = String(result.stdout ?? '');
    const stderr = String(result.stderr ?? '');
    const blob = `${stdout}\n${stderr}`;

    expect(blob).not.toMatch(/onTestFinished\(\) can only be called inside a test/i);
    expect(blob).not.toMatch(/suite setup|Hooks collection failed|Error while loading/i);
    // Gate blocks — no Prisma connect / fixture / mutation path
    expect(blob).not.toMatch(/Can't reach database|P1001|PrismaClientInitializationError/i);
    expect(blob).not.toMatch(/integration mutation blocked/i);
    expect(blob).not.toContain(FAKE_PROD);
    expect(blob).not.toContain(FAKE_TEST);
    expect(blob).not.toMatch(/postgres(ql)?:\/\/[^\s]+@db\./i);
    expect(blob).not.toMatch(/suite-load-fake/);
    // Skipped smoke suite exits cleanly (no executed tests required)
    expect(blob).toMatch(/skipped|skip/i);
    expect(result.status).toBe(0);
  });
});
