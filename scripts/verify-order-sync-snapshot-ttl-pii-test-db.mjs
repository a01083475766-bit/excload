/**
 * OrderSync TTL/PII — 테스트 DB 전용 검증 (smoke env only).
 *
 * - `.env.smoke.local`만 디스크에서 로드 (허용 플래그 강제 주입 없음)
 * - ALLOW_TEST_DB_MUTATION 은 사용자가 명시한 정확히 'true'만 허용
 * - Production ref 있으면 즉시 중단
 * - URL·password·secret·PII 원문 출력 금지
 * - localhost(npm run dev) HTTP 호출 금지 (cron 핸들러는 in-process)
 * - PII clear / purge / 재다운로드 TTL 은 production 함수를 호출한 뒤 결과만 조회
 *   (persistOrderSyncBatch, clearTransmittedOrderPiiIfComplete, purgeOrderSyncSnapshots)
 *
 * Usage:
 *   node scripts/verify-order-sync-snapshot-ttl-pii-test-db.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  EXCLOAD_PROD_SUPABASE_REF,
  EXCLOAD_TEST_SUPABASE_REF,
  classifyRefsInText,
  looksLikePostgresUrl,
  parseEnvFileContent,
  SMOKE_ENV_FILE,
  SMOKE_ENV_PROFILE,
} from './lib/excload-db-env-shared.mjs';
import { evaluateTestDbMutationPreflight } from './lib/shipment-transmission-test-db-guard.mjs';

const require = createRequire(import.meta.url);
const MARK = `ttlpii-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const PROJECT_ROOT = process.cwd();

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

function maskHost(host) {
  return String(host).replace(/([a-z0-9]{4})[a-z0-9]{8,}([a-z0-9]{4})/gi, '$1…$2');
}

function hostDb(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    db: (u.pathname || '/').replace(/^\//, '').split('?')[0] || '(empty)',
  };
}

function resolveAllowTestDbMutation(smoke) {
  const fromSmoke = smoke.ALLOW_TEST_DB_MUTATION;
  if (fromSmoke != null && String(fromSmoke).trim() !== '') {
    return String(fromSmoke).trim();
  }
  const fromProcess = process.env.ALLOW_TEST_DB_MUTATION;
  if (fromProcess != null && String(fromProcess).trim() !== '') {
    return String(fromProcess).trim();
  }
  return '';
}

function loadSmokeEnv() {
  const abs = path.resolve(PROJECT_ROOT, SMOKE_ENV_FILE);
  if (!fs.existsSync(abs)) fail(`${SMOKE_ENV_FILE} missing`);
  const smoke = parseEnvFileContent(fs.readFileSync(abs, 'utf8'));

  const allowMutation = resolveAllowTestDbMutation(smoke);
  if (allowMutation !== 'true') {
    fail(
      'TEST DB mutation requires explicit ALLOW_TEST_DB_MUTATION=true in .env.smoke.local or process env (refusing without it)',
    );
  }

  /** @type {Record<string, string>} */
  const env = {
    ...smoke,
    ALLOW_TEST_DB_MUTATION: allowMutation,
    EXCLOAD_ENV_PROFILE: smoke.EXCLOAD_ENV_PROFILE || SMOKE_ENV_PROFILE,
    TEST_DB_ENV_FILE: smoke.TEST_DB_ENV_FILE || SMOKE_ENV_FILE,
  };

  // cron 핸들러 인증 검사용 — smoke에 없으면 process-only 임시값 (로그에 원문 출력 금지)
  if (!env.CRON_SECRET || !String(env.CRON_SECRET).trim()) {
    env.CRON_SECRET = `verify-${randomBytes(16).toString('hex')}`;
  }

  const preflight = evaluateTestDbMutationPreflight({
    env,
    envFileName: SMOKE_ENV_FILE,
    envFileExists: true,
    prodRef: EXCLOAD_PROD_SUPABASE_REF,
    testRef: EXCLOAD_TEST_SUPABASE_REF,
  });
  if (!preflight.ok) {
    fail(`preflight blocked: ${preflight.failedNames.join(', ')}`);
  }

  const refs = classifyRefsInText(
    `${env.DATABASE_URL}\n${env.DIRECT_URL}`,
    EXCLOAD_PROD_SUPABASE_REF,
    EXCLOAD_TEST_SUPABASE_REF,
  );
  if (refs.hasProd || !refs.hasTest) {
    fail('DATABASE_URL class unclear or Production — abort');
  }
  if (!looksLikePostgresUrl(env.DATABASE_URL)) fail('DATABASE_URL invalid');

  const parsed = hostDb(env.DATABASE_URL);
  console.log('--- target (smoke only) ---');
  console.log('class: TEST');
  console.log('host:', maskHost(parsed.host));
  console.log('db:', parsed.db);
  console.log('marker:', MARK);
  return env;
}

