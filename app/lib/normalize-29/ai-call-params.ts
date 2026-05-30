/** normalize-29 OpenAI max_tokens (단일 프롬프트·대량 건 한 번에). 타임아웃은 사용하지 않습니다. */
export function getNormalize29AiCallParams(): { maxTokens: number } {
  const parsed = Number(process.env.AI_NORMALIZE29_MAX_TOKENS);
  return {
    maxTokens: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 16_384,
  };
}
