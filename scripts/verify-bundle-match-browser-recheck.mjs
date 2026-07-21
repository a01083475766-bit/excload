/**
 * TEST 전용 — Bundle/매칭 수동 UI 재검증 후 DB 읽기 전용 점검.
 * PII 원문·HMAC 원문·DATABASE_URL·토큰은 출력하지 않음.
 *
 * 이 스크립트는 브라우저·서버·자식 프로세스를 실행하지 않습니다.
 * 샘플 업로드·다운로드는 로컬 앱에서 수동으로 한 뒤, 이 스크립트로 DB만 점검합니다.
 *
 * 사용 (`.env.smoke.local`에 ALLOW_TEST_DB_MUTATION=true 및 TEST DB URL 명시 필요):
 *   node scripts/verify-bundle-match-browser-recheck.mjs
 *   node scripts/verify-bundle-match-browser-recheck.mjs --since-minutes=30
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
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

const require = createRequire(import.meta.url);

const sinceMinutes = (() => {
  const arg = process.argv.find((a) => a.startsWith('--since-minutes='));
  const n = arg ? Number(arg.split('=')[1]) : 60;
  return Number.isFinite(n) && n > 0 ? n : 60;
})();

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function maskId(id) {
  if (!id || id.length < 10) return '[id]';
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function maskHost(host) {
  return String(host).replace(/([a-z0-9]{4})[a-z0-9]{8,}([a-z0-9]{4})/gi, '$1…$2');
}

function looksLikePlainPii(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/010[-\s]?\d{3,4}[-\s]?\d{4}/.test(value)) return true;
  if (/서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주/.test(value)) {
    return true;
  }
  return false;
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

/**
 * Optional app URL guard for related manual UI steps.
 * This script itself never launches a browser; if a URL env is set, it must be local-only.
 * @param {Record<string, string>} smoke
 */
function assertLocalOnlyAppUrls(smoke) {
  const keys = [
    'SMOKE_APP_URL',
    'BASE_URL',
    'APP_URL',
    'NEXTAUTH_URL',
    'VERCEL_URL',
  ];
  for (const key of keys) {
    const raw = smoke[key] ?? process.env[key];
    if (raw == null || String(raw).trim() === '') continue;
    const value = String(raw).trim();
    let hostname = '';
    try {
      const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
      hostname = new URL(withScheme).hostname.toLowerCase();
    } catch {
      fail(`${key} is not a valid URL (refusing; value not printed)`);
    }
    if (hostname.includes('excload.com')) {
      fail(`${key} points to Production host excload.com — abort before any DB work`);
    }
    const localOk =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!localOk) {
      fail(`${key} must be localhost / 127.0.0.1 / ::1 only (refusing; value not printed)`);
    }
  }
}

