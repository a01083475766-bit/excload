/**
 * Safety: load only .env.smoke.local, refuse prod/default DB, then migrate deploy + voucher IT.
 * Never prints connection strings or secrets.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXCLOAD_PROD_SUPABASE_REF,
  EXCLOAD_TEST_SUPABASE_REF,
  classifyRefsInText,
  looksLikePostgresUrl,
  parseEnvFileContent,
  SMOKE_ENV_FILE,
} from './lib/excload-db-env-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');

function fail(msg) {
  console.error(`[voucher-db-verify] FAIL: ${msg}`);
  process.exit(1);
}

function loadSmoke() {
  const abs = path.join(cwd, SMOKE_ENV_FILE);
  if (!fs.existsSync(abs)) fail(`${SMOKE_ENV_FILE} missing — no dedicated test DB configured`);
  const env = parseEnvFileContent(fs.readFileSync(abs, 'utf8'));
  if (!looksLikePostgresUrl(env.DATABASE_URL) || !looksLikePostgresUrl(env.DIRECT_URL)) {
    fail('smoke DB URLs invalid');
  }
  const refs = classifyRefsInText(
    `${env.DATABASE_URL}\n${env.DIRECT_URL}`,
    EXCLOAD_PROD_SUPABASE_REF,
    EXCLOAD_TEST_SUPABASE_REF,
  );
  if (refs.hasProd) fail('smoke env contains PRODUCTION ref — abort');
  if (!refs.hasTest) fail('smoke env missing TEST ref — abort');

  // Refuse if accidentally same as default .env
  const defPath = path.join(cwd, '.env');
  if (fs.existsSync(defPath)) {
    const def = parseEnvFileContent(fs.readFileSync(defPath, 'utf8'));
    const defRefs = classifyRefsInText(
      `${def.DATABASE_URL || ''}\n${def.DIRECT_URL || ''}`,
      EXCLOAD_PROD_SUPABASE_REF,
      EXCLOAD_TEST_SUPABASE_REF,
    );
    if (defRefs.hasTest && !defRefs.hasProd) {
      // rare: default also test — still ok if identical? check equality of hostname user
    }
    if (def.DATABASE_URL && def.DATABASE_URL === env.DATABASE_URL) {
      fail('smoke DATABASE_URL equals .env — refuse');
    }
  }

  return env;
}

function run(cmd, args, env, opts = {}) {
  console.log(`[voucher-db-verify] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const allowNonZero = Boolean(opts.allowNonZero);
  if (r.status !== 0 && !allowNonZero) fail(`${cmd} exited ${r.status}`);
  return r.status ?? 1;
}

const smoke = loadSmoke();
const childEnv = {
  ...process.env,
  // Force smoke URLs; ignore parent shell DB
  DATABASE_URL: smoke.DATABASE_URL,
  DIRECT_URL: smoke.DIRECT_URL,
  EXCLOAD_ENV_PROFILE: 'smoke',
  TEST_DB_ENV_FILE: SMOKE_ENV_FILE,
  ALLOW_TEST_DB_MUTATION: 'true',
  VOUCHER_CODE_HMAC_SECRET:
    process.env.VOUCHER_CODE_HMAC_SECRET_TEST ||
    'voucher-test-hmac-secret-do-not-use-in-prod-0123456789abcdef',
  OPEN_BETA_ENDS_AT: process.env.OPEN_BETA_ENDS_AT || '2026-10-01T00:00:00+09:00',
  // Prevent prisma from loading .env over smoke
  PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: undefined,
};

console.log('[voucher-db-verify] Using dedicated smoke TEST DB only (refs checked, secrets omitted)');
console.log('[voucher-db-verify] prisma validate');
run('npx', ['prisma', 'validate'], childEnv);
console.log('[voucher-db-verify] prisma generate');
run('npx', ['prisma', 'generate'], childEnv);
console.log('[voucher-db-verify] prisma migrate status');
// Pending migrations make Prisma exit 1 — expected before deploy
run('npx', ['prisma', 'migrate', 'status'], childEnv, { allowNonZero: true });
console.log('[voucher-db-verify] prisma migrate deploy (additive, no reset)');
run('npx', ['prisma', 'migrate', 'deploy'], childEnv);
console.log('[voucher-db-verify] prisma migrate status (post)');
run('npx', ['prisma', 'migrate', 'status'], childEnv, { allowNonZero: true });
console.log('[voucher-db-verify] run integration script');
run('npx', ['tsx', 'scripts/voucher-db-integration-verify.ts'], childEnv);
console.log('[voucher-db-verify] DONE');
