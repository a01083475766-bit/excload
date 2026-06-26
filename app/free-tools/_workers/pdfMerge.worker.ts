import { degrees, PDFDocument } from 'pdf-lib';

type WorkerScope = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<MergeRequest>) => void) | null;
};

const workerScope = self as unknown as WorkerScope;

type PageRotation = 0 | 90 | 180 | 270;

type MergeFilePayload = {
  id: string;
  buffer: ArrayBuffer;
};

type MergePagePayload = {
  fileId: string;
  pageIndex: number;
  rotation: PageRotation;
};

type MergeRequest = {
  jobId: string;
  files: MergeFilePayload[];
  pages: MergePagePayload[];
};

function postStatus(jobId: string, message: string, currentPage = 0, totalPages = 0) {
  workerScope.postMessage({
    type: 'status',
    jobId,
    message,
    currentPage,
    totalPages,
  });
}

workerScope.onmessage = async (event: MessageEvent<MergeRequest>) => {
  const { jobId, files, pages } = event.data;

  try {
    if (pages.length === 0) {
      throw new Error('no_pages');
    }

    postStatus(jobId, '선택한 페이지를 확인하고 있습니다.', 0, pages.length);
    const mergedPdf = await PDFDocument.create();
    const fileBuffers = new Map(files.map((file) => [file.id, file.buffer]));
    let processed = 0;

    for (const file of files) {
      const buffer = fileBuffers.get(file.id);
      if (!buffer) continue;

      const includedPages = pages
        .filter((page) => page.fileId === file.id)
        .sort((a, b) => a.pageIndex - b.pageIndex);

      if (includedPages.length === 0) continue;

      postStatus(jobId, '페이지를 순서대로 합치고 있습니다.', processed, pages.length);
      const sourcePdf = await PDFDocument.load(buffer);
      const copiedPages = await mergedPdf.copyPages(
        sourcePdf,
        includedPages.map((page) => page.pageIndex),
      );

      copiedPages.forEach((copiedPage, index) => {
        const pageState = includedPages[index];
        const existingRotation = copiedPage.getRotation().angle || 0;
        const finalRotation = (existingRotation + pageState.rotation) % 360;
        if (pageState.rotation !== 0) {
          postStatus(jobId, '페이지 회전을 적용하고 있습니다.', processed + 1, pages.length);
        }
        copiedPage.setRotation(degrees(finalRotation));
        mergedPdf.addPage(copiedPage);
        processed += 1;
        postStatus(jobId, `${processed} / ${pages.length}페이지 처리 중`, processed, pages.length);
      });
    }

    postStatus(jobId, '결과 PDF를 만들고 있습니다.', processed, pages.length);
    const bytes = await mergedPdf.save();
    const resultBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(resultBuffer).set(bytes);

    workerScope.postMessage(
      {
        type: 'done',
        jobId,
        buffer: resultBuffer,
        pageCount: pages.length,
      },
      [resultBuffer],
    );
  } catch {
    workerScope.postMessage({
      type: 'error',
      jobId,
      message: 'PDF를 만드는 중 문제가 발생했습니다. 파일과 선택한 페이지를 확인한 뒤 다시 시도해 주세요.',
    });
  }
};
