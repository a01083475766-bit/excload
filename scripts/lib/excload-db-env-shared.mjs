/**
 * Shared DB env helpers for order-integration safety scripts.
 * Do not print connection strings or secrets from callers.
 */

export const EXCLOAD_PROD_SUPABASE_REF = 'xtlgtphceakmzmtqihnn';
export const EXCLOAD_TEST_SUPABASE_REF = 'qejjcjwbnxhmhcgwrbvt';

export const SMOKE_ENV_FILE = '.env.smoke.local';
export const SMOKE_ENV_PROFILE = 'smoke';

/**
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseEnvFileContent(content) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of String(content ?? '').split(/\r?\n/)) {
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

/**
 * @param {unknown} value
 */
export function isPresent(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {string} url
 */
export function looksLikePostgresUrl(url) {
  return /^postgres(ql)?:\/\//i.test(String(url ?? '').trim());
}

/**
 * @param {string} text
 * @param {string} prodRef
 * @param {string} testRef
 */
export function classifyRefsInText(text, prodRef, testRef) {
  const blob = String(text ?? '');
  return {
    hasProd: Boolean(prodRef) && blob.includes(prodRef),
    hasTest: Boolean(testRef) && blob.includes(testRef),
  };
}
