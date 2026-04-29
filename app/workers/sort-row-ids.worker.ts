type WorkerSortItem = {
  rowId: string;
  value: string;
};

type WorkerSortRequest = {
  requestId: number;
  direction: 'asc' | 'desc';
  items: WorkerSortItem[];
};

type WorkerSortResponse = {
  requestId: number;
  rowIds: string[];
};

self.onmessage = (event: MessageEvent<WorkerSortRequest>) => {
  const { requestId, direction, items } = event.data;
  const sorted = [...items].sort((a, b) => {
    const cmp = a.value.localeCompare(b.value);
    return direction === 'asc' ? cmp : -cmp;
  });

  const response: WorkerSortResponse = {
    requestId,
    rowIds: sorted.map((x) => x.rowId),
  };
  self.postMessage(response);
};

