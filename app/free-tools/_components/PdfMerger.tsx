'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileText,
  RotateCcw,
  RotateCcwSquare,
  RotateCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { canvasToBlobWithFallback, safeRandomId } from '@/app/free-tools/_utils/browserCompatibility';

type PageRotation = 0 | 90 | 180 | 270;
type ResultState = 'empty' | 'done' | 'stale';

type PdfFileItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  originalIndex: number;
  previewUrl: string;
  rangeInput: string;
  firstThumbnailUrl?: string;
};

type PdfPageItem = {
  id: string;
  fileId: string;
  pageIndex: number;
  pageNumber: number;
  included: boolean;
  rotation: PageRotation;
  thumbnailUrl?: string;
  thumbnailFailed?: boolean;
};

type MergeResult = {
  blob: Blob;
  url: string;
  fileName: string;
  usedFileCount: number;
  originalPageCount: number;
  resultPageCount: number;
  excludedPageCount: number;
  rotatedPageCount: number;
  originalTotalSize: number;
  pdfSize: number;
};

type MergeWorkerMessage =
  | { type: 'status'; jobId: string; message: string; currentPage: number; totalPages: number }
  | { type: 'done'; jobId: string; buffer: ArrayBuffer; pageCount: number }
  | { type: 'error'; jobId: string; message: string };

const MAX_FILES = 20;
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const MAX_TOTAL_PAGES = 500;

let pdfjsReady = false;

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ko-KR')}KB`;
}

function safePdfFileName(value: string) {
  const cleaned = value
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 80);
  return `${cleaned || 'excload-merged'}.pdf`;
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function getPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjsReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
    pdfjsReady = true;
  }
  return pdfjs;
}

async function loadPdfDocument(file: File) {
  const pdfjs = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  });
  return documentTask.promise;
}

function isPasswordError(error: unknown) {
  return error instanceof Error && /password|encrypted|encrypt|암호/i.test(`${error.name} ${error.message}`);
}

function getPdfLoadErrorMessage(error: unknown) {
  if (isPasswordError(error)) {
    return [
      '암호가 설정된 PDF는 이 화면에서 바로 처리할 수 없습니다.',
      '비밀번호를 알고 있다면 원본 PDF 프로그램에서 암호를 해제한 사본으로 저장한 뒤 다시 추가해 주세요.',
    ].join(' ');
  }
  return 'PDF 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.';
}

async function getPdfPageCount(file: File) {
  const buffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(buffer);
  return pdf.getPageCount();
}

async function renderPageThumbnail(file: File, pageNumber: number, rotation: PageRotation) {
  const pdf = await loadPdfDocument(file);
  try {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const targetWidth = 160;
    const scale = Math.min(0.35, targetWidth / baseViewport.width);
    const viewport = page.getViewport({ scale, rotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas_failed');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await canvasToBlobWithFallback(canvas, 'image/jpeg', 0.78);
    canvas.width = 0;
    canvas.height = 0;
    return URL.createObjectURL(blob);
  } finally {
    await (pdf as unknown as { destroy: () => Promise<void> }).destroy();
  }
}

function parsePageRange(value: string, pageCount: number) {
  const trimmed = value.trim();
  if (!trimmed) return { error: '페이지 범위를 올바르게 입력해 주세요. 예: 1-3, 5, 8-10' };

  const pages = new Set<number>();
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = part.match(/^\d+$/);

    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1 || start > end) {
        return { error: '페이지 범위를 올바르게 입력해 주세요. 예: 1-3, 5, 8-10' };
      }
      if (end > pageCount) return { error: '파일의 전체 페이지 수를 초과한 번호가 포함되어 있습니다.' };
      for (let page = start; page <= end; page += 1) pages.add(page);
      continue;
    }

    if (singleMatch) {
      const page = Number(part);
      if (page < 1) return { error: '페이지 범위를 올바르게 입력해 주세요. 예: 1-3, 5, 8-10' };
      if (page > pageCount) return { error: '파일의 전체 페이지 수를 초과한 번호가 포함되어 있습니다.' };
      pages.add(page);
      continue;
    }

    return { error: '페이지 범위를 올바르게 입력해 주세요. 예: 1-3, 5, 8-10' };
  }

  return { pages };
}

