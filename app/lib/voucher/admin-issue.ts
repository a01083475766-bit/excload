import { prisma } from '@/app/lib/prisma';
import {
  generateVoucherCodePlaintext,
  hashVoucherCode,
  voucherCodeLast4,
} from '@/app/lib/voucher/code-crypto';
import { VOUCHER_STATUS } from '@/app/lib/voucher/constants';

export type IssueUnitInput = {
  externalOrderId: string;
  unitIndex: number;
  rewardPolicyId: string;
  externalRewardName?: string | null;
  purchaseAmount?: number | null;
};

export type IssuedPlainRow = {
  voucherId: string;
  externalOrderId: string;
  unitIndex: number;
  externalRewardName: string | null;
  rewardCode: string;
  durationMonths: number;
  purchaseAmount: number | null;
  voucherCode: string;
  codeLast4: string;
  status: string;
  outcome: 'NEW' | 'EXISTING';
};

function snapshotFromPolicy(policy: {
  accessTier: string;
  durationMonths: number;
  pointsMode: string;
  startPolicy: string;
  stackPolicy: string;
  grantsProAccess: boolean;
  rewardCode: string;
}) {
  return {
    accessTierSnapshot: policy.accessTier,
    durationMonthsSnapshot: policy.durationMonths,
    pointsModeSnapshot: policy.pointsMode,
    startPolicySnapshot: policy.startPolicy,
    stackPolicySnapshot: policy.stackPolicy,
    grantsProAccessSnapshot: policy.grantsProAccess,
    rewardCode: policy.rewardCode,
  };
}

/**
 * Idempotent issue: unique(campaignId, externalOrderId, unitIndex).
 * Returns plaintext only for NEW rows (never logged by caller).
 */
