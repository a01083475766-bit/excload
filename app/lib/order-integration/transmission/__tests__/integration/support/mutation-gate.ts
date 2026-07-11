/**
 * Mutation gate for integration fixture/cleanup.
 * No DB I/O. Requires wrapper-injected env markers.
 */

export const SHIPMENT_TRANSMISSION_IT_RUN = 'SHIPMENT_TRANSMISSION_IT_RUN';

export type MutationGateResult =
  | { ok: true }
  | { ok: false; reason: string };

export function evaluateIntegrationMutationGate(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): MutationGateResult {
  if (env[SHIPMENT_TRANSMISSION_IT_RUN] !== 'true') {
    return { ok: false, reason: 'IT_RUN_NOT_ENABLED' };
  }
  if (env.ALLOW_TEST_DB_MUTATION !== 'true') {
    return { ok: false, reason: 'MUTATION_FLAG_BLOCKED' };
  }
  if ((env.EXCLOAD_ENV_PROFILE ?? '').trim() !== 'smoke') {
    return { ok: false, reason: 'PROFILE_MISMATCH' };
  }
  if ((env.TEST_DB_ENV_FILE ?? '').trim() !== '.env.smoke.local') {
    return { ok: false, reason: 'ENV_FILE_MARKER_MISMATCH' };
  }
  if (!env.DATABASE_URL || !env.DIRECT_URL) {
    return { ok: false, reason: 'DB_URL_MISSING' };
  }
  return { ok: true };
}

export function assertIntegrationMutationAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  const result = evaluateIntegrationMutationGate(env);
  if (!result.ok) {
    throw new Error(`integration mutation blocked: ${result.reason}`);
  }
}
