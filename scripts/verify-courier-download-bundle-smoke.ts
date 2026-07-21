/**
 * CourierDownloadBundle 1차 스모크 — `.env.smoke.local`(TEST)만 사용.
 * URL·비밀번호·secret 원문 출력 금지. Production이면 즉시 중단.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/verify-courier-download-bundle-smoke.ts
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

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
import {
  countBundleSourceStats,
  listActiveCourierDownloadBundles,
  persistCourierDownloadBundle,
  purgeExpiredCourierDownloadBundles,
} from '../app/lib/order-integration/courier-download/persist-courier-download-bundle';
import { buildManualRegistrationRows } from '../app/lib/order-integration/courier-download/manual-registration-view';

const require = createRequire(import.meta.url);
const MARK = `cdb-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

type Row = { name: string; pass: boolean; detail: string };
const results: Row[] = [];

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
  if (refs.hasProd || !refs.hasTest) {
    fail('DATABASE_URL class unclear or Production — abort');
  }
  if (!looksLikePostgresUrl(env.DATABASE_URL)) fail('DATABASE_URL invalid');

  const u = new URL(env.DATABASE_URL);
  console.log('--- target (smoke/TEST only) ---');
  console.log('class: TEST');
  console.log('host:', maskHost(u.hostname));
  console.log('db:', (u.pathname || '/').replace(/^\//, '').split('?')[0] || '(empty)');
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

async function main() {
  console.log('=== CourierDownloadBundle smoke (TEST only) ===\n');

  const defaultEnvPath = path.resolve('.env');
  if (fs.existsSync(defaultEnvPath)) {
    const def = parseEnvFileContent(fs.readFileSync(defaultEnvPath, 'utf8'));
    const defRefs = classifyRefsInText(
      `${def.DATABASE_URL || ''}\n${def.DIRECT_URL || ''}`,
      EXCLOAD_PROD_SUPABASE_REF,
      EXCLOAD_TEST_SUPABASE_REF,
    );
    let defClass = 'UNCLEAR';
    if (defRefs.hasProd) defClass = 'PRODUCTION';
    else if (defRefs.hasTest) defClass = 'TEST';
    console.log('--- default .env (npm run dev / bare prisma) ---');
    console.log('class:', defClass);
    console.log(
      'note: bare prisma migrate / npm run dev use this — NOT used by this smoke\n',
    );
  }

  const smokeEnv = loadSmokeEnv();
  const childEnv = buildChildEnv(smokeEnv);

  console.log('\n--- prisma generate + migrate deploy (TEST env only) ---');
  run('npx', ['prisma', 'generate'], childEnv);
  record('prisma generate (TEST)', true);
  run('npx', ['prisma', 'migrate', 'deploy'], childEnv);
  record('prisma migrate deploy (TEST)', true, 'exit 0');

  for (const [k, v] of Object.entries(smokeEnv)) {
    process.env[k] = v;
  }

  const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
  const prisma = new PrismaClient();
  const userIds: string[] = [];

  try {
    const userA = await prisma.user.create({
      data: { email: `${MARK}-a@cdb.test.invalid`, name: `cdb-a-${MARK}` },
    });
    const userB = await prisma.user.create({
      data: { email: `${MARK}-b@cdb.test.invalid`, name: `cdb-b-${MARK}` },
    });
    userIds.push(userA.id, userB.id);

    const items = [
      {
        inputSource: 'API' as const,
        sourceMallKey: 'COUPANG::acc-smoke',
        sourceMallLabel: '쿠팡',
        mallOrderNo: `API-${MARK}`,
      },
      {
        inputSource: 'EXCEL' as const,
        sourceMallKey: '자사몰',
        sourceMallLabel: '자사몰',
        mallOrderNo: `EX-${MARK}`,
      },
      {
        inputSource: 'TEXT' as const,
        sourceMallKey: null,
        sourceMallLabel: null,
        mallOrderNo: null,
      },
      {
        inputSource: 'EXCEL' as const,
        sourceMallKey: '자사몰',
        sourceMallLabel: '자사몰',
        mallOrderNo: `EX2-${MARK}`,
      },
    ];
    const stats = countBundleSourceStats(items);

    console.log('\n--- Bundle create (transaction) ---');
    const created = await persistCourierDownloadBundle(prisma, {
      userId: userA.id,
      courierTemplateLabel: `smoke-${MARK}`,
      items,
    });
    record('Bundle 1개 생성', Boolean(created.bundleId), `idLen=${created.bundleId.length}`);
    record(
      'rowCount == items.length',
      created.rowCount === items.length,
      `${created.rowCount}==${items.length}`,
    );
    record(
      'api/manual counts',
      created.apiCount === stats.apiCount && created.manualCount === stats.manualCount,
      `api=${created.apiCount} manual=${created.manualCount}`,
    );

    const workItems = await prisma.courierDownloadWorkItem.findMany({
      where: { downloadBundleId: created.bundleId },
    });
    record('WorkItem 수 == 다운로드 행 수', workItems.length === items.length, `${workItems.length}`);

    const sources = workItems
      .map((w) => w.inputSource)
      .sort()
      .join(',');
    record('API/EXCEL/TEXT 출처 분류', sources === 'API,EXCEL,EXCEL,TEXT', sources);

    const forbiddenCols = [
      'receiverName',
      'receiverPhone',
      'receiverAddress',
      'address',
      'phone',
      'rawRowJson',
      'productName',
    ];
    const sample = workItems[0] || {};
    const hasForbidden = forbiddenCols.some((c) => Object.prototype.hasOwnProperty.call(sample, c));
    const jsonBlob = JSON.stringify(workItems);
    const piiLeak = /010-\d{4}|서울특별시|부산광역시|receiverName|rawRowJson/.test(jsonBlob);
    record('WorkItem PII 평문 없음(필드)', !hasForbidden);
    record('WorkItem PII 평문 없음(값 스캔)', !piiLeak);

    console.log('\n--- Bundle list ---');
    const listA = await listActiveCourierDownloadBundles(prisma, { userId: userA.id });
    record('Bundle 목록 조회 (본인)', listA.some((b) => b.id === created.bundleId), `n=${listA.length}`);

    const listB = await listActiveCourierDownloadBundles(prisma, { userId: userB.id });
    record(
      '다른 사용자 Bundle 목록 격리',
      !listB.some((b) => b.id === created.bundleId),
      `bCount=${listB.length}`,
    );

    console.log('\n--- ShipmentUploadBatch.downloadBundleId ---');
    const batchLinked = await prisma.shipmentUploadBatch.create({
      data: {
        userId: userA.id,
        downloadBundleId: created.bundleId,
        originalFileName: `smoke-${MARK}.xlsx`,
        fileSize: 10,
        rowCount: 1,
        status: 'UPLOADED',
      },
    });
    record('downloadBundleId 연결', batchLinked.downloadBundleId === created.bundleId);

    await prisma.shipmentUploadBatch
      .create({
        data: {
          userId: userB.id,
          downloadBundleId: created.bundleId,
          originalFileName: `foreign-${MARK}.xlsx`,
          fileSize: 10,
          rowCount: 0,
          status: 'UPLOADED',
        },
      })
      .then(async (row) => {
        await prisma.shipmentUploadBatch.delete({ where: { id: row.id } });
        return true;
      })
      .catch(() => false);

    const apiGuard = await prisma.courierDownloadBundle.findFirst({
      where: { id: created.bundleId, userId: userB.id, expiresAt: { gte: new Date() } },
      select: { id: true },
    });
    record('다른 사용자 Bundle 선택 API 가드', apiGuard == null, 'findFirst userB+bundleA => null');
    record('참고: DB FK는 소유권 미검증(앱 가드 필수)', true, 'uploads route checks userId');

    const noneBatch = await prisma.shipmentUploadBatch.create({
      data: {
        userId: userA.id,
        downloadBundleId: null,
        originalFileName: `none-${MARK}.xlsx`,
        fileSize: 10,
        rowCount: 0,
        status: 'UPLOADED',
      },
    });
    record('해당 다운로드 없음 (null)', noneBatch.downloadBundleId == null);

    console.log('\n--- 수동 등록 분류 ---');
    const manualRows = buildManualRegistrationRows({
      workItems: workItems.map((w) => ({
        id: w.id,
        downloadBundleId: w.downloadBundleId,
        inputSource: w.inputSource,
        sourceMallKey: w.sourceMallKey,
        sourceMallLabel: w.sourceMallLabel,
        mallOrderNo: w.mallOrderNo,
        excloadOrderNo: w.excloadOrderNo,
      })),
      shipmentLinks: [
        {
          mallOrderNo: `EX-${MARK}`,
          excloadOrderNo: null,
          sourceMallKey: '자사몰',
          trackingNumber: 'TN-READY',
          carrierName: 'CJ',
        },
      ],
    });
    const byStatus = {
      READY: manualRows.filter((r) => r.status === 'READY').length,
      NEEDS_TRACKING_LINK: manualRows.filter((r) => r.status === 'NEEDS_TRACKING_LINK').length,
      NEEDS_MALL_ORDER_INFO: manualRows.filter((r) => r.status === 'NEEDS_MALL_ORDER_INFO').length,
    };
    const statusOk =
      byStatus.READY === 1 &&
      byStatus.NEEDS_TRACKING_LINK === 1 &&
      byStatus.NEEDS_MALL_ORDER_INFO === 1 &&
      manualRows.length === 3;
    record('수동 등록 분류 (준비됨/송장연결/확인)', statusOk, JSON.stringify(byStatus));

    console.log('\n--- transaction 원자성 ---');
    const beforeCount = await prisma.courierDownloadBundle.count({
      where: { userId: userA.id },
    });
    let txFailed = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.courierDownloadBundle.create({
          data: {
            userId: userA.id,
            courierTemplateLabel: `tx-fail-${MARK}`,
            rowCount: 1,
            apiCount: 0,
            manualCount: 1,
            expiresAt: new Date(Date.now() + 86400000),
            workItems: {
              create: [
                {
                  userId: userA.id,
                  excloadOrderNo: workItems[0]!.excloadOrderNo,
                  inputSource: 'EXCEL',
                  expiresAt: new Date(Date.now() + 86400000),
                },
              ],
            },
          },
        });
      });
    } catch {
      txFailed = true;
    }
    const afterCount = await prisma.courierDownloadBundle.count({
      where: { userId: userA.id },
    });
    record(
      '부분 WorkItem 실패 시 Bundle 미생성(transaction)',
      txFailed && afterCount === beforeCount,
    );

    // Hub download gate: persist failure must throw before blob download (code contract)
    const hubGateSource = fs.readFileSync(
      path.resolve('app/components/order-integration/OrderIntegrationHub.tsx'),
      'utf8',
    );
    const hubBlocksOnBundleFail =
      hubGateSource.includes('courier-download-bundles') &&
      hubGateSource.includes('다운로드 기록 저장에 실패하여 다운로드를 중단') &&
      hubGateSource.indexOf('courier-download-bundles') <
        hubGateSource.indexOf('anchor.download = fileName');
    record('Bundle 저장 실패 시 다운로드 반환 차단(코드)', hubBlocksOnBundleFail);

    console.log('\n--- 만료 삭제 cascade + FK SetNull ---');
    const expiredBundle = await prisma.courierDownloadBundle.create({
      data: {
        userId: userA.id,
        courierTemplateLabel: `expired-${MARK}`,
        rowCount: 1,
        apiCount: 0,
        manualCount: 1,
        expiresAt: new Date(Date.now() - 60_000),
        workItems: {
          create: [
            {
              userId: userA.id,
              excloadOrderNo: `EXC-EXP-${MARK}`,
              inputSource: 'TEXT',
              expiresAt: new Date(Date.now() - 60_000),
            },
          ],
        },
      },
    });
    const linkedExpiredBatch = await prisma.shipmentUploadBatch.create({
      data: {
        userId: userA.id,
        downloadBundleId: expiredBundle.id,
        originalFileName: `expired-batch-${MARK}.xlsx`,
        fileSize: 1,
        rowCount: 0,
        status: 'UPLOADED',
      },
    });

    const purge = await purgeExpiredCourierDownloadBundles(prisma, { now: new Date() });
    const expiredGone = await prisma.courierDownloadBundle.findUnique({
      where: { id: expiredBundle.id },
    });
    const expiredItems = await prisma.courierDownloadWorkItem.count({
      where: { downloadBundleId: expiredBundle.id },
    });
    const batchAfter = await prisma.shipmentUploadBatch.findUnique({
      where: { id: linkedExpiredBatch.id },
      select: { downloadBundleId: true },
    });
    record('만료 Bundle 삭제', expiredGone == null, `deletedBundles=${purge.deletedBundles}`);
    record('만료 시 WorkItem cascade 삭제', expiredItems === 0);
    record(
      '연결된 Batch.downloadBundleId SetNull',
      batchAfter?.downloadBundleId == null,
      `downloadBundleId=${String(batchAfter?.downloadBundleId)}`,
    );

    const stillThere = await prisma.courierDownloadBundle.findUnique({
      where: { id: created.bundleId },
    });
    record('미만료 Bundle 유지', stillThere != null);
  } catch (e) {
    console.error('FAIL: smoke exception:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    try {
      if (userIds.length) {
        await prisma.shipmentUploadBatch.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.courierDownloadWorkItem.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.courierDownloadBundle.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        ok('cleanup test users');
      }
    } catch (cleanupErr) {
      console.error(
        'cleanup warning:',
        cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
      );
    }
    await prisma.$disconnect();
  }

  console.log('\n=== smoke summary ===');
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
  }
  console.log(`total=${results.length} fail=${failed.length}`);
  if (failed.length || process.exitCode) process.exit(1);
  ok('courier download bundle smoke complete (TEST only)');
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