export function PdfMerger() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragFileIdRef = useRef<string | null>(null);
  const filesRef = useRef<PdfFileItem[]>([]);
  const pagesRef = useRef<PdfPageItem[]>([]);
  const resultRef = useRef<MergeResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [files, setFiles] = useState<PdfFileItem[]>([]);
  const [pages, setPages] = useState<PdfPageItem[]>([]);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [resultState, setResultState] = useState<ResultState>('empty');
  const [fileName, setFileName] = useState('excload-merged');
  const [error, setError] = useState<string | null>(null);
  const [thumbnailNotice, setThumbnailNotice] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  const orderedFiles = files;
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const originalPageCount = useMemo(() => files.reduce((sum, file) => sum + file.pageCount, 0), [files]);
  const includedPages = useMemo(() => pages.filter((page) => page.included), [pages]);
  const excludedPageCount = pages.length - includedPages.length;
  const rotatedPageCount = pages.filter((page) => page.rotation !== 0).length;
  const outputName = safePdfFileName(fileName);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach((file) => {
        URL.revokeObjectURL(file.previewUrl);
        if (file.firstThumbnailUrl) URL.revokeObjectURL(file.firstThumbnailUrl);
      });
      pagesRef.current.forEach((page) => {
        if (page.thumbnailUrl) URL.revokeObjectURL(page.thumbnailUrl);
      });
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (!previewUrl) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewUrl(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewUrl]);

  const cleanupResult = () => {
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setResultState('empty');
  };

  const markStale = () => {
    setError(null);
    setPreviewUrl(null);
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    if (resultRef.current) setResultState('stale');
  };

  const resetAll = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    jobIdRef.current = null;
    files.forEach((file) => {
      URL.revokeObjectURL(file.previewUrl);
      if (file.firstThumbnailUrl) URL.revokeObjectURL(file.firstThumbnailUrl);
    });
    pages.forEach((page) => {
      if (page.thumbnailUrl) URL.revokeObjectURL(page.thumbnailUrl);
    });
    setFiles([]);
    setPages([]);
    setFileName('excload-merged');
    setError(null);
    setThumbnailNotice(null);
    setLoadingFiles(false);
    setProcessing(false);
    setProgressText('');
    setPreviewUrl(null);
    cleanupResult();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearUploadMessages = () => {
    setError(null);
    setThumbnailNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generateThumbnails = async (file: File, fileId: string, pageCount: number) => {
    for (const pageNumber of Array.from({ length: pageCount }, (_, index) => index + 1)) {
      if (!filesRef.current.some((item) => item.id === fileId)) return;
      try {
        const thumbnailUrl = await renderPageThumbnail(file, pageNumber, 0);
        setPages((prev) =>
          prev.map((page) =>
            page.fileId === fileId && page.pageNumber === pageNumber
              ? { ...page, thumbnailUrl }
              : page,
          ),
        );
        if (pageNumber === 1) {
          setFiles((prev) =>
            prev.map((item) => (item.id === fileId ? { ...item, firstThumbnailUrl: thumbnailUrl } : item)),
          );
        }
      } catch {
        setThumbnailNotice('일부 페이지의 미리보기를 만들 수 없습니다. 페이지 선택과 PDF 만들기는 계속할 수 있습니다.');
        setPages((prev) =>
          prev.map((page) =>
            page.fileId === fileId && page.pageNumber === pageNumber
              ? { ...page, thumbnailFailed: true }
              : page,
          ),
        );
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  };

  const addFiles = async (nextFiles: File[]) => {
    if (processing || loadingFiles || nextFiles.length === 0) return;

    setLoadingFiles(true);
    setError(null);
    let nextError: string | null = null;
    let workingFiles = [...filesRef.current];
    let workingPages = [...pagesRef.current];
    let nextOriginalIndex = workingFiles.reduce((max, file) => Math.max(max, file.originalIndex), -1) + 1;

    for (const file of nextFiles) {
      if (!isPdfFile(file)) {
        nextError = 'PDF 파일만 추가할 수 있습니다.';
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        nextError = '파일 한 개의 크기는 30MB 이하만 사용할 수 있습니다.';
        continue;
      }
      if (workingFiles.length >= MAX_FILES) {
        nextError = 'PDF 파일은 최대 20개까지 추가할 수 있습니다.';
        continue;
      }
      if (workingFiles.reduce((sum, item) => sum + item.size, 0) + file.size > MAX_TOTAL_SIZE) {
        nextError = '전체 파일 용량은 100MB 이하만 사용할 수 있습니다.';
        continue;
      }

      try {
        const pageCount = await getPdfPageCount(file);
        if (pageCount === 0) {
          nextError = '페이지가 없는 PDF 파일은 사용할 수 없습니다.';
          continue;
        }
        if (workingFiles.reduce((sum, item) => sum + item.pageCount, 0) + pageCount > MAX_TOTAL_PAGES) {
          nextError = '추가한 PDF의 전체 페이지가 500페이지를 초과했습니다. 파일 수나 페이지 수를 줄인 뒤 다시 시도해 주세요.';
          continue;
        }

        const fileId = safeRandomId('pdf-file');
        const previewUrl = URL.createObjectURL(file);
        const fileItem: PdfFileItem = {
          id: fileId,
          file,
          name: file.name,
          size: file.size,
          pageCount,
          originalIndex: nextOriginalIndex,
          previewUrl,
          rangeInput: '',
        };
        const pageItems = Array.from({ length: pageCount }).map((_, index) => ({
          id: `${fileId}-${index}`,
          fileId,
          pageIndex: index,
          pageNumber: index + 1,
          included: true,
          rotation: 0 as PageRotation,
        }));
        workingFiles = [...workingFiles, fileItem];
        workingPages = [...workingPages, ...pageItems];
        setFiles(workingFiles);
        setPages(workingPages);
        void generateThumbnails(file, fileId, pageCount);
        nextOriginalIndex += 1;
      } catch (loadError) {
        nextError = getPdfLoadErrorMessage(loadError);
      }
    }

    if (workingFiles.length !== filesRef.current.length) markStale();
    setError(nextError);
    setLoadingFiles(false);
  };

  const removeFile = (fileId: string) => {
    if (processing) return;
    const file = files.find((item) => item.id === fileId);
    if (file) {
      URL.revokeObjectURL(file.previewUrl);
      if (file.firstThumbnailUrl) URL.revokeObjectURL(file.firstThumbnailUrl);
    }
    pages.filter((page) => page.fileId === fileId).forEach((page) => {
      if (page.thumbnailUrl) URL.revokeObjectURL(page.thumbnailUrl);
    });
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
    setPages((prev) => prev.filter((page) => page.fileId !== fileId));
    markStale();
  };

  const moveFile = (fileId: string, direction: -1 | 1) => {
    if (processing) return;
    setFiles((prev) => {
      const index = prev.findIndex((file) => file.id === fileId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    markStale();
  };

  const reorderByDrop = (targetId: string) => {
    const sourceId = dragFileIdRef.current;
    dragFileIdRef.current = null;
    if (!sourceId || sourceId === targetId || processing) return;
    setFiles((prev) => {
      const sourceIndex = prev.findIndex((file) => file.id === sourceId);
      const targetIndex = prev.findIndex((file) => file.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...prev];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
    markStale();
  };

  const resetFileOrder = () => {
    if (processing) return;
    setFiles((prev) => [...prev].sort((a, b) => a.originalIndex - b.originalIndex));
    markStale();
  };

  const clearFiles = () => {
    if (processing) return;
    files.forEach((file) => {
      URL.revokeObjectURL(file.previewUrl);
      if (file.firstThumbnailUrl) URL.revokeObjectURL(file.firstThumbnailUrl);
    });
    pages.forEach((page) => {
      if (page.thumbnailUrl) URL.revokeObjectURL(page.thumbnailUrl);
    });
    setFiles([]);
    setPages([]);
    markStale();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setPageIncluded = (pageId: string, included: boolean) => {
    if (processing) return;
    setPages((prev) => prev.map((page) => (page.id === pageId ? { ...page, included } : page)));
    markStale();
  };

  const rotatePage = (pageId: string, direction: -90 | 90) => {
    if (processing) return;
    setPages((prev) =>
      prev.map((page) =>
        page.id === pageId
          ? { ...page, rotation: (((page.rotation + direction + 360) % 360) as PageRotation) }
          : page,
      ),
    );
    markStale();
  };

  const resetPageRotation = (pageId: string) => {
    if (processing) return;
    setPages((prev) => prev.map((page) => (page.id === pageId ? { ...page, rotation: 0 } : page)));
    markStale();
  };

  const updateFilePages = (fileId: string, updater: (page: PdfPageItem) => PdfPageItem) => {
    setPages((prev) => prev.map((page) => (page.fileId === fileId ? updater(page) : page)));
    markStale();
  };

  const resetAllRotations = () => {
    if (processing) return;
    setPages((prev) => prev.map((page) => ({ ...page, rotation: 0 })));
    markStale();
  };

  const updateRangeInput = (fileId: string, value: string) => {
    setFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, rangeInput: value } : file)));
  };

  const applyRange = (file: PdfFileItem, mode: 'include-only' | 'exclude') => {
    if (processing) return;
    const parsed = parsePageRange(file.rangeInput, file.pageCount);
    if ('error' in parsed) {
      setError(parsed.error ?? '페이지 범위를 올바르게 입력해 주세요. 예: 1-3, 5, 8-10');
      return;
    }
    const pageSet = parsed.pages;
    setPages((prev) =>
      prev.map((page) => {
        if (page.fileId !== file.id) return page;
        const inRange = pageSet.has(page.pageNumber);
        return { ...page, included: mode === 'include-only' ? inRange : !inRange };
      }),
    );
    setError(null);
    markStale();
  };

  const createMergedPdf = async () => {
    if (files.length === 0) {
      setError('작업할 PDF 파일을 먼저 추가해 주세요.');
      return;
    }
    if (includedPages.length === 0) {
      setError('결과 PDF에 포함할 페이지를 한 장 이상 선택해 주세요.');
      return;
    }

    workerRef.current?.terminate();
    const jobId = safeRandomId('pdf-merge');
    jobIdRef.current = jobId;
    setProcessing(true);
    setError(null);
    cleanupResult();
    setProgressText('선택한 페이지를 확인하고 있습니다.');

    try {
      const payloadFiles = await Promise.all(
        files.map(async (file) => ({
          id: file.id,
          buffer: await file.file.arrayBuffer(),
        })),
      );
      const worker = new Worker(new URL('../_workers/pdfMerge.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<MergeWorkerMessage>) => {
        if (event.data.jobId !== jobIdRef.current) return;
        if (event.data.type === 'status') {
          setProgressText(event.data.message);
          return;
        }
        worker.terminate();
        workerRef.current = null;
        setProcessing(false);

        if (event.data.type === 'error') {
          setError(event.data.message);
          return;
        }

        const blob = new Blob([event.data.buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const usedFileIds = new Set(includedPages.map((page) => page.fileId));
        setResult({
          blob,
          url,
          fileName: outputName,
          usedFileCount: usedFileIds.size,
          originalPageCount,
          resultPageCount: event.data.pageCount,
          excludedPageCount,
          rotatedPageCount,
          originalTotalSize: totalSize,
          pdfSize: blob.size,
        });
        setResultState('done');
        setProgressText('');
      };

      worker.onerror = () => {
        if (jobIdRef.current !== jobId) return;
        worker.terminate();
        workerRef.current = null;
        setProcessing(false);
        setError('PDF를 만드는 중 문제가 발생했습니다. 파일과 선택한 페이지를 확인한 뒤 다시 시도해 주세요.');
      };

      const mergePages = files.flatMap((file) =>
        pages
          .filter((page) => page.fileId === file.id && page.included)
          .sort((a, b) => a.pageIndex - b.pageIndex)
          .map((page) => ({
            fileId: page.fileId,
            pageIndex: page.pageIndex,
            rotation: page.rotation,
          })),
      );

      worker.postMessage(
        {
          jobId,
          files: payloadFiles,
          pages: mergePages,
        },
        payloadFiles.map((file) => file.buffer),
      );
    } catch {
      setProcessing(false);
      setError('PDF의 크기나 페이지 수가 너무 많아 처리하기 어렵습니다. 파일을 나누거나 페이지 수를 줄인 뒤 다시 시도해 주세요.');
    }
  };

  const fileSummary = orderedFiles.slice(0, 5);

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <FileText className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
            <div>
              <h3 className="text-lg font-bold text-zinc-950">PDF 업로드와 합치기 설정</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                여러 PDF에서 필요한 페이지만 선택하고 순서를 정해 하나의 PDF로 합칠 수 있습니다.
                PDF 읽기와 합치기는 서버 전송 없이 사용자의 브라우저에서만 처리됩니다.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] xl:items-start">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
            <label
              tabIndex={0}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !processing) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void addFiles(Array.from(event.dataTransfer.files));
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center ${
                processing || loadingFiles
                  ? 'cursor-not-allowed border-zinc-200 bg-zinc-50'
                  : 'cursor-pointer border-blue-200 bg-blue-50/50 hover:bg-blue-50'
              }`}
            >
              <Upload className="size-8 text-blue-600" aria-hidden />
              <span className="mt-3 text-sm font-bold text-zinc-950">PDF 파일을 선택하거나 드래그해서 첨부해 주세요.</span>
              <span className="mt-1 text-xs text-zinc-500">최대 20개 · 파일당 30MB · 전체 100MB · 최대 500페이지</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,application/pdf"
                disabled={processing || loadingFiles}
                className="sr-only"
                onChange={(event) => {
                  void addFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
            </label>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={processing || loadingFiles} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:bg-zinc-50 disabled:text-zinc-400">
                PDF 추가
              </button>
              <button type="button" onClick={clearFiles} disabled={processing || files.length === 0} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400">
                전체 삭제
              </button>
              <button type="button" onClick={resetFileOrder} disabled={processing || files.length < 2} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400">
                파일 순서 초기화
              </button>
            </div>

            {(error || thumbnailNotice || loadingFiles) && (
              <div className="mt-4 space-y-2" aria-live="polite">
                {loadingFiles && <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-700">PDF 파일을 읽고 있습니다.</p>}
                {thumbnailNotice && <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">{thumbnailNotice}</p>}
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p>{error}</p>
                        {isPasswordError(new Error(error)) && (
                          <p className="mt-1 text-xs leading-relaxed text-red-600">
                            이 도구는 암호를 추측하거나 해제하지 않습니다. 암호가 제거된 PDF만 합치기에 사용할 수 있습니다.
                          </p>
                        )}
                        {files.length === 0 && (
                          <p className="mt-1 text-xs leading-relaxed text-red-600">
                            이 파일은 목록에 추가되지 않았습니다. 오류를 지우고 다른 PDF를 다시 선택해 주세요.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={clearUploadMessages}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        오류 지우기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearUploadMessages();
                          fileInputRef.current?.click();
                        }}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        다른 PDF 선택
                      </button>
                      {files.length > 0 && (
                        <button
                          type="button"
                          onClick={clearFiles}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          추가된 PDF 전체 삭제
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 space-y-3">
              <p className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-900">
                위에서부터 표시된 파일 순서대로 PDF가 합쳐집니다. 각 파일 안에서는 원래 페이지 순서가 유지됩니다.
              </p>

              {files.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                  <p>PDF를 추가하면 파일 순서와 페이지 수가 표시됩니다.</p>
                  {error && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      읽지 못한 파일은 자동으로 제외되므로 삭제할 목록이 없습니다.
                    </p>
                  )}
                </div>
              ) : (
                files.map((file, index) => {
                  const includedCount = pages.filter((page) => page.fileId === file.id && page.included).length;
                  return (
                    <article
                      key={file.id}
                      draggable={!processing}
                      onDragStart={() => {
                        dragFileIdRef.current = file.id;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        reorderByDrop(file.id);
                      }}
                      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 sm:w-24 sm:shrink-0">
                          {file.firstThumbnailUrl ? (
                            <img src={file.firstThumbnailUrl} alt={`${file.name} 첫 페이지 미리보기`} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <FileText className="size-8 text-zinc-400" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-blue-700">{index + 1}번째 파일</p>
                          <p title={file.name} className="mt-1 truncate text-sm font-semibold text-zinc-950">{file.name}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            전체 {file.pageCount.toLocaleString('ko-KR')}페이지 · 포함 {includedCount.toLocaleString('ko-KR')}페이지 · {formatBytes(file.size)}
                          </p>
                        </div>
                        <div className="grid grid-cols-5 gap-2 sm:w-auto sm:grid-cols-5">
                          <button type="button" aria-label={`${file.name} 원본 미리보기`} onClick={() => { setPreviewUrl(file.previewUrl); setPreviewTitle(`원본 미리보기: ${file.name}`); }} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-blue-700">
                            <Eye className="mx-auto size-4" aria-hidden />
                          </button>
                          <button type="button" aria-label={`${file.name} 위로 이동`} onClick={() => moveFile(file.id, -1)} disabled={processing || index === 0} className="rounded-lg border border-zinc-200 px-2 py-2 text-zinc-700 disabled:text-zinc-400">
                            <ArrowUp className="mx-auto size-4" aria-hidden />
                          </button>
                          <button type="button" aria-label={`${file.name} 아래로 이동`} onClick={() => moveFile(file.id, 1)} disabled={processing || index === files.length - 1} className="rounded-lg border border-zinc-200 px-2 py-2 text-zinc-700 disabled:text-zinc-400">
                            <ArrowDown className="mx-auto size-4" aria-hidden />
                          </button>
                          <button type="button" aria-label={`${file.name} 삭제`} onClick={() => removeFile(file.id)} disabled={processing} className="rounded-lg border border-red-100 bg-red-50 px-2 py-2 text-red-700 disabled:text-zinc-400">
                            <Trash2 className="mx-auto size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
            <h3 className="text-lg font-bold text-zinc-950">PDF 구성 요약</h3>
            <div className="mt-4 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 sm:grid-cols-2">
              <span>업로드 파일: {files.length.toLocaleString('ko-KR')}개</span>
              <span>원본 전체 페이지: {originalPageCount.toLocaleString('ko-KR')}페이지</span>
              <span>결과 포함 페이지: {includedPages.length.toLocaleString('ko-KR')}페이지</span>
              <span>제외한 페이지: {excludedPageCount.toLocaleString('ko-KR')}페이지</span>
              <span>회전한 페이지: {rotatedPageCount.toLocaleString('ko-KR')}페이지</span>
              <span>전체 파일 용량: {formatBytes(totalSize)}</span>
            </div>
            {fileSummary.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-zinc-600">
                {fileSummary.map((file, index) => {
                  const includedCount = pages.filter((page) => page.fileId === file.id && page.included).length;
                  return (
                    <li key={file.id} className="truncate">
                      {index + 1}. {file.name} - {includedCount} / {file.pageCount}페이지
                    </li>
                  );
                })}
                {files.length > fileSummary.length && <li>외 {files.length - fileSummary.length}개 파일</li>}
              </ul>
            )}

            <label className="mt-5 block">
              <span className="text-xs font-medium text-zinc-600">결과 PDF 파일명</span>
              <input
                value={fileName}
                disabled={processing}
                onChange={(event) => setFileName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="합친문서"
              />
            </label>

            {includedPages.length === 0 && files.length > 0 && (
              <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                결과 PDF에 포함할 페이지를 한 장 이상 선택해 주세요.
              </p>
            )}

            {processing && (
              <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-700" aria-live="polite">
                PDF 파일을 처리하고 있습니다. {progressText}
              </p>
            )}

            <button
              type="button"
              onClick={() => void createMergedPdf()}
              disabled={processing || files.length === 0 || includedPages.length === 0}
              className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {processing ? 'PDF 파일을 처리하고 있습니다.' : files.length === 1 ? '편집한 PDF 만들기' : 'PDF 합치기'}
            </button>

            <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
              <p>전자서명이 포함된 PDF를 편집하거나 합치면 기존 서명이 유효하지 않게 될 수 있습니다.</p>
              <p className="mt-1">입력 양식, 특수 주석, 첨부 파일 또는 고급 PDF 기능은 결과 문서에서 완전히 유지되지 않을 수 있습니다.</p>
            </div>

            {resultState === 'stale' && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                PDF 구성이나 페이지 설정이 변경되었습니다. PDF를 다시 만들어 주세요.
              </p>
            )}

            {result && resultState === 'done' && (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
                <p className="font-semibold">PDF 만들기 완료</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <span>사용한 파일: {result.usedFileCount.toLocaleString('ko-KR')}개</span>
                  <span>원본 전체 페이지: {result.originalPageCount.toLocaleString('ko-KR')}페이지</span>
                  <span>결과 페이지: {result.resultPageCount.toLocaleString('ko-KR')}페이지</span>
                  <span>제외한 페이지: {result.excludedPageCount.toLocaleString('ko-KR')}페이지</span>
                  <span>회전한 페이지: {result.rotatedPageCount.toLocaleString('ko-KR')}페이지</span>
                  <span>원본 전체 용량: {formatBytes(result.originalTotalSize)}</span>
                  <span>결과 파일 용량: {formatBytes(result.pdfSize)}</span>
                  <span className="truncate sm:col-span-2">결과 파일: {outputName}</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => downloadBlob(result.blob, outputName)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                    <Download className="size-4" aria-hidden />
                    결과 PDF 다운로드
                  </button>
                  <button type="button" onClick={() => { setPreviewUrl(result.url); setPreviewTitle(`결과 미리보기: ${outputName}`); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                    <Eye className="size-4" aria-hidden />
                    결과 미리보기
                  </button>
                  <button type="button" onClick={clearFiles} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <X className="size-4" aria-hidden />
                    다른 PDF 작업
                  </button>
                  <button type="button" onClick={resetAll} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <RotateCcwSquare className="size-4" aria-hidden />
                    설정 초기화
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900">
              업로드한 PDF 파일은 서버로 전송되지 않습니다. PDF 읽기, 페이지 선택, 회전 및 합치기는 사용자의
              브라우저에서만 처리됩니다. 페이지를 닫거나 새로고침하면 업로드한 파일과 생성 결과는 사라집니다.
            </div>
          </section>
        </div>

        {files.length > 0 && (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-950">페이지 구성</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  페이지 제외는 결과 PDF에만 적용됩니다. 원본 PDF 파일은 변경되지 않습니다.
                </p>
              </div>
              <button type="button" onClick={resetAllRotations} disabled={processing || rotatedPageCount === 0} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400">
                전체 회전 초기화
              </button>
            </div>

            <div className="mt-5 space-y-6">
              {orderedFiles.map((file) => {
                const filePages = pages.filter((page) => page.fileId === file.id).sort((a, b) => a.pageIndex - b.pageIndex);
                const includedCount = filePages.filter((page) => page.included).length;
                return (
                  <div key={file.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p title={file.name} className="truncate text-sm font-bold text-zinc-950">{file.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">{file.pageCount}페이지 중 {includedCount}페이지 포함</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => updateFilePages(file.id, (page) => ({ ...page, included: true }))} disabled={processing} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:text-zinc-400">
                          전체 페이지 포함
                        </button>
                        <button type="button" onClick={() => updateFilePages(file.id, (page) => ({ ...page, included: false }))} disabled={processing} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400">
                          전체 페이지 제외
                        </button>
                        <button type="button" onClick={() => updateFilePages(file.id, (page) => ({ ...page, included: true }))} disabled={processing} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400">
                          제외한 페이지 복원
                        </button>
                        <button type="button" onClick={() => updateFilePages(file.id, (page) => ({ ...page, rotation: 0 }))} disabled={processing} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400">
                          모든 페이지 회전 초기화
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <label className="block">
                        <span className="text-xs font-medium text-zinc-600">페이지 범위</span>
                        <input
                          value={file.rangeInput}
                          disabled={processing}
                          onChange={(event) => updateRangeInput(file.id, event.target.value)}
                          placeholder="예: 1-3, 5, 8-10"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <button type="button" onClick={() => applyRange(file, 'include-only')} disabled={processing} className="self-end rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 disabled:text-zinc-400">
                        입력한 페이지만 포함
                      </button>
                      <button type="button" onClick={() => applyRange(file, 'exclude')} disabled={processing} className="self-end rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 disabled:text-zinc-400">
                        입력한 페이지 제외
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                      {filePages.map((page) => (
                        <article
                          key={page.id}
                          className={`rounded-xl border p-3 ${
                            page.included ? 'border-zinc-200 bg-white' : 'border-zinc-200 bg-zinc-100 opacity-70'
                          }`}
                        >
                          <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white">
                            {page.thumbnailUrl ? (
                              <img
                                src={page.thumbnailUrl}
                                alt={`${file.name} ${page.pageNumber}페이지 미리보기`}
                                className="max-h-full max-w-full object-contain"
                                style={{ transform: `rotate(${page.rotation}deg)` }}
                              />
                            ) : (
                              <span className="px-3 text-center text-xs text-zinc-500">
                                {page.thumbnailFailed ? '미리보기를 만들 수 없습니다.' : '미리보기 준비 중'}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 space-y-2">
                            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                              <input
                                type="checkbox"
                                checked={page.included}
                                disabled={processing}
                                onChange={(event) => setPageIncluded(page.id, event.target.checked)}
                              />
                              {page.pageNumber}페이지 PDF에 포함
                            </label>
                            <p className="text-xs text-zinc-500">
                              {page.included ? '합치기에 포함' : '제외됨'} · 회전 {page.rotation}도
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              <button type="button" aria-label={`${file.name} ${page.pageNumber}페이지 왼쪽으로 90도 회전`} onClick={() => rotatePage(page.id, -90)} disabled={processing} className="rounded-lg border border-zinc-200 px-2 py-2 text-zinc-700 disabled:text-zinc-400">
                                <RotateCcw className="mx-auto size-4" aria-hidden />
                              </button>
                              <button type="button" aria-label={`${file.name} ${page.pageNumber}페이지 오른쪽으로 90도 회전`} onClick={() => rotatePage(page.id, 90)} disabled={processing} className="rounded-lg border border-zinc-200 px-2 py-2 text-zinc-700 disabled:text-zinc-400">
                                <RotateCw className="mx-auto size-4" aria-hidden />
                              </button>
                              <button type="button" aria-label={`${file.name} ${page.pageNumber}페이지 회전 초기화`} onClick={() => resetPageRotation(page.id)} disabled={processing || page.rotation === 0} className="rounded-lg border border-zinc-200 px-2 py-2 text-zinc-700 disabled:text-zinc-400">
                                0도
                              </button>
                            </div>
                            <button type="button" onClick={() => setPageIncluded(page.id, !page.included)} disabled={processing} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400">
                              {page.included ? '이 페이지 제외' : '다시 포함'}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewUrl(null);
          }}
        >
          <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <p className="min-w-0 truncate text-sm font-bold text-zinc-950">{previewTitle}</p>
              <button type="button" onClick={() => setPreviewUrl(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                닫기
              </button>
            </div>
            <iframe src={previewUrl} title={previewTitle} className="min-h-0 flex-1" />
          </div>
        </div>
      )}
    </>
  );
}