export async function issueVoucherUnits(input: {
  campaignId: string;
  actorId: string;
  units: IssueUnitInput[];
  reason?: string;
}): Promise<{
  created: IssuedPlainRow[];
  existing: IssuedPlainRow[];
  conflicts: Array<{ externalOrderId: string; unitIndex: number; message: string }>;
}> {
  const created: IssuedPlainRow[] = [];
  const existing: IssuedPlainRow[] = [];
  const conflicts: Array<{ externalOrderId: string; unitIndex: number; message: string }> = [];

  const policyIds = [...new Set(input.units.map((u) => u.rewardPolicyId))];
  const policies = await prisma.rewardPolicy.findMany({
    where: { id: { in: policyIds }, campaignId: input.campaignId },
  });
  const policyMap = new Map(policies.map((p) => [p.id, p]));

  for (const unit of input.units) {
    const policy = policyMap.get(unit.rewardPolicyId);
    if (!policy || policy.status !== 'ACTIVE') {
      conflicts.push({
        externalOrderId: unit.externalOrderId,
        unitIndex: unit.unitIndex,
        message: '리워드 정책을 찾을 수 없거나 비활성입니다.',
      });
      continue;
    }

    const snap = snapshotFromPolicy(policy);
    const found = await prisma.voucher.findUnique({
      where: {
        campaignId_externalOrderId_unitIndex: {
          campaignId: input.campaignId,
          externalOrderId: unit.externalOrderId,
          unitIndex: unit.unitIndex,
        },
      },
      include: { rewardPolicy: true },
    });

    if (found) {
      const rewardMismatch = found.rewardPolicyId !== unit.rewardPolicyId;
      const amountMismatch =
        unit.purchaseAmount != null &&
        found.purchaseAmount != null &&
        unit.purchaseAmount !== found.purchaseAmount;
      if (rewardMismatch || amountMismatch) {
        conflicts.push({
          externalOrderId: unit.externalOrderId,
          unitIndex: unit.unitIndex,
          message: rewardMismatch
            ? '기존 발급 리워드와 다릅니다.'
            : '기존 발급 구매금액과 다릅니다.',
        });
        continue;
      }
      existing.push({
        voucherId: found.id,
        externalOrderId: found.externalOrderId,
        unitIndex: found.unitIndex,
        externalRewardName: found.externalRewardName,
        rewardCode: found.rewardPolicy.rewardCode,
        durationMonths: found.durationMonthsSnapshot,
        purchaseAmount: found.purchaseAmount,
        voucherCode: '',
        codeLast4: found.codeLast4,
        status: found.status,
        outcome: 'EXISTING',
      });
      continue;
    }

    const plaintext = generateVoucherCodePlaintext();
    const codeHash = hashVoucherCode(plaintext);
    const codeLast4 = voucherCodeLast4(plaintext);

    try {
      const voucher = await prisma.$transaction(async (tx) => {
        const createdVoucher = await tx.voucher.create({
          data: {
            campaignId: input.campaignId,
            rewardPolicyId: policy.id,
            codeHash,
            codeLast4,
            codeVersion: 1,
            externalOrderId: unit.externalOrderId,
            unitIndex: unit.unitIndex,
            externalRewardName: unit.externalRewardName ?? null,
            purchaseAmount: unit.purchaseAmount ?? null,
            status: VOUCHER_STATUS.ISSUED,
            accessTierSnapshot: snap.accessTierSnapshot,
            durationMonthsSnapshot: snap.durationMonthsSnapshot,
            pointsModeSnapshot: snap.pointsModeSnapshot,
            startPolicySnapshot: snap.startPolicySnapshot,
            stackPolicySnapshot: snap.stackPolicySnapshot,
            grantsProAccessSnapshot: snap.grantsProAccessSnapshot,
          },
        });
        await tx.voucherAuditLog.create({
          data: {
            voucherId: createdVoucher.id,
            actorId: input.actorId,
            action: 'ISSUE',
            result: 'SUCCESS',
            reason: input.reason ?? null,
            meta: {
              externalOrderId: unit.externalOrderId,
              unitIndex: unit.unitIndex,
              rewardCode: snap.rewardCode,
              codeLast4,
              codeVersion: 1,
            },
          },
        });
        return createdVoucher;
      });

      created.push({
        voucherId: voucher.id,
        externalOrderId: voucher.externalOrderId,
        unitIndex: voucher.unitIndex,
        externalRewardName: voucher.externalRewardName,
        rewardCode: snap.rewardCode,
        durationMonths: snap.durationMonthsSnapshot,
        purchaseAmount: voucher.purchaseAmount,
        voucherCode: plaintext,
        codeLast4,
        status: VOUCHER_STATUS.ISSUED,
        outcome: 'NEW',
      });
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'P2002') {
        const again = await prisma.voucher.findUnique({
          where: {
            campaignId_externalOrderId_unitIndex: {
              campaignId: input.campaignId,
              externalOrderId: unit.externalOrderId,
              unitIndex: unit.unitIndex,
            },
          },
          include: { rewardPolicy: true },
        });
        if (again) {
          const rewardMismatch = again.rewardPolicyId !== unit.rewardPolicyId;
          const amountMismatch =
            unit.purchaseAmount != null &&
            again.purchaseAmount != null &&
            unit.purchaseAmount !== again.purchaseAmount;
          if (rewardMismatch || amountMismatch) {
            conflicts.push({
              externalOrderId: unit.externalOrderId,
              unitIndex: unit.unitIndex,
              message: rewardMismatch
                ? '기존 발급 리워드와 다릅니다.'
                : '기존 발급 구매금액과 다릅니다.',
            });
            continue;
          }
          existing.push({
            voucherId: again.id,
            externalOrderId: again.externalOrderId,
            unitIndex: again.unitIndex,
            externalRewardName: again.externalRewardName,
            rewardCode: again.rewardPolicy.rewardCode,
            durationMonths: again.durationMonthsSnapshot,
            purchaseAmount: again.purchaseAmount,
            voucherCode: '',
            codeLast4: again.codeLast4,
            status: again.status,
            outcome: 'EXISTING',
          });
          continue;
        }
      }
      conflicts.push({
        externalOrderId: unit.externalOrderId,
        unitIndex: unit.unitIndex,
        message: '발급 중 오류가 발생했습니다.',
      });
    }
  }

  return { created, existing, conflicts };
}
