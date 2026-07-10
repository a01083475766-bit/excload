#!/usr/bin/env node
/**
 * 송장전송 테스트 DB mutation 전용 preflight (DB 미접속).
 *
 * 사용:
 *   npm run order-transmission:test-db:check
 *   node scripts/check-shipment-transmission-test-db-env.mjs
 *
 * - `.env.smoke.local`만 디스크에서 명시 로드 (process.env DATABASE_URL 무시)
 * - ALLOW_TEST_DB_MUTATION=true 필수
 * - 운영 ref 차단 / 테스트 ref 일치
 * - migration.sql 정적 검사
 * - URL·password·project ref 원문 출력 금지
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  EXCLOAD_PROD_SUPABASE_REF,
  EXCLOAD_TEST_SUPABASE_REF,
  parseEnvFileContent,
  SMOKE_ENV_FILE,
} from './lib/excload-db-env-shared.mjs';
import {
  evaluateMigrationSqlStatic,
  evaluateTestDbMutationPreflight,
  formatPreflightReport,
  SHIPMENT_TRANSMISSION_MIGRATION_SQL_REL,
} from './lib/shipment-transmission-test-db-guard.mjs';

function main() {
  const envFileRel = SMOKE_ENV_FILE;
  const envAbs = path.resolve(process.cwd(), envFileRel);
  const envFileExists = fs.existsSync(envAbs);

  /** @type {Record<string, string>} */
  let env = {};
  if (envFileExists) {
    env = parseEnvFileContent(fs.readFileSync(envAbs, 'utf8'));
  }

  const envResult = evaluateTestDbMutationPreflight({
    env,
    envFileName: envFileRel,
    envFileExists,
    prodRef: EXCLOAD_PROD_SUPABASE_REF,
    testRef: EXCLOAD_TEST_SUPABASE_REF,
  });

  const migrationAbs = path.resolve(
    process.cwd(),
    SHIPMENT_TRANSMISSION_MIGRATION_SQL_REL,
  );
  const migrationExists = fs.existsSync(migrationAbs);
  const sql = migrationExists ? fs.readFileSync(migrationAbs, 'utf8') : '';
  const migrationResult = evaluateMigrationSqlStatic({
    exists: migrationExists,
    sql,
    prodRef: EXCLOAD_PROD_SUPABASE_REF,
    testRef: EXCLOAD_TEST_SUPABASE_REF,
  });

  const { ok, text } = formatPreflightReport(envResult, migrationResult);
  console.log(text);
  process.exit(ok ? 0 : 1);
}

main();
