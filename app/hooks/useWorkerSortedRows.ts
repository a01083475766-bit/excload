'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SortConfig = {
  header: string;
  direction: 'asc' | 'desc';
} | null;

type PreviewRowLike = {
  rowId: string;
  data: Record<string, string>;
};

type WorkerSortResponse = {
  requestId: number;
  rowIds: string[];
};

const WORKER_THRESHOLD = 300;

export function useWorkerSortedRows<T extends PreviewRowLike>(
  previewRows: T[],
  sortConfig: SortConfig,
  userOverrides: Record<string, Record<string, string>>,
): T[] {
  const workerRef = useRef<Worker | null>(null);
  const reqRef = useRef(0);
  const [sortedIds, setSortedIds] = useState<string[] | null>(null);

  const rowsById = useMemo(() => {
    const map = new Map<string, T>();
    for (const r of previewRows) map.set(r.rowId, r);
    return map;
  }, [previewRows]);

  const localSortedRows = useMemo(() => {
    if (!sortConfig) return previewRows;
    const { header, direction } = sortConfig;
    return [...previewRows].sort((a, b) => {
      const av = userOverrides[a.rowId]?.[header] ?? a.data[header] ?? '';
      const bv = userOverrides[b.rowId]?.[header] ?? b.data[header] ?? '';
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [previewRows, sortConfig, userOverrides]);

  const canUseWorker =
    !!sortConfig &&
    previewRows.length >= WORKER_THRESHOLD &&
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined';

  const workerItems = useMemo(() => {
    if (!sortConfig) return [];
    const { header } = sortConfig;
    return previewRows.map((r) => ({
      rowId: r.rowId,
      value: String(userOverrides[r.rowId]?.[header] ?? r.data[header] ?? ''),
    }));
  }, [previewRows, sortConfig, userOverrides]);

  useEffect(() => {
    if (!canUseWorker || !sortConfig) {
      setSortedIds(null);
      return;
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/sort-row-ids.worker.ts', import.meta.url),
      );
    }

    const worker = workerRef.current;
    const requestId = ++reqRef.current;

    const onMessage = (e: MessageEvent<WorkerSortResponse>) => {
      const data = e.data;
      if (data.requestId !== requestId) return;
      setSortedIds(data.rowIds);
    };

    worker.addEventListener('message', onMessage);
    worker.postMessage({
      requestId,
      direction: sortConfig.direction,
      items: workerItems,
    });

    return () => {
      worker.removeEventListener('message', onMessage);
    };
  }, [canUseWorker, sortConfig, workerItems]);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  if (!canUseWorker || !sortedIds || sortedIds.length !== previewRows.length) {
    return localSortedRows;
  }

  const ordered: T[] = [];
  for (const id of sortedIds) {
    const row = rowsById.get(id);
    if (row) ordered.push(row);
  }
  return ordered.length === previewRows.length ? ordered : localSortedRows;
}

