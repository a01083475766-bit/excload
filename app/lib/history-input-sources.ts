import type { HistorySession, SourceType } from '@/app/store/historyStore';

/** 변환 작업에 사용된 입력 종류 (엑셀·텍스트·이미지) */
export type HistoryInputKind = 'excel' | 'text' | 'image';

export type InputSourceCounts = Partial<Record<HistoryInputKind, number>>;

export const HISTORY_INPUT_KIND_ORDER: HistoryInputKind[] = ['excel', 'text', 'image'];

export const emptyInputSourceCounts = (): InputSourceCounts => ({});

export function incrementInputSource(
  counts: InputSourceCounts,
  kind: HistoryInputKind
): InputSourceCounts {
  return {
    ...counts,
    [kind]: (counts[kind] ?? 0) + 1,
  };
}

/** 다운로드 저장용: 누적 counts가 없으면 마지막 입력 방식으로 1회 보정 */
export function normalizeInputSourcesForSession(
  counts: InputSourceCounts,
  lastKind: 'excel' | 'text' | 'image' | null
): InputSourceCounts {
  const hasAny = HISTORY_INPUT_KIND_ORDER.some((k) => (counts[k] ?? 0) > 0);
  if (hasAny) return { ...counts };
  if (lastKind) return { [lastKind]: 1 };
  return {};
}

export function sourceTypeFromInputKind(kind: HistoryInputKind): SourceType {
  if (kind === 'excel') return 'excel';
  if (kind === 'image') return 'image';
  return 'kakao';
}

/** 레거시 sourceType 호환용 대표 타입 (필터/정렬 보조) */
export function primarySourceTypeFromCounts(counts: InputSourceCounts): SourceType {
  const kinds = getKindsFromCounts(counts);
  if (kinds.length === 0) return 'kakao';
  const last = kinds[kinds.length - 1];
  return sourceTypeFromInputKind(last);
}

export function getKindsFromCounts(counts: InputSourceCounts): HistoryInputKind[] {
  return HISTORY_INPUT_KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0);
}

export function getInputKindsFromSession(session: HistorySession): HistoryInputKind[] {
  const fromCounts = session.inputSources
    ? getKindsFromCounts(session.inputSources)
    : [];
  if (fromCounts.length > 0) return fromCounts;

  if (session.sourceType === 'excel') return ['excel'];
  if (session.sourceType === 'image') return ['image'];
  return ['text'];
}

export function sessionIncludesInputKind(
  session: HistorySession,
  kind: HistoryInputKind
): boolean {
  return getInputKindsFromSession(session).includes(kind);
}

export function countInputKindsInSession(session: HistorySession): number {
  return getInputKindsFromSession(session).length;
}

const INPUT_KIND_SEARCH_KEYWORDS: Record<HistoryInputKind, string[]> = {
  excel: ['엑셀', 'excel', 'xlsx', 'xls'],
  text: ['텍스트', 'text', '카톡', '카카오', '문자', 'kakao'],
  image: ['이미지', 'image', '캡처', '스크린샷', '사진', 'jpg', 'png', 'gif'],
};

/** 검색어가 입력 구성(종류)과 매칭되는지 */
export function sessionMatchesInputKindSearch(
  session: HistorySession,
  searchTerm: string
): boolean {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return false;

  const kinds = getInputKindsFromSession(session);
  return kinds.some((kind) =>
    INPUT_KIND_SEARCH_KEYWORDS[kind].some((keyword) => term.includes(keyword))
  );
}

export function formatInputCompositionSummary(session: HistorySession): string {
  const kindCount = countInputKindsInSession(session);
  const orderCount = session.orderCount ?? 0;
  if (kindCount > 0) {
    return `입력 구성 ${kindCount}종 · 주문 ${orderCount}건`;
  }
  const legacyFileCount = session.files?.length ?? 0;
  if (legacyFileCount > 0) {
    return `파일 ${legacyFileCount}개 · 주문 ${orderCount}건`;
  }
  return `주문 ${orderCount}건`;
}

export function formatInputSourcesDetail(session: HistorySession): string | null {
  const counts = session.inputSources;
  if (!counts) return null;

  const parts = HISTORY_INPUT_KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0).map(
    (k) => {
      const label = k === 'excel' ? '엑셀' : k === 'text' ? '텍스트' : '이미지';
      return `${label} ${counts[k]}회`;
    }
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}
