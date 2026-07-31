import { CAFE24_REQUIRED_SCOPES } from '@/app/lib/cafe24/constants';

export function normalizeCafe24ScopeList(scopes: readonly string[] | null | undefined): string[] {
  if (!scopes?.length) return [];
  const out = new Set<string>();
  for (const raw of scopes) {
    for (const part of String(raw ?? '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      out.add(part);
    }
  }
  return [...out];
}

export function listMissingCafe24Scopes(scopes: readonly string[] | null | undefined): string[] {
  const have = new Set(normalizeCafe24ScopeList(scopes));
  return CAFE24_REQUIRED_SCOPES.filter((scope) => !have.has(scope));
}

export function hasAllCafe24RequiredScopes(scopes: readonly string[] | null | undefined): boolean {
  return listMissingCafe24Scopes(scopes).length === 0;
}

export const CAFE24_REAUTH_SCOPE_MESSAGE =
  '카페24 주문 쓰기권한이 필요합니다. 다시 연동해 주세요';

export const CAFE24_REAUTH_SCOPE_HINT =
  '권한 추가를 위해 다시 연동해 주세요. (주문 읽기·쓰기, 배송 읽기)';
