export type ParsedExcelSheet = {
  name: string;
  rows: string[][];
};

export type ExcelCleanupStats = {
  cleaned: boolean;
  removedEmptyRows: number;
  rowsWithCells: number;
};

type WorkerDoneMessage = {
  type: 'done';
  id: string;
  fileName: string;
  sheets: ParsedExcelSheet[];
  cleanupStats: ExcelCleanupStats;
};

type WorkerStatusMessage = {
  type: 'status';
  id: string;
  message: string;
};

type WorkerErrorMessage = {
  type: 'error';
  id: string;
  message: string;
};

type WorkerMessage = WorkerDoneMessage | WorkerStatusMessage | WorkerErrorMessage;

export type SafeExcelParseResult = {
  sheets: ParsedExcelSheet[];
  cleanupStats: ExcelCleanupStats;
};

export type SafeExcelParseTask = {
  id: string;
  worker: Worker;
  promise: Promise<SafeExcelParseResult>;
};

export function createSafeExcelParseTask(
  file: File,
  extension: string,
  onStatus?: (message: string) => void,
  sourceBuffer?: ArrayBuffer,
): SafeExcelParseTask {
  const id = crypto.randomUUID();
  const worker = new Worker(new URL('../_workers/excelParser.worker.ts', import.meta.url), {
    type: 'module',
  });

  const promise = new Promise<SafeExcelParseResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.id !== id) return;

      if (event.data.type === 'status') {
        onStatus?.(event.data.message);
        return;
      }

      worker.terminate();

      if (event.data.type === 'done') {
        resolve({
          sheets: event.data.sheets,
          cleanupStats: event.data.cleanupStats,
        });
        return;
      }

      reject(new Error(event.data.message));
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error('파일을 읽을 수 없습니다. 암호가 설정되어 있거나 손상된 파일인지 확인해 주세요.'));
    };

    const bufferPromise = sourceBuffer ? Promise.resolve(sourceBuffer) : file.arrayBuffer();

    void bufferPromise.then(
      (buffer) => {
        worker.postMessage({ id, fileName: file.name, extension, buffer }, [buffer]);
      },
      () => {
        worker.terminate();
        reject(new Error('파일을 읽을 수 없습니다. 암호가 설정되어 있거나 손상된 파일인지 확인해 주세요.'));
      },
    );
  });

  return { id, worker, promise };
}