function buildChildEnv(smokeEnv) {
  /** @type {Record<string, string>} */
  const child = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v == null) continue;
    if (
      /^(DATABASE_URL|DIRECT_URL|PRISMA_DATABASE_URL|POSTGRES_URL|SHADOW_DATABASE_URL|ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED|ALLOW_TEST_DB_MUTATION|CRON_SECRET)$/i.test(
        k,
      )
    ) {
      continue;
    }
    child[k] = v;
  }
  Object.assign(child, smokeEnv);
  child.DOTENV_CONFIG_PATH = path.resolve(SMOKE_ENV_FILE);
  return child;
}

function scrubLog(text) {
  return String(text ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_URL]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    env,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
  });
  const out = scrubLog(`${r.stdout || ''}\n${r.stderr || ''}`);
  if (r.status !== 0) {
    console.error(out.slice(-2500));
    fail(`${cmd} ${args.join(' ')} exit=${r.status}`);
  }
  return out;
}

function createSessionTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'excload-ttlpii-'));
}

function assertPathInsideTempDir(tmpDir, filePath) {
  const resolvedTmp = path.resolve(tmpDir);
  const resolvedFile = path.resolve(filePath);
  const prefix = resolvedTmp.endsWith(path.sep) ? resolvedTmp : resolvedTmp + path.sep;
  if (resolvedFile !== resolvedTmp && !resolvedFile.startsWith(prefix)) {
    fail('refusing path outside session temp dir');
  }
}

function safeRmSessionTempDir(tmpDir) {
  if (!tmpDir) return;
  const resolvedTmp = path.resolve(tmpDir);
  const allowedRoot = path.resolve(os.tmpdir());
  const rootPrefix = allowedRoot.endsWith(path.sep) ? allowedRoot : allowedRoot + path.sep;
  if (!resolvedTmp.startsWith(rootPrefix)) {
    console.error('cleanup warning: temp dir outside os.tmpdir — skip');
    return;
  }
  if (!path.basename(resolvedTmp).startsWith('excload-ttlpii-')) {
    console.error('cleanup warning: unexpected temp dir name — skip');
    return;
  }
  try {
    fs.rmSync(resolvedTmp, { recursive: true, force: true });
  } catch (e) {
    console.error('cleanup warning: temp dir', e instanceof Error ? e.message : e);
  }
}

function importHref(absPath) {
  return pathToFileURL(path.resolve(absPath)).href;
}

/**
 * @param {string} tmpDir
 * @param {string} fileName
 * @param {string} source
 */
function writeSessionRunner(tmpDir, fileName, source) {
  const filePath = path.join(tmpDir, fileName);
  assertPathInsideTempDir(tmpDir, filePath);
  fs.writeFileSync(filePath, source, 'utf8');
  return filePath;
}

/** production ORDER_SYNC_SNAPSHOT_TTL_MS = 14d — do not reimplement persist logic */
const ORDER_SYNC_SNAPSHOT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TTL_TOLERANCE_MS = 5_000;

function assertNearDate(actual, expected, label) {
  const a = actual instanceof Date ? actual.getTime() : new Date(actual).getTime();
  const e = expected instanceof Date ? expected.getTime() : new Date(expected).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(e) || Math.abs(a - e) > TTL_TOLERANCE_MS) {
    fail(`${label} not within ${TTL_TOLERANCE_MS}ms of expected production TTL clock`);
  }
}

/**
 * Call production persistOrderSyncBatch via session temp runner (no route clone).
 * @param {{
 *   tmpDir: string,
 *   childEnv: Record<string, string>,
 *   userId: string,
 *   integrationAccountId: string,
 *   fetchedAtIso: string,
 *   memo: string,
 *   snapshot: Record<string, unknown>,
 * }} input
 */
