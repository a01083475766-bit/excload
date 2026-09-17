/**
 * 사용자 지정양식(직접 헤더 연결) — 업로드 파일 헤더와 등록 시 원본 헤더 불일치 판별
 */

/** 매핑에 실제로 쓰는 원본 헤더(비워두기 제외), 등장 순서 유지·중복 제거 */
export function getMappedDirectSourceHeaders(
  mappings: Record<string, string | null> | undefined,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of Object.values(mappings ?? {})) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(value);
  }

  return result;
}

/** 업로드 헤더에 없는 필수 원본 헤더 목록 */
export function findMissingDirectSourceHeaders(
  uploadedHeaders: readonly string[],
  requiredSourceHeaders: readonly string[],
): string[] {
  const exact = new Set(uploadedHeaders);
  const trimmed = new Set(uploadedHeaders.map((header) => header.trim()));

  return requiredSourceHeaders.filter((required) => {
    if (exact.has(required)) return false;
    if (trimmed.has(required.trim())) return false;
    return true;
  });
}
