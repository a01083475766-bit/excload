#!/usr/bin/env node
/**
 * 주문연동 실테스트 전 안전 점검 (secret 미출력).
 *
 * 사용:
 *   node scripts/check-order-sync-realtest-env.mjs
 *   node scripts/check-order-sync-realtest-env.mjs --env-file=.env.smoke.local
 *   node scripts/check-order-sync-realtest-env.mjs --env-file=.env.smoke.local.example
 *
 * - 운영 Supabase ref(xtlgtphceakmzmtqihnn) 감지 시 exit 1
 * - 테스트 ref(qejjcjwbnxhmhcgwrbvt) 여부 보고
 * - 필수 키 존재 여부만 확인 (값은 출력하지 않음)
 * - 외부 API / DB 연결 시도 없음
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROD_REF = 'xtlgtphceakmzmtqihnn';
const TEST_REF = 'qejjcjwbnxhmhcgwrbvt';

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'EXCLOAD_INTEGRATION_ENCRYPTION_KEY',
];

const OPTIONAL_PROXY_KEYS = [
  'COUPANG_PROXY_BASE_URL',
  'COUPANG_PROXY_SHARED_SECRET',
  'INTEGRATION_PROXY_BASE_URL',
  'INTEGRATION_PROXY_SHARED_SECRET',
];

function parseArgs(argv) {
  let envFile = '.env.smoke.local';
  for (const arg of argv) {
    if (arg.startsWith('--env-file=')) {
      envFile = arg.slice('--env-file='.length);
    }
  }
  return { envFile };
}

function parseEnvFile(content) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function isPresent(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function findRefsInText(text) {
  const found = [];
  if (text.includes(PROD_REF)) found.push({ kind: 'prod', ref: PROD_REF });
  if (text.includes(TEST_REF)) found.push({ kind: 'test', ref: TEST_REF });
  return found;
}

function maskPresence(ok) {
  return ok ? 'SET' : 'MISSING';
}

function main() {
  const { envFile } = parseArgs(process.argv.slice(2));
  const abs = path.resolve(process.cwd(), envFile);

  console.log('[order-sync-realtest-env] check start');
  console.log(`  env file: ${envFile}`);

  if (!fs.existsSync(abs)) {
    console.error(`FAIL: env file not found: ${envFile}`);
    console.error('  hint: copy .env.smoke.local.example → .env.smoke.local');
    process.exit(1);
  }

  const raw = fs.readFileSync(abs, 'utf8');
  const env = parseEnvFile(raw);

  let failed = false;
  const notes = [];

  // --- DB ref safety (URL 값만 검사 — 주석의 경고 문구는 오탐 제외) ---
  const dbBlob = [env.DATABASE_URL ?? '', env.DIRECT_URL ?? ''].join('\n');
  const refs = findRefsInText(dbBlob);
  const hasProd = refs.some((r) => r.kind === 'prod');
  const hasTest = refs.some((r) => r.kind === 'test');

  if (hasProd) {
    console.error(`FAIL: production Supabase ref detected (${PROD_REF})`);
    console.error('  abort: do not run realtest / persist against production DB');
    failed = true;
  } else {
    console.log(`  production ref (${PROD_REF}): not found`);
  }

  if (hasTest) {
    console.log(`  test ref (${TEST_REF}): found`);
  } else {
    console.log(`  test ref (${TEST_REF}): NOT found`);
    notes.push('DATABASE_URL/DIRECT_URL에 테스트 ref가 보이지 않습니다. 테스트 DB인지 재확인하세요.');
    if (!hasProd && isPresent(env.DATABASE_URL)) {
      // Non-empty DB URL without known test ref — warn hard
      failed = true;
      console.error('FAIL: DB URL is set but expected test ref is missing');
    }
  }

  // --- required keys (presence only) ---
  console.log('  required keys:');
  for (const key of REQUIRED_KEYS) {
    const ok = isPresent(env[key]);
    console.log(`    ${key}: ${maskPresence(ok)}`);
    if (!ok) {
      failed = true;
      console.error(`FAIL: missing required key ${key}`);
    }
  }

  // --- snapshot persist flag ---
  const persistRaw = (env.ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED ?? '').trim();
  const persistOn = persistRaw === 'true';
  console.log(`  ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED: ${persistRaw === '' ? '(unset)' : persistRaw}`);
  if (!persistOn) {
    notes.push("snapshot DB 저장 검증 시 ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true 가 필요합니다 (코드는 'true'만 ON).");
  } else {
    console.log('  snapshot persist: ON (local realtest OK if test DB)');
  }

  // --- proxy (optional for Coupang, required later for Smartstore) ---
  console.log('  proxy keys (optional for Coupang direct):');
  for (const key of OPTIONAL_PROXY_KEYS) {
    console.log(`    ${key}: ${maskPresence(isPresent(env[key]))}`);
  }
  const smartstoreProxyReady =
    isPresent(env.INTEGRATION_PROXY_BASE_URL) && isPresent(env.INTEGRATION_PROXY_SHARED_SECRET);
  const coupangProxyReady =
    isPresent(env.COUPANG_PROXY_BASE_URL) && isPresent(env.COUPANG_PROXY_SHARED_SECRET);
  console.log(`  Coupang: direct OK without proxy; proxy pair: ${coupangProxyReady ? 'SET' : 'not set'}`);
  console.log(
    `  Smartstore: proxy required; INTEGRATION_PROXY pair: ${smartstoreProxyReady ? 'SET' : 'MISSING'}`,
  );
  if (!smartstoreProxyReady) {
    notes.push('스마트스토어 실테스트 전에는 INTEGRATION_PROXY_BASE_URL + SHARED_SECRET 이 필요합니다.');
  }

  // --- remind: mall secrets not in env ---
  console.log('  mall credentials: must be saved via UI (not in this env file)');

  for (const note of notes) {
    console.log(`NOTE: ${note}`);
  }

  if (failed) {
    console.error('[order-sync-realtest-env] FAIL');
    process.exit(1);
  }

  console.log('[order-sync-realtest-env] PASS (presence/safety checks only; no API/DB call)');
  process.exit(0);
}

main();