function runPersistOrderSyncBatch(input) {
  const persistMod = importHref(
    path.join(PROJECT_ROOT, 'app/lib/order-integration/snapshots/persist-order-sync-batch.ts'),
  );
  const runner = writeSessionRunner(
    input.tmpDir,
    `persist-${randomBytes(4).toString('hex')}.mts`,
    `
import { PrismaClient } from '@prisma/client';
import { persistOrderSyncBatch } from ${JSON.stringify(persistMod)};

const prisma = new PrismaClient();
const snapshot = ${JSON.stringify(input.snapshot)};
try {
  const result = await persistOrderSyncBatch(prisma, {
    userId: ${JSON.stringify(input.userId)},
    provider: 'SMARTSTORE',
    integrationAccountId: ${JSON.stringify(input.integrationAccountId)},
    sourceType: 'API',
    fetchedAt: ${JSON.stringify(input.fetchedAtIso)},
    memo: ${JSON.stringify(input.memo)},
    snapshots: [snapshot],
  });
  const order = result.orders[0];
  if (!order) throw new Error('persist returned no orders');
  console.log(JSON.stringify({
    orderId: order.id,
    excloadOrderNo: order.excloadOrderNo,
    mallOrderNo: order.mallOrderNo,
    lastCourierDownloadAt: order.lastCourierDownloadAt,
    expiresAt: order.expiresAt,
    receiverName: order.receiverName,
    receiverPhone: order.receiverPhone,
    receiverAddress: order.receiverAddress,
    piiClearedAt: order.piiClearedAt,
    transmissionStatus: order.transmissionStatus,
  }));
} finally {
  await prisma.$disconnect();
}
`,
  );
  const out = run('npx', ['tsx', '--tsconfig', 'tsconfig.json', runner], input.childEnv);
  const line = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('{') && l.includes('orderId'));
  if (!line) fail('persistOrderSyncBatch runner produced no result JSON');
  return JSON.parse(line);
}

function buildVirtualSnapshot(input) {
  const lineId = input.mallLineItemId;
  return {
    userId: input.userId,
    provider: 'SMARTSTORE',
    accountId: input.integrationAccountId,
    fetchedAt: input.fetchedAtIso,
    // create path ignores this and issues DB EXC; upsert keeps existing EXC
    excloadOrderNo: input.excloadOrderNoHint || 'EXC-PLACEHOLDER',
    mallOrderNo: input.mallOrderNo,
    mallLineItemIds: [lineId],
    receiverName: input.receiverName,
    receiverPhone: input.receiverPhone,
    receiverAddress: input.receiverAddress,
    productSummary: input.productSummary,
    quantity: 1,
    normalizedPayloadJson: { mallLineItemIds: [lineId] },
  };
}

