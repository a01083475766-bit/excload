#!/usr/bin/env node
/**
 * 송장전송 Prisma persist — smoke DB integration runner (D-6g-e1/e2).
 *
 * - `.env.smoke.local`만 디스크에서 로드 (shell DATABASE_URL 무시)
 * - mutation preflight PASS + ALLOW_TEST_DB_MUTATION=true 일 때만 vitest integration 실행
 * - migrate / 전체 cleanup 없음
 *
 * D-6g-e1: 스크립트만 준비. 실행은 D-6g-e2.
 *
 *   npm run order-transmission:test-db:integration
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { runShipmentTransmissionDbIntegration } from './lib/run-shipment-transmission-db-integration-core.mjs';

const result = runShipmentTransmissionDbIntegration({
  cwd: process.cwd(),
  parentEnv: process.env,
  spawnSync,
  log: (line) => {
    process.stdout.write(`${line}\n`);
  },
});

process.exit(result.exitCode);
