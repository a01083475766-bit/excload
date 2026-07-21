/**
 * TEST(.env.smoke.local) 전용:
 * 1) 송장 UploadRow/Match 독립 14일 PII scrub + 실제 DB NULL
 * 2) Bundle 선택 → downloadBundleId 저장
 * 3) Bundle 저장 실패 시 다운로드 게이트(코드 순서)
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/verify-shipment-upload-pii-and-bundle-smoke.ts
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { Prisma } from '@prisma/client';

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
import { scrubExpiredShipmentUploadPii } from '../app/lib/order-integration/snapshots/scrub-expired-shipment-upload-pii';
import { persistCourierDownloadBundle } from '../app/lib/order-integration/courier-download/persist-courier-download-bundle';

const require = createRequire(import.meta.url);
const MARK = `pii-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function fail(msg: string): never {
  console.error('FAIL:', msg);
  process.exit(1);
}
function ok(msg: string) {
  console.log('OK:', msg);
}
function record(name: string, pass: boolean, detail = '') {
  results.push({ name, pass, detail });
  if (pass) ok(`${name}${detail ? ` — ${detail}` : ''}`);
  else console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
}
function maskHost(host: string) {
  return String(host).replace(/([a-z0-9]{4})[a-z0-9]{8,}([a-z0-9]{4})/gi, '$1…$2');
}
function scrubLog(text: string) {
  return String(text ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_URL]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function resolveAllowTestDbMutation(smoke: Record<string, string>): string {
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

function loadSmokeEnv(): Record<string, string> {
  const abs = path.resolve(process.cwd(), SMOKE_ENV_FILE);
  if (!fs.existsSync(abs)) fail(`${SMOKE_ENV_FILE} missing`);
  const smoke = parseEnvFileContent(fs.readFileSync(abs, 'utf8')) as Record<string, string>;
  const allowMutation = resolveAllowTestDbMutation(smoke);
  if (allowMutation !== 'true') {
    fail(
      'TEST DB mutation requires explicit ALLOW_TEST_DB_MUTATION=true in .env.smoke.local or process env (refusing without it)',
    );
  }
  const env: Record<string, string> = {
    ...smoke,
    ALLOW_TEST_DB_MUTATION: allowMutation,
    EXCLOAD_ENV_PROFILE: smoke.EXCLOAD_ENV_PROFILE || SMOKE_ENV_PROFILE,
    TEST_DB_ENV_FILE: smoke.TEST_DB_ENV_FILE || SMOKE_ENV_FILE,
  };
  const preflight = evaluateTestDbMutationPreflight({
    env,
    envFileName: SMOKE_ENV_FILE,
    envFileExists: true,
    prodRef: EXCLOAD_PROD_SUPABASE_REF,
    testRef: EXCLOAD_TEST_SUPABASE_REF,
  });
  if (!preflight.ok) fail(`preflight blocked: ${preflight.failedNames.join(', ')}`);
  const refs = classifyRefsInText(
    `${env.DATABASE_URL}\n${env.DIRECT_URL}`,
    EXCLOAD_PROD_SUPABASE_REF,
    EXCLOAD_TEST_SUPABASE_REF,
  );
  if (refs.hasProd || !refs.hasTest) fail('DATABASE_URL class unclear or Production — abort');
  if (!looksLikePostgresUrl(env.DATABASE_URL)) fail('DATABASE_URL invalid');
  const u = new URL(env.DATABASE_URL);
  console.log('--- target (smoke/TEST only) ---');
  console.log('class: TEST');
  console.log('host:', maskHost(u.hostname));
  console.log('marker:', MARK);
  return env;
}

function buildChildEnv(smokeEnv: Record<string, string>) {
  const child: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v == null) continue;
    if (
      /^(DATABASE_URL|DIRECT_URL|PRISMA_DATABASE_URL|POSTGRES_URL|SHADOW_DATABASE_URL|ALLOW_TEST_DB_MUTATION|CRON_SECRET)$/i.test(
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

function run(cmd: string, args: string[], env: Record<string, string>) {
  const r = spawnSync(cmd, args, {
    cwd: process.cwd(),
    env: env as NodeJS.ProcessEnv,
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

async function isSqlNull(
  prisma: { $queryRawUnsafe: (q: string, ...a: unknown[]) => Promise<unknown> },
  table: string,
  column: string,
  id: string,
): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ("${column}" IS NULL) AS is_null FROM "${table}" WHERE id = $1`,
    id,
  )) as Array<{ is_null: boolean }>;
  return Boolean(rows[0]?.is_null);
}

async function main() {
  console.log('=== shipment upload PII + bundle smoke (TEST only) ===\n');

  const def = parseEnvFileContent(fs.readFileSync(path.resolve('.env'), 'utf8'));
  const defRefs = classifyRefsInText(
    `${def.DATABASE_URL || ''}\n${def.DIRECT_URL || ''}`,
    EXCLOAD_PROD_SUPABASE_REF,
    EXCLOAD_TEST_SUPABASE_REF,
  );
  console.log(
    'default .env class:',
    defRefs.hasProd ? 'PRODUCTION' : defRefs.hasTest ? 'TEST' : 'UNCLEAR',
    '(not used)\n',
  );

  const smokeEnv = loadSmokeEnv();
  const childEnv = buildChildEnv(smokeEnv);
  run('npx', ['prisma', 'generate'], childEnv);
  run('npx', ['prisma', 'migrate', 'deploy'], childEnv);
  record('TEST migrate deploy', true);

  for (const [k, v] of Object.entries(smokeEnv)) process.env[k] = v;
  const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
  const prisma = new PrismaClient();
  const userIds: string[] = [];

  try {
    const user = await prisma.user.create({
      data: { email: `${MARK}@pii.test.invalid`, name: `pii-${MARK}` },
    });
    userIds.push(user.id);

    const old = new Date('2026-06-01T00:00:00.000Z');
    const recent = new Date('2026-07-20T00:00:00.000Z');
    const now = new Date('2026-07-21T12:00:00.000Z');

    const batch = await prisma.shipmentUploadBatch.create({
      data: {
        userId: user.id,
        originalFileName: `pii-${MARK}.xlsx`,
        fileSize: 1,
        rowCount: 4,
        status: 'UPLOADED',
      },
    });

    // linked expired
    const order = await prisma.orderSyncOrder.create({
      data: {
        userId: user.id,
        provider: 'COUPANG',
        excloadOrderNo: `EXC-PII-${MARK}`,
        mallOrderNo: `M-${MARK}`,
        batchId: (
          await prisma.orderSyncBatch.create({
            data: {
              userId: user.id,
              provider: 'COUPANG',
              sourceType: 'API',
              fetchedAt: old,
              orderCount: 1,
              status: 'ACTIVE',
            },
          })
        ).id,
        receiverName: '연계수신',
        transmissionStatus: 'NONE',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const rowLinked = await prisma.shipmentUploadRow.create({
      data: {
        uploadBatchId: batch.id,
        userId: user.id,
        originalRowIndex: 0,
        rawRowJson: { phone: '010-1111-2222', addr: '서울특별시' },
        trackingNumber: 'TN-L',
        trackingNumberNormalized: 'TNL',
        receiverName: '연계',
        receiverPhone: '01011112222',
        createdAt: old,
      },
    });
    const matchLinked = await prisma.shipmentMatch.create({
      data: {
        uploadBatchId: batch.id,
        uploadRowId: rowLinked.id,
        userId: user.id,
        orderSyncOrderId: order.id,
        algorithmMatchStatus: 'MATCHED_CONFIDENT',
        candidateOrdersJson: [{ orderId: order.id }],
        mismatchFieldsJson: ['receiverName'],
        createdAt: old,
      },
    });

    // unlinked expired row
    const rowOrphan = await prisma.shipmentUploadRow.create({
      data: {
        uploadBatchId: batch.id,
        userId: user.id,
        originalRowIndex: 1,
        rawRowJson: { x: 1 },
        trackingNumber: 'TN-O',
        trackingNumberNormalized: 'TNO',
        receiverName: '미연결',
        createdAt: old,
      },
    });

    // unmatched expired match (orderSyncOrderId null)
    const rowForMatch = await prisma.shipmentUploadRow.create({
      data: {
        uploadBatchId: batch.id,
        userId: user.id,
        originalRowIndex: 2,
        rawRowJson: { y: 2 },
        trackingNumber: 'TN-M',
        trackingNumberNormalized: 'TNM',
        createdAt: old,
      },
    });
    const matchOrphan = await prisma.shipmentMatch.create({
      data: {
        uploadBatchId: batch.id,
        uploadRowId: rowForMatch.id,
        userId: user.id,
        orderSyncOrderId: null,
        algorithmMatchStatus: 'NOT_MATCHED',
        candidateOrdersJson: [{ orderId: 'x' }],
        mismatchFieldsJson: Prisma.DbNull,
        createdAt: old,
      },
    });

    // recent — must keep
    const rowRecent = await prisma.shipmentUploadRow.create({
      data: {
        uploadBatchId: batch.id,
        userId: user.id,
        originalRowIndex: 3,
        rawRowJson: { keep: true },
        trackingNumber: 'TN-R',
        trackingNumberNormalized: 'TNR',
        receiverName: '최근',
        createdAt: recent,
      },
    });

    const scrub1 = await scrubExpiredShipmentUploadPii(prisma, { now });
    record(
      '독립 scrub 실행',
      scrub1.batchFailures === 0 && scrub1.scrubbedUploadRows >= 3 && scrub1.scrubbedMatches >= 2,
      JSON.stringify(scrub1),
    );

    record(
      'DB NULL: linked rawRowJson',
      await isSqlNull(prisma, 'ShipmentUploadRow', 'rawRowJson', rowLinked.id),
    );
    record(
      'DB NULL: linked candidateOrdersJson',
      await isSqlNull(prisma, 'ShipmentMatch', 'candidateOrdersJson', matchLinked.id),
    );
    record(
      'DB NULL: linked mismatchFieldsJson',
      await isSqlNull(prisma, 'ShipmentMatch', 'mismatchFieldsJson', matchLinked.id),
    );
    record(
      'DB NULL: orphan UploadRow rawRowJson',
      await isSqlNull(prisma, 'ShipmentUploadRow', 'rawRowJson', rowOrphan.id),
    );
    record(
      'DB NULL: orphan Match candidateOrdersJson',
      await isSqlNull(prisma, 'ShipmentMatch', 'candidateOrdersJson', matchOrphan.id),
    );

    const recentAfter = await prisma.shipmentUploadRow.findUnique({ where: { id: rowRecent.id } });
    record(
      '14일 미만 유지',
      recentAfter?.receiverName === '최근' && recentAfter.rawRowJson != null,
    );

    // partial mismatch only — recreate cleared match with only mismatch
    await prisma.shipmentMatch.update({
      where: { id: matchOrphan.id },
      data: {
        candidateOrdersJson: Prisma.DbNull,
        mismatchFieldsJson: ['a'],
        createdAt: old,
      },
    });
    // force createdAt (updatedAt may bump)
    await prisma.$executeRawUnsafe(
      `UPDATE "ShipmentMatch" SET "createdAt" = $1, "mismatchFieldsJson" = $2::jsonb WHERE id = $3`,
      old,
      JSON.stringify(['a']),
      matchOrphan.id,
    );
    const scrubPartial = await scrubExpiredShipmentUploadPii(prisma, { now });
    record(
      'mismatch만 남은 Match 정리',
      scrubPartial.scrubbedMatches >= 1 &&
        (await isSqlNull(prisma, 'ShipmentMatch', 'mismatchFieldsJson', matchOrphan.id)),
    );

    const scrub2 = await scrubExpiredShipmentUploadPii(prisma, { now });
    record(
      '재실행 idempotent',
      scrub2.batchFailures === 0 && scrub2.scrubbedUploadRows === 0 && scrub2.scrubbedMatches === 0,
      JSON.stringify(scrub2),
    );

    // rows themselves remain
    const rowStill = await prisma.shipmentUploadRow.findUnique({ where: { id: rowOrphan.id } });
    const matchStill = await prisma.shipmentMatch.findUnique({ where: { id: matchLinked.id } });
    record('행/매칭 메타 유지', Boolean(rowStill && matchStill && matchStill.matchScore !== undefined));

    console.log('\n--- Bundle selection → downloadBundleId ---');
    const b1 = await persistCourierDownloadBundle(prisma, {
      userId: user.id,
      courierTemplateLabel: `b1-${MARK}`,
      items: [{ inputSource: 'EXCEL', mallOrderNo: '1', sourceMallKey: 'M' }],
    });
    const b2 = await persistCourierDownloadBundle(prisma, {
      userId: user.id,
      courierTemplateLabel: `b2-${MARK}`,
      items: [{ inputSource: 'TEXT', mallOrderNo: '2', sourceMallKey: 'M' }],
    });

    // simulate UI: 1 bundle auto-select
    const listOne = [b1];
    const autoSelected = listOne.length === 1 ? listOne[0]!.bundleId : '';
    record('Bundle 1개 자동 선택(로직)', autoSelected === b1.bundleId);

    const batchAuto = await prisma.shipmentUploadBatch.create({
      data: {
        userId: user.id,
        downloadBundleId: autoSelected,
        originalFileName: `auto-${MARK}.xlsx`,
        fileSize: 1,
        rowCount: 0,
        status: 'UPLOADED',
      },
    });
    record('자동선택 → downloadBundleId', batchAuto.downloadBundleId === b1.bundleId);

    const batchChanged = await prisma.shipmentUploadBatch.create({
      data: {
        userId: user.id,
        downloadBundleId: b2.bundleId,
        originalFileName: `chg-${MARK}.xlsx`,
        fileSize: 1,
        rowCount: 0,
        status: 'UPLOADED',
      },
    });
    record('다른 Bundle 변경 → downloadBundleId', batchChanged.downloadBundleId === b2.bundleId);

    const batchNone = await prisma.shipmentUploadBatch.create({
      data: {
        userId: user.id,
        downloadBundleId: null,
        originalFileName: `none-${MARK}.xlsx`,
        fileSize: 1,
        rowCount: 0,
        status: 'UPLOADED',
      },
    });
    record('해당 다운로드 없음 → null', batchNone.downloadBundleId == null);

    console.log('\n--- Hub download gate (code) ---');
    const hub = fs.readFileSync(
      path.resolve('app/components/order-integration/OrderIntegrationHub.tsx'),
      'utf8',
    );
    const failIdx = hub.indexOf('다운로드 기록 저장에 실패하여 다운로드를 중단');
    const blobIdx = hub.indexOf('URL.createObjectURL');
    const successPath =
      hub.indexOf('courier-download-bundles') > 0 &&
      failIdx > 0 &&
      blobIdx > failIdx &&
      hub.indexOf('anchor.download = fileName') > blobIdx;
    record('Bundle 실패 시 createObjectURL 이전 throw', successPath);

    // success path: bundle exists with work items then download would proceed
    const workCount = await prisma.courierDownloadWorkItem.count({
      where: { downloadBundleId: b1.bundleId },
    });
    record('정상 Bundle+WorkItem 생성 후 다운로드 가능 상태', workCount === 1);
  } catch (e) {
    console.error('FAIL: exception', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    try {
      if (userIds.length) {
        await prisma.shipmentMatch.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.shipmentUploadRow.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.shipmentUploadBatch.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.courierDownloadWorkItem.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.courierDownloadBundle.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.orderSyncOrder.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.orderSyncBatch.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        ok('cleanup');
      }
    } catch (e) {
      console.error('cleanup warning', e instanceof Error ? e.message : e);
    }
    await prisma.$disconnect();
  }

  console.log('\n=== summary ===');
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
  }
  console.log(`total=${results.length} fail=${failed.length}`);
  if (failed.length || process.exitCode) process.exit(1);
  ok('done');
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
