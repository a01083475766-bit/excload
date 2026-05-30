import type { Normalize29PromptRoute } from '@/app/lib/normalize-29/text-order-route';

/** normalize-29 OpenAI 호출 timeout·max_tokens (경로별) */
export function getNormalize29AiCallParams(route: Normalize29PromptRoute): {
  timeoutMs: number;
  maxTokens: number;
} {
  const fullTimeoutMs = Number(process.env.AI_NORMALIZE29_TIMEOUT_MS) || 45_000;
  const coreTimeoutMs = Number(process.env.AI_NORMALIZE29_CORE_TIMEOUT_MS) || 30_000;
  return {
    timeoutMs: route === 'core' ? coreTimeoutMs : fullTimeoutMs,
    maxTokens: route === 'core' ? 2048 : 8192,
  };
}