async function runFlow(smokeEnv, childEnv) {
  for (const [k, v] of Object.entries(smokeEnv)) {
    process.env[k] = v;
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  /** @type {string | null} */
  let fixtureUserId = null;
  /** @type {string | null} */
  let sessionTempDir = null;
  /** @type {Error | null} */
  let flowError = null;

  try {
    sessionTempDir = createSessionTempDir();

    console.log('\n--- schema columns/indexes ---');
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'OrderSyncOrder'
        AND column_name IN ('lastCourierDownloadAt', 'expiresAt', 'piiClearedAt')
      ORDER BY column_name
    `);
    const colNames = cols.map((c) => c.column_name);
    for (const need of ['expiresAt', 'lastCourierDownloadAt', 'piiClearedAt']) {
      if (!colNames.includes(need)) fail(`missing column ${need}`);
    }
    ok(`columns: ${colNames.join(', ')}`);

    const idxs = await prisma.$queryRawUnsafe(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'OrderSyncOrder'
        AND indexname IN (
          'OrderSyncOrder_expiresAt_idx',
          'OrderSyncOrder_transmissionStatus_piiClearedAt_idx'
        )
      ORDER BY indexname
    `);
    const idxNames = idxs.map((i) => i.indexname);
    if (idxNames.length < 2) fail('indexes missing');
    ok(`indexes: ${idxNames.join(', ')}`);

    await prisma.orderSyncOrder.findFirst({
      select: { id: true, lastCourierDownloadAt: true, expiresAt: true, piiClearedAt: true },
    });
    ok('Prisma Client TTL/PII field access');

    console.log('\n--- production persistOrderSyncBatch: initial + re-download TTL ---');
    const user = await prisma.user.create({
      data: { email: `${MARK}@ttlpii.test.invalid`, name: `ttlpii-${MARK}` },
    });
    fixtureUserId = user.id;
    const account = await prisma.orderIntegrationAccount.create({
      data: {
        userId: fixtureUserId,
        provider: 'SMARTSTORE',
        accountName: `ttlpii-${MARK}`,
        vendorId: `v-${MARK}`,
        status: 'INACTIVE',
      },
    });

    const mallOrderNo = `VIRT-TTL-${MARK}`;
    const mallLineItemId = `VIRT-LINE-${MARK}`;
    const initialFetchedAt = new Date('2026-07-01T00:00:00.000Z');
    const initialSnapshot = buildVirtualSnapshot({
      userId: fixtureUserId,
      integrationAccountId: account.id,
      fetchedAtIso: initialFetchedAt.toISOString(),
      mallOrderNo,
      mallLineItemId,
      receiverName: '가상수신자갑',
      receiverPhone: '010-7001-9001',
      receiverAddress: '서울특별시 가상구 테스트로 9',
      productSummary: '[검증] ttlpii-product',
    });

    const initialPersist = runPersistOrderSyncBatch({
      tmpDir: sessionTempDir,
      childEnv,
      userId: fixtureUserId,
      integrationAccountId: account.id,
      fetchedAtIso: initialFetchedAt.toISOString(),
      memo: `ttlpii-download-${MARK}`,
      snapshot: initialSnapshot,
    });
    const orderId = initialPersist.orderId;
    const excloadOrderNo = initialPersist.excloadOrderNo;
    assertNearDate(
      initialPersist.lastCourierDownloadAt,
      initialFetchedAt,
      'initial lastCourierDownloadAt',
    );
    assertNearDate(
      initialPersist.expiresAt,
      new Date(initialFetchedAt.getTime() + ORDER_SYNC_SNAPSHOT_TTL_MS),
      'initial expiresAt (+14d)',
    );
    ok('production initial persist set lastCourierDownloadAt + expiresAt (+14d)');

    // Preparation only: stale TTL clocks on THIS fixture order (not the verification result).
    const staleDownloadAt = new Date('2026-06-01T00:00:00.000Z');
    const staleExpiresAt = new Date('2026-06-15T00:00:00.000Z');
    await prisma.orderSyncOrder.update({
      where: { id: orderId },
      data: {
        lastCourierDownloadAt: staleDownloadAt,
        expiresAt: staleExpiresAt,
      },
    });

    const redownloadAt = new Date('2026-07-10T12:00:00.000Z');
    const redownloadSnapshot = buildVirtualSnapshot({
      userId: fixtureUserId,
      integrationAccountId: account.id,
      fetchedAtIso: redownloadAt.toISOString(),
      mallOrderNo,
      mallLineItemId,
      excloadOrderNoHint: excloadOrderNo,
      receiverName: '가상수신자을',
      receiverPhone: '010-7002-9002',
      receiverAddress: '부산광역시 검증동 샘플길 9',
      productSummary: '[검증] ttlpii-product',
    });
    const redownloadPersist = runPersistOrderSyncBatch({
      tmpDir: sessionTempDir,
      childEnv,
      userId: fixtureUserId,
      integrationAccountId: account.id,
      fetchedAtIso: redownloadAt.toISOString(),
      memo: `ttlpii-redownload-${MARK}`,
      snapshot: redownloadSnapshot,
    });
    if (redownloadPersist.orderId !== orderId) fail('re-download upserted a different order id');
    assertNearDate(
      redownloadPersist.lastCourierDownloadAt,
      redownloadAt,
      're-download lastCourierDownloadAt',
    );
    assertNearDate(
      redownloadPersist.expiresAt,
      new Date(redownloadAt.getTime() + ORDER_SYNC_SNAPSHOT_TTL_MS),
      're-download expiresAt (+14d from production fetchedAt)',
    );
    const afterRedownload = await prisma.orderSyncOrder.findUnique({ where: { id: orderId } });
    if (!afterRedownload) fail('order missing after re-download');
    assertNearDate(afterRedownload.lastCourierDownloadAt, redownloadAt, 'DB lastCourierDownloadAt');
    assertNearDate(
      afterRedownload.expiresAt,
      new Date(redownloadAt.getTime() + ORDER_SYNC_SNAPSHOT_TTL_MS),
      'DB expiresAt',
    );
    ok('production re-download extended TTL via persistOrderSyncBatch');

    console.log('\n--- match + production clearTransmittedOrderPiiIfComplete ---');
    const uploadBatch = await prisma.shipmentUploadBatch.create({
      data: {
        userId: fixtureUserId,
        provider: 'SMARTSTORE',
        integrationAccountId: account.id,
        originalFileName: `ttlpii-${MARK}.xlsx`,
        fileSize: 10,
        rowCount: 1,
        status: 'UPLOADED',
      },
    });
    const uploadRow = await prisma.shipmentUploadRow.create({
      data: {
        uploadBatchId: uploadBatch.id,
        userId: fixtureUserId,
        originalRowIndex: 0,
        rawRowJson: { receiverName: afterRedownload.receiverName || '가상수신자을' },
        trackingNumber: `TRK${MARK}`,
        trackingNumberNormalized: `trk${MARK}`,
        receiverName: afterRedownload.receiverName || '가상수신자을',
        receiverPhone: afterRedownload.receiverPhone || '010-7002-9002',
        receiverPhoneNormalized: '01070029002',
        receiverAddress: afterRedownload.receiverAddress || '부산광역시 검증동 샘플길 9',
        excloadOrderNo,
        mallOrderNo,
        productText: '[검증] ttlpii-product',
      },
    });
    const match = await prisma.shipmentMatch.create({
      data: {
        uploadBatchId: uploadBatch.id,
        uploadRowId: uploadRow.id,
        userId: fixtureUserId,
        orderSyncOrderId: orderId,
        provider: 'SMARTSTORE',
        integrationAccountId: account.id,
        algorithmMatchStatus: 'MATCHED_CONFIDENT',
        userConfirmationStatus: 'CONFIRMED',
        transmissionStatus: 'SENT',
        matchScore: 100,
        candidateOrdersJson: [{ excloadOrderNo, receiverName: afterRedownload.receiverName }],
        finalTrackingNumber: `TRK${MARK}`,
        confirmedAt: new Date(),
      },
    });
    ok('fixture shipment match linked (SENT)');

    const clearMod = importHref(
      path.join(PROJECT_ROOT, 'app/lib/order-integration/snapshots/clear-transmitted-order-pii.ts'),
    );
    const clearNowIso = '2026-07-21T01:00:00.000Z';
    const clearRunner = writeSessionRunner(
      sessionTempDir,
      'clear-runner.mts',
      `
import { PrismaClient } from '@prisma/client';
import { clearTransmittedOrderPiiIfComplete } from ${JSON.stringify(clearMod)};

const prisma = new PrismaClient();
try {
  const result = await clearTransmittedOrderPiiIfComplete(prisma, {
    userId: ${JSON.stringify(fixtureUserId)},
    orderSyncOrderId: ${JSON.stringify(orderId)},
    now: new Date(${JSON.stringify(clearNowIso)}),
  });
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
`,
    );
    const clearOut = run('npx', ['tsx', '--tsconfig', 'tsconfig.json', clearRunner], childEnv);
    const clearLine = clearOut
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.startsWith('{') && l.includes('clearedOrder'));
    if (!clearLine) fail('clear runner produced no result JSON');
    const clearResult = JSON.parse(clearLine);
    if (clearResult.skippedIncomplete) fail('clear skippedIncomplete unexpectedly');
    if (!clearResult.clearedOrder) fail('clear did not clear order');
    ok(
      `production clear: order=${clearResult.clearedOrder} match=${clearResult.clearedMatches} row=${clearResult.clearedUploadRows}`,
    );

    const clearedOrder = await prisma.orderSyncOrder.findUnique({ where: { id: orderId } });
    const clearedMatch = await prisma.shipmentMatch.findUnique({ where: { id: match.id } });
    const clearedRow = await prisma.shipmentUploadRow.findUnique({ where: { id: uploadRow.id } });
    if (!clearedOrder?.piiClearedAt) fail('piiClearedAt not set');
    if (clearedOrder.receiverName || clearedOrder.receiverPhone || clearedOrder.receiverAddress) {
      fail('order PII still present after clear');
    }
    if (clearedMatch?.candidateOrdersJson != null) fail('match candidate JSON not cleared');
    if (clearedRow?.receiverName || clearedRow?.receiverPhone || clearedRow?.rawRowJson) {
      fail('uploadRow PII still present after clear');
    }
    ok('transmit-complete PII clear verified via production function');

    console.log('\n--- production re-download must not restore cleared PII ---');
    // Preparation only: stale clocks. Do NOT re-inject PII via direct update.
    await prisma.orderSyncOrder.update({
      where: { id: orderId },
      data: {
        lastCourierDownloadAt: staleDownloadAt,
        expiresAt: staleExpiresAt,
      },
    });
    const lockedRedownloadAt = new Date('2026-07-21T03:00:00.000Z');
    const lockedSnapshot = buildVirtualSnapshot({
      userId: fixtureUserId,
      integrationAccountId: account.id,
      fetchedAtIso: lockedRedownloadAt.toISOString(),
      mallOrderNo,
      mallLineItemId,
      excloadOrderNoHint: excloadOrderNo,
      // Snapshot carries PII as a download would; production lockPii must ignore these fields.
      receiverName: '가상복원시도',
      receiverPhone: '010-7999-9999',
      receiverAddress: '인천광역시 복원금지구 테스트로 1',
      productSummary: '[검증] should-not-restore',
    });
    const lockedPersist = runPersistOrderSyncBatch({
      tmpDir: sessionTempDir,
      childEnv,
      userId: fixtureUserId,
      integrationAccountId: account.id,
      fetchedAtIso: lockedRedownloadAt.toISOString(),
      memo: `ttlpii-locked-redownload-${MARK}`,
      snapshot: lockedSnapshot,
    });
    if (lockedPersist.orderId !== orderId) fail('locked re-download targeted wrong order');
    assertNearDate(
      lockedPersist.lastCourierDownloadAt,
      lockedRedownloadAt,
      'locked re-download lastCourierDownloadAt',
    );
    assertNearDate(
      lockedPersist.expiresAt,
      new Date(lockedRedownloadAt.getTime() + ORDER_SYNC_SNAPSHOT_TTL_MS),
      'locked re-download expiresAt (+14d)',
    );
    const afterLocked = await prisma.orderSyncOrder.findUnique({ where: { id: orderId } });
    if (!afterLocked?.piiClearedAt) fail('piiClearedAt cleared unexpectedly after locked re-download');
    if (afterLocked.receiverName || afterLocked.receiverPhone || afterLocked.receiverAddress) {
      fail('cleared PII was restored by re-download persist');
    }
    if (afterLocked.productSummary) fail('productSummary restored by locked re-download');
    ok('production lockPii: TTL extended, receiver/product PII not restored');

    console.log('\n--- expired fixture + production purgeOrderSyncSnapshots ---');
    const expiredAt = new Date('2026-06-01T00:00:00.000Z');
    const expBatch = await prisma.orderSyncBatch.create({
      data: {
        userId: fixtureUserId,
        provider: 'SMARTSTORE',
        integrationAccountId: account.id,
        sourceType: 'API',
        fetchedAt: expiredAt,
        orderCount: 1,
        status: 'ACTIVE',
        memo: `ttlpii-expired-${MARK}`,
      },
    });
    const expOrder = await prisma.orderSyncOrder.create({
      data: {
        batchId: expBatch.id,
        userId: fixtureUserId,
        provider: 'SMARTSTORE',
        integrationAccountId: account.id,
        excloadOrderNo: `EXC-EXP-${MARK}`,
        mallOrderNo: `VIRT-EXP-${MARK}`,
        receiverName: '가상만료수신',
        receiverPhone: '010-7003-9003',
        receiverAddress: '대전광역시 만료구 테스트로 1',
        productSummary: '[검증] expired-product',
        quantity: 1,
        normalizedPayloadJson: {},
        lastCourierDownloadAt: expiredAt,
        expiresAt: expiredAt,
        transmissionStatus: 'NONE',
      },
    });
    const expUploadBatch = await prisma.shipmentUploadBatch.create({
      data: {
        userId: fixtureUserId,
        provider: 'SMARTSTORE',
        integrationAccountId: account.id,
        originalFileName: `ttlpii-exp-${MARK}.xlsx`,
        fileSize: 10,
        rowCount: 1,
        status: 'UPLOADED',
      },
    });
    const expRow = await prisma.shipmentUploadRow.create({
      data: {
        uploadBatchId: expUploadBatch.id,
        userId: fixtureUserId,
        originalRowIndex: 0,
        rawRowJson: { receiverName: '가상만료수신' },
        trackingNumber: `EXPTRK${MARK}`,
        trackingNumberNormalized: `exptrk${MARK}`,
        receiverName: '가상만료수신',
        receiverPhone: '010-7003-9003',
        receiverPhoneNormalized: '01070039003',
        receiverAddress: '대전광역시 만료구 테스트로 1',
        productText: '[검증] expired-product',
      },
    });
    const expMatch = await prisma.shipmentMatch.create({
      data: {
        uploadBatchId: expUploadBatch.id,
        uploadRowId: expRow.id,
        userId: fixtureUserId,
        orderSyncOrderId: expOrder.id,
        provider: 'SMARTSTORE',
        algorithmMatchStatus: 'MATCHED_WARNING',
        userConfirmationStatus: 'UNCONFIRMED',
        transmissionStatus: 'NONE',
        matchScore: 50,
        candidateOrdersJson: [{ receiverName: '가상만료수신', phone: '010-7003-9003' }],
      },
    });

    const purgeMod = importHref(
      path.join(PROJECT_ROOT, 'app/lib/order-integration/snapshots/purge-order-sync-snapshots.ts'),
    );
    const purgeRunner = writeSessionRunner(
      sessionTempDir,
      'purge-runner.mts',
      `
import { purgeOrderSyncSnapshots } from ${JSON.stringify(purgeMod)};
const now = new Date('2026-07-21T02:00:00.000Z');
const result = await purgeOrderSyncSnapshots({ now });
console.log(JSON.stringify({
  deletedExpiredOrders: result.deletedExpiredOrders,
  scrubbedExpiredMatches: result.scrubbedExpiredMatches,
  scrubbedExpiredUploadRows: result.scrubbedExpiredUploadRows,
}));
`,
    );
    const purgeOut = run('npx', ['tsx', '--tsconfig', 'tsconfig.json', purgeRunner], childEnv);
    const purgeLine = purgeOut
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.startsWith('{') && l.includes('deletedExpiredOrders'));
    if (!purgeLine) fail('purge runner produced no result JSON');
    const purgeResult = JSON.parse(purgeLine);
    if (purgeResult.deletedExpiredOrders < 1) fail('purge deletedExpiredOrders < 1');
    if (purgeResult.scrubbedExpiredMatches < 1) fail('purge scrubbedExpiredMatches < 1');
    if (purgeResult.scrubbedExpiredUploadRows < 1) fail('purge scrubbedExpiredUploadRows < 1');
    ok(
      `production purge deleted=${purgeResult.deletedExpiredOrders} scrubMatch=${purgeResult.scrubbedExpiredMatches} scrubRow=${purgeResult.scrubbedExpiredUploadRows}`,
    );

    const gone = await prisma.orderSyncOrder.findUnique({ where: { id: expOrder.id } });
    if (gone) fail('OrderSyncOrder still exists after purge');
    const afterMatch = await prisma.shipmentMatch.findUnique({ where: { id: expMatch.id } });
    const afterRow = await prisma.shipmentUploadRow.findUnique({ where: { id: expRow.id } });
    if (afterMatch?.candidateOrdersJson != null) fail('expired match PII remained');
    if (afterMatch && afterMatch.orderSyncOrderId != null) fail('orderSyncOrderId not SetNull');
    if (afterRow?.receiverName || afterRow?.receiverPhone || afterRow?.rawRowJson) {
      fail('expired uploadRow PII remained');
    }
    // Active (non-expired) fixture order must remain after purge
    const kept = await prisma.orderSyncOrder.findUnique({ where: { id: orderId } });
    if (!kept) fail('non-expired fixture order was deleted by purge');
    ok('purge scrubbed Match/UploadRow PII, hard-deleted expired order, kept active fixture');

    console.log('\n--- cron route GET status (handler in-process, no localhost HTTP) ---');
    const cronMod = importHref(
      path.join(PROJECT_ROOT, 'app/api/cron/purge-order-sync-snapshots/route.ts'),
    );
    const cronRunner = writeSessionRunner(
      sessionTempDir,
      'cron-runner.mts',
      `
import { NextRequest } from 'next/server';
import { GET } from ${JSON.stringify(cronMod)};

async function statusOf(auth) {
  const headers = auth ? { authorization: auth } : undefined;
  const req = new NextRequest('http://cron.local/api/cron/purge-order-sync-snapshots', { headers });
  const res = await GET(req);
  return res.status;
}

const missing = await statusOf(undefined);
const wrong = await statusOf('Bearer wrong-secret');
const secret = process.env.CRON_SECRET ?? '';
const okStatus = await statusOf('Bearer ' + secret);
console.log(JSON.stringify({ missing, wrong, okStatus }));
`,
    );
    const cronOut = run('npx', ['tsx', '--tsconfig', 'tsconfig.json', cronRunner], childEnv);
    const cronLine = cronOut
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.startsWith('{') && l.includes('missing'));
    if (!cronLine) fail('cron runner produced no result JSON');
    const statuses = JSON.parse(cronLine);
    if (statuses.missing !== 401) fail(`missing auth status=${statuses.missing}`);
    if (statuses.wrong !== 401) fail(`wrong auth status=${statuses.wrong}`);
    if (statuses.okStatus !== 200) fail(`correct auth status=${statuses.okStatus}`);
    ok('cron GET: missing=401 wrong=401 correct=200');

    console.log('\n--- cleanup fixture user (exact id) ---');
    await prisma.user.delete({ where: { id: fixtureUserId } });
    fixtureUserId = null;
    ok('fixture user cascaded cleanup');
  } catch (err) {
    flowError = err instanceof Error ? err : new Error(String(err));
    console.error('FAIL:', flowError.message);
  } finally {
    if (fixtureUserId) {
      try {
        await prisma.user.delete({ where: { id: fixtureUserId } });
        console.log('cleanup after error: fixture user deleted');
      } catch {
        console.error('cleanup after error failed');
      }
    }
    await prisma.$disconnect().catch(() => {});
    safeRmSessionTempDir(sessionTempDir);
  }

  if (flowError) {
    process.exit(1);
  }
}