function loadSmokeEnvAndPreflight() {
  const abs = path.resolve(process.cwd(), SMOKE_ENV_FILE);
  if (!fs.existsSync(abs)) fail(`${SMOKE_ENV_FILE} missing`);
  const smoke = parseEnvFileContent(fs.readFileSync(abs, 'utf8'));

  const allowMutation = resolveAllowTestDbMutation(smoke);
  if (allowMutation !== 'true') {
    fail(
      'TEST DB access requires explicit ALLOW_TEST_DB_MUTATION=true in .env.smoke.local or process env (refusing without it)',
    );
  }

  assertLocalOnlyAppUrls(smoke);

  const env = {
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

  const u = new URL(env.DATABASE_URL);
  console.log(
    JSON.stringify({
      ok: true,
      phase: 'preflight',
      class: 'TEST',
      host: maskHost(u.hostname),
      sinceMinutes,
      note: 'DB read-only check; no browser launch',
    }),
  );

  return env;
}

async function runDbReadOnlyCheck(env) {
  for (const [k, v] of Object.entries(env)) {
    process.env[k] = v;
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    console.log(JSON.stringify({ dbClass: 'TEST', sinceMinutes, since: since.toISOString() }));

    const recentBundles = await prisma.courierDownloadBundle.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        userId: true,
        createdAt: true,
        expiresAt: true,
        rowCount: true,
        apiCount: true,
        manualCount: true,
        courierTemplateLabel: true,
        _count: { select: { workItems: true } },
      },
    });

    console.log(
      'recentBundles',
      recentBundles.map((b) => ({
        id: maskId(b.id),
        createdAt: b.createdAt.toISOString(),
        expiresAt: b.expiresAt.toISOString(),
        rowCount: b.rowCount,
        apiCount: b.apiCount,
        manualCount: b.manualCount,
        workItemCount: b._count.workItems,
        labelHint: b.courierTemplateLabel ? '[label-set]' : null,
        userIdPrefix: b.userId.slice(0, 8),
      })),
    );

    for (const bundle of recentBundles.slice(0, 3)) {
      const items = await prisma.courierDownloadWorkItem.findMany({
        where: { downloadBundleId: bundle.id },
        select: {
          id: true,
          inputSource: true,
          orderSyncOrderId: true,
          sourceMallKey: true,
          sourceMallLabel: true,
          mallOrderNo: true,
          excloadOrderNo: true,
          matchFingerprintHmac: true,
        },
      });

      const piiLeakSuspects = [];
      for (const item of items) {
        for (const [field, value] of Object.entries({
          sourceMallKey: item.sourceMallKey,
          sourceMallLabel: item.sourceMallLabel,
          mallOrderNo: item.mallOrderNo,
          excloadOrderNo: item.excloadOrderNo,
        })) {
          if (looksLikePlainPii(value)) {
            piiLeakSuspects.push({ workItemId: maskId(item.id), field });
          }
        }
      }

      console.log(
        JSON.stringify({
          bundleId: maskId(bundle.id),
          itemCount: items.length,
          bySource: items.reduce((acc, i) => {
            acc[i.inputSource] = (acc[i.inputSource] || 0) + 1;
            return acc;
          }, {}),
          withOrderSyncOrderId: items.filter((i) => i.orderSyncOrderId).length,
          withMallOrderNo: items.filter((i) => i.mallOrderNo?.trim()).length,
          withSourceMallKey: items.filter((i) => i.sourceMallKey?.trim()).length,
          withExcloadOrderNo: items.filter((i) => i.excloadOrderNo?.trim()).length,
          withMatchFingerprintHmac: items.filter((i) => i.matchFingerprintHmac?.trim()).length,
          fingerprintLooksHashed: items.every(
            (i) =>
              !i.matchFingerprintHmac ||
              (i.matchFingerprintHmac.startsWith('v1|') && !looksLikePlainPii(i.matchFingerprintHmac)),
          ),
          plainPiiSuspectFields: piiLeakSuspects,
        }),
      );
    }

    const recentBatches = await prisma.shipmentUploadBatch.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        userId: true,
        downloadBundleId: true,
        createdAt: true,
        rowCount: true,
        matchedConfidentCount: true,
        matchedWarningCount: true,
        notMatchedCount: true,
        originalFileName: true,
      },
    });

    console.log(
      'recentBatches',
      recentBatches.map((b) => ({
        id: maskId(b.id),
        createdAt: b.createdAt.toISOString(),
        downloadBundleId: b.downloadBundleId ? maskId(b.downloadBundleId) : null,
        downloadBundleIdIsNull: b.downloadBundleId == null,
        rowCount: b.rowCount,
        matchedConfidentCount: b.matchedConfidentCount,
        matchedWarningCount: b.matchedWarningCount,
        notMatchedCount: b.notMatchedCount,
        userIdPrefix: b.userId.slice(0, 8),
      })),
    );

    const linked = recentBatches.find((b) => b.downloadBundleId);
    if (linked?.downloadBundleId) {
      const workItemCount = await prisma.courierDownloadWorkItem.count({
        where: { downloadBundleId: linked.downloadBundleId },
      });
      const otherBundleWorkItems = await prisma.courierDownloadWorkItem.count({
        where: {
          userId: linked.userId,
          downloadBundleId: { not: linked.downloadBundleId },
        },
      });
      const orderSyncForUser = await prisma.orderSyncOrder.count({
        where: { userId: linked.userId },
      });
      console.log(
        JSON.stringify({
          linkedBatchId: maskId(linked.id),
          linkedBundleId: maskId(linked.downloadBundleId),
          workItemCountOnLinkedBundle: workItemCount,
          otherBundleWorkItemCountSameUser: otherBundleWorkItems,
          orderSyncOrderCountSameUser: orderSyncForUser,
          note: '후보 격리는 코드상 Bundle WorkItem만 로드. 여기 숫자는 DB 존재량이며 업로드 응답 loadedCount와 비교하세요.',
        }),
      );
    }

    console.log(
      JSON.stringify({
        checklist: [
          '예시 다운로드 직후 recentBundles에 신규 행이 늘지 않아야 함',
          '수동 다운로드 직후 manualCount>0 Bundle 1개 + workItemCount 일치',
          'withMatchFingerprintHmac ≈ itemCount (전화/이름 재료가 있으면)',
          'plainPiiSuspectFields 빈 배열',
          '매칭 업로드 후 downloadBundleId 연결 + loadedCount===workItemCount (UI)',
          '「해당 다운로드 없음」업로드 시 downloadBundleIdIsNull true',
        ],
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const env = loadSmokeEnvAndPreflight();
  await runDbReadOnlyCheck(env);
}

main().catch((e) => {
  console.error(String(e?.message || e).slice(0, 300));
  process.exitCode = 1;
});