// --- entry: preflight BEFORE migrate / Prisma / temp files / children ---
const smokeEnv = loadSmokeEnv();
const childEnv = buildChildEnv(smokeEnv);

console.log('\n--- migrate deploy ---');
const migrateLog = run('npx', ['prisma', 'migrate', 'deploy'], childEnv);
for (const line of migrateLog
  .split(/\r?\n/)
  .filter((l) => /20260721040000|Applied|pending|All migrations|No pending/i.test(l))) {
  console.log(line);
}
ok('migrate deploy');

console.log('\n--- prisma generate ---');
{
  const r = spawnSync('npx', ['prisma', 'generate'], {
    cwd: PROJECT_ROOT,
    env: childEnv,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
  });
  const out = scrubLog(`${r.stdout || ''}\n${r.stderr || ''}`);
  if (r.status === 0) {
    ok('prisma generate');
  } else if (/EPERM/i.test(out)) {
    console.log('WARN: prisma generate EPERM (likely locked by npm run dev) — continue with existing Client');
  } else {
    console.error(out.slice(-2500));
    fail(`npx prisma generate exit=${r.status}`);
  }
}

await runFlow(smokeEnv, childEnv);

console.log('\n--- flags ---');
console.log('ALLOW_TEST_DB_MUTATION: required explicit true (no script force-inject)');
console.log('ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED: not force-injected by this script');
ok('no Vercel/Production env file changes');

console.log('\nTEST DB VERIFY: PASS');
