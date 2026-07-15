'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  RotateCcwSquare,
  RotateCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PDFDocument, rgb } from 'pdf-lib';
import { canvasToBlobWithFallback, safeRandomId } from '@/app/free-tools/_utils/browserCompatibility';

type ImageRotation = 0 | 90 | 180 | 270;
type PageSizeMode = 'a4' | 'image';
type A4Orientation = 'auto' | 'portrait' | 'landscape';
type FitMode = 'contain' | 'cover';
type MarginMode = 'none' | 'narrow' | 'normal' | 'wide';
type QualityMode = 'small' | 'normal' | 'high';
type ResultState = 'empty' | 'done' | 'stale';

type ImageItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
  width: number;
  height: number;
  rotation: ImageRotation;
  originalIndex: number;
};

type PdfResult = {
  blob: Blob;
  url: string;
  fileName: string;
  pageCount: number;
  originalCount: number;
  originalTotalSize: number;
  pdfSize: number;
};

const MAX_IMAGES = 30;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const PT_PER_MM = 72 / 25.4;

const marginPoints: Record<MarginMode, number> = {
  none: 0,
  narrow: 5 * PT_PER_MM,
  normal: 10 * PT_PER_MM,
  wide: 20 * PT_PER_MM,
};

const qualitySettings: Record<QualityMode, { label: string; quality: number; maxLongSide: number }> = {
  small: { label: '작은 용량', quality: 0.72, maxLongSide: 1600 },
  normal: { label: '일반 화질', quality: 0.86, maxLongSide: 2400 },
  high: { label: '높은 화질', quality: 0.94, maxLongSide: 3200 },
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ko-KR')}KB`;
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getMimeFromFile(file: File) {
  const extension = getExtension(file.name);
  if (file.type && ACCEPTED_TYPES.includes(file.type)) return file.type;
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return '';
}

function isSupportedImage(file: File) {
  return Boolean(getMimeFromFile(file)) || ACCEPTED_EXTENSIONS.includes(getExtension(file.name));
}

function safePdfFileName(value: string) {
  const cleaned = value
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 80);
  return `${cleaned || 'excload-images'}.pdf`;
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

function getRotatedSize(item: ImageItem) {
  return item.rotation === 90 || item.rotation === 270
    ? { width: item.height, height: item.width }
    : { width: item.width, height: item.height };
}

function getPageLabel(mode: PageSizeMode) {
  return mode === 'a4' ? 'A4' : '이미지 크기에 맞춤';
}

function getOrientationLabel(orientation: A4Orientation) {
  if (orientation === 'portrait') return '세로';
  if (orientation === 'landscape') return '가로';
  return '이미지에 따라 자동';
}

function getFitLabel(fitMode: FitMode) {
  return fitMode === 'cover' ? '페이지를 가득 채우기' : '이미지 전체 표시';
}

function getMarginLabel(margin: MarginMode) {
  if (margin === 'none') return '여백 없음';
  if (margin === 'narrow') return '좁게';
  if (margin === 'wide') return '넓게';
  return '보통';
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    image.src = url;
  });
}

async function loadBitmap(file: File) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return loadImageElement(file);
    }
  }

  return loadImageElement(file);
}

function closeBitmap(bitmap: ImageBitmap | HTMLImageElement) {
  if ('close' in bitmap) bitmap.close();
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return canvasToBlobWithFallback(canvas, 'image/jpeg', quality);
}

async function makePdfImageBlob(item: ImageItem, qualityMode: QualityMode) {
  const bitmap = await loadBitmap(item.file);
  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const rotated = item.rotation === 90 || item.rotation === 270;
    const rotatedWidth = rotated ? sourceHeight : sourceWidth;
    const rotatedHeight = rotated ? sourceWidth : sourceHeight;
    const maxLongSide = qualitySettings[qualityMode].maxLongSide;
    const scale = Math.min(1, maxLongSide / Math.max(rotatedWidth, rotatedHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rotatedWidth * scale));
    canvas.height = Math.max(1, Math.round(rotatedHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas_failed');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((item.rotation * Math.PI) / 180);
    context.drawImage(bitmap, (-sourceWidth * scale) / 2, (-sourceHeight * scale) / 2, sourceWidth * scale, sourceHeight * scale);
    context.restore();

    const blob = await canvasToJpeg(canvas, qualitySettings[qualityMode].quality);
    canvas.width = 0;
    canvas.height = 0;
    return {
      blob,
      width: canvas.width || Math.max(1, Math.round(rotatedWidth * scale)),
      height: canvas.height || Math.max(1, Math.round(rotatedHeight * scale)),
      displayWidth: rotatedWidth,
      displayHeight: rotatedHeight,
    };
  } finally {
    closeBitmap(bitmap);
  }
}

function getPageSize(item: ImageItem, pageSizeMode: PageSizeMode, orientation: A4Orientation) {
  const rotated = getRotatedSize(item);
  if (pageSizeMode === 'a4') {
    const landscape =
      orientation === 'landscape' || (orientation === 'auto' && rotated.width > rotated.height);
    return landscape
      ? { width: A4_PORTRAIT.height, height: A4_PORTRAIT.width }
      : A4_PORTRAIT;
  }

  const maxLongSide = 900;
  const minShortSide = 180;
  const scale = Math.min(maxLongSide / Math.max(rotated.width, rotated.height), 1);
  const width = Math.max(minShortSide, rotated.width * scale * 0.75);
  const height = Math.max(minShortSide, rotated.height * scale * 0.75);
  return { width, height };
}

function getDrawRect(pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number, fitMode: FitMode, margin: number) {
  const safeMargin = fitMode === 'cover' ? 0 : Math.min(margin, pageWidth / 3, pageHeight / 3);
  const boxWidth = Math.max(1, pageWidth - safeMargin * 2);
  const boxHeight = Math.max(1, pageHeight - safeMargin * 2);
  const scale = fitMode === 'cover'
    ? Math.max(pageWidth / imageWidth, pageHeight / imageHeight)
    : Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: fitMode === 'cover' ? (pageWidth - width) / 2 : safeMargin + (boxWidth - width) / 2,
    y: fitMode === 'cover' ? (pageHeight - height) / 2 : safeMargin + (boxHeight - height) / 2,
    width,
    height,
  };
}

export function ImageToPdf() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragItemIdRef = useRef<string | null>(null);
  const itemsRef = useRef<ImageItem[]>([]);
  const resultRef = useRef<PdfResult | null>(null);
  const [items, setItems] = useState<ImageItem[]>([]);
  const [pageSizeMode, setPageSizeMode] = useState<PageSizeMode>('a4');
  const [orientation, setOrientation] = useState<A4Orientation>('auto');
  const [fitMode, setFitMode] = useState<FitMode>('contain');
  const [marginMode, setMarginMode] = useState<MarginMode>('normal');
  const [qualityMode, setQualityMode] = useState<QualityMode>('normal');
  const [fileName, setFileName] = useState('excload-images');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState<PdfResult | null>(null);
  const [resultState, setResultState] = useState<ResultState>('empty');
  const [previewOpen, setPreviewOpen] = useState(false);

  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items]);
  const pdfFileName = safePdfFileName(fileName);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const cleanupResult = () => {
    setPreviewOpen(false);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setResultState('empty');
  };

  const markStale = () => {
    setError(null);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return prev ? { ...prev, url: '' } : null;
    });
    if (result) setResultState('stale');
    setPreviewOpen(false);
  };

  const resetAll = () => {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setPageSizeMode('a4');
    setOrientation('auto');
    setFitMode('contain');
    setMarginMode('normal');
    setQualityMode('normal');
    setFileName('excload-images');
    setError(null);
    setProcessing(false);
    setProgressText('');
    cleanupResult();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
    };
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen]);

  const addFiles = async (files: File[]) => {
    if (processing || files.length === 0) return;

    let nextItems = [...items];
    let nextTotalSize = totalSize;
    let nextOriginalIndex = items.reduce((max, item) => Math.max(max, item.originalIndex), -1) + 1;
    let nextError: string | null = null;

    for (const file of files) {
      if (!isSupportedImage(file)) {
        nextError = 'JPG, PNG 또는 WEBP 이미지만 추가할 수 있습니다.';
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        nextError = '이미지 한 장의 크기는 20MB 이하만 사용할 수 있습니다.';
        continue;
      }
      if (nextItems.length >= MAX_IMAGES) {
        nextError = '이미지는 최대 30장까지 추가할 수 있습니다.';
        continue;
      }
      if (nextTotalSize + file.size > MAX_TOTAL_SIZE) {
        nextError = '선택한 이미지의 전체 용량이 100MB를 초과했습니다.';
        continue;
      }

      try {
        const bitmap = await loadBitmap(file);
        const width = bitmap.width;
        const height = bitmap.height;
        closeBitmap(bitmap);
        if (width * height > MAX_IMAGE_PIXELS) {
          nextError = '이미지 해상도가 지나치게 커서 처리할 수 없습니다. 이미지 크기를 줄인 뒤 다시 시도해 주세요.';
          continue;
        }
        nextItems = [
          ...nextItems,
          {
            id: safeRandomId('image-pdf'),
            file,
            name: file.name,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
            width,
            height,
            rotation: 0,
            originalIndex: nextOriginalIndex,
          },
        ];
        nextOriginalIndex += 1;
        nextTotalSize += file.size;
      } catch {
        nextError = '이미지를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.';
      }
    }

    const addedImage = nextItems.length !== items.length;
    setItems(nextItems);
    if (addedImage) markStale();
    setError(nextError);
  };

  const removeItem = (id: string) => {
    if (processing) return;
    setItems((prev) => {
      const removed = prev.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
    markStale();
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    if (processing) return;
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    markStale();
  };

  const reorderByDrop = (targetId: string) => {
    const sourceId = dragItemIdRef.current;
    dragItemIdRef.current = null;
    if (!sourceId || sourceId === targetId || processing) return;
    setItems((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...prev];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
    markStale();
  };

  const rotateItem = (id: string, direction: -90 | 90) => {
    if (processing) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, rotation: (((item.rotation + direction + 360) % 360) as ImageRotation) }
          : item,
      ),
    );
    markStale();
  };

  const resetOrder = () => {
    if (processing) return;
    setItems((prev) => [...prev].sort((a, b) => a.originalIndex - b.originalIndex));
    markStale();
  };

  const resetRotation = () => {
    if (processing) return;
    setItems((prev) => prev.map((item) => ({ ...item, rotation: 0 })));
    markStale();
  };

  const clearImages = () => {
    if (processing) return;
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setError(null);
    markStale();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createPdf = async () => {
    if (items.length === 0) {
      setError('PDF로 변환할 이미지를 먼저 추가해 주세요.');
      return;
    }

    setProcessing(true);
    setError(null);
    cleanupResult();

    try {
      const pdfDoc = await PDFDocument.create();
      const margin = fitMode === 'cover' ? 0 : marginPoints[marginMode];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setProgressText(`${index + 1} / ${items.length}페이지 처리 중`);
        await nextFrame();
        const imageBlob = await makePdfImageBlob(item, qualityMode);
        const bytes = await imageBlob.blob.arrayBuffer();
        const embeddedImage = await pdfDoc.embedJpg(bytes);
        const pageSize = getPageSize(item, pageSizeMode, orientation);
        const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageSize.width,
          height: pageSize.height,
          color: rgb(1, 1, 1),
        });
        const rect = getDrawRect(pageSize.width, pageSize.height, embeddedImage.width, embeddedImage.height, fitMode, margin);
        page.drawImage(embeddedImage, rect);
      }

      const pdfBytes = await pdfDoc.save();
      const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfArrayBuffer).set(pdfBytes);
      const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResult({
        blob,
        url,
        fileName: pdfFileName,
        pageCount: items.length,
        originalCount: items.length,
        originalTotalSize: totalSize,
        pdfSize: blob.size,
      });
      setResultState('done');
      setProgressText('');
    } catch {
      setError('PDF를 만드는 중 문제가 발생했습니다. 이미지 수나 이미지 크기를 줄인 뒤 다시 시도해 주세요.');
      setResultState('empty');
    } finally {
      setProcessing(false);
    }
  };

  const settingsSummary = (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
      <p className="font-bold text-zinc-950">예상 PDF 구성</p>
      <div className="mt-3 grid gap-2 text-zinc-600 sm:grid-cols-2">
        <span>총 {items.length.toLocaleString('ko-KR')}페이지</span>
        <span>페이지 크기: {getPageLabel(pageSizeMode)}</span>
        <span>방향: {pageSizeMode === 'a4' ? getOrientationLabel(orientation) : '이미지 비율'}</span>
        <span>배치: {getFitLabel(fitMode)}</span>
        <span>여백: {fitMode === 'cover' ? '여백 없음' : getMarginLabel(marginMode)}</span>
        <span>화질: {qualitySettings[qualityMode].label}</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
        <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <ImageIcon className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
            <div>
              <h3 className="text-lg font-bold text-zinc-950">이미지 업로드와 순서 설정</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                여러 장의 이미지를 원하는 순서대로 정리하여 하나의 PDF 파일로 만들 수 있습니다.
                이미지는 서버로 전송되지 않고 사용자의 브라우저에서만 처리됩니다.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
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
                if (!processing) void addFiles(Array.from(event.dataTransfer.files));
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center ${
                processing ? 'cursor-not-allowed border-zinc-200 bg-zinc-50' : 'cursor-pointer border-blue-200 bg-blue-50/50 hover:bg-blue-50'
              }`}
            >
              <Upload className="size-8 text-blue-600" aria-hidden />
              <span className="mt-3 text-sm font-bold text-zinc-950">이미지를 선택하거나 드래그해서 첨부해 주세요.</span>
              <span className="mt-1 text-xs text-zinc-500">JPG, PNG, WEBP 지원 · 최대 30장 · 파일당 20MB · 전체 100MB</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                disabled={processing}
                className="sr-only"
                onChange={(event) => {
                  void addFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert" aria-live="polite">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:bg-zinc-50 disabled:text-zinc-400"
              >
                이미지 추가
              </button>
              <button
                type="button"
                onClick={clearImages}
                disabled={processing || items.length === 0}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
              >
                전체 삭제
              </button>
              <button
                type="button"
                onClick={resetOrder}
                disabled={processing || items.length < 2}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
              >
                순서 초기화
              </button>
              <button
                type="button"
                onClick={resetRotation}
                disabled={processing || items.length === 0}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
              >
                회전 초기화
              </button>
            </div>

            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                이미지를 추가하면 PDF 페이지 순서대로 목록이 표시됩니다.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold text-zinc-950">이미지 목록 {items.length.toLocaleString('ko-KR')}장</p>
                  <p className="text-xs text-zinc-500">전체 용량 {formatBytes(totalSize)}</p>
                </div>
                {items.map((item, index) => {
                  const rotated = getRotatedSize(item);
                  return (
                    <article
                      key={item.id}
                      draggable={!processing}
                      onDragStart={() => {
                        dragItemIdRef.current = item.id;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        reorderByDrop(item.id);
                      }}
                      className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0] sm:w-36 sm:shrink-0">
                          <img
                            src={item.previewUrl}
                            alt={`${item.name} 미리보기`}
                            className="max-h-full max-w-full object-contain"
                            style={{ transform: `rotate(${item.rotation}deg)` }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-blue-700">{index + 1}페이지</p>
                          <p title={item.name} className="mt-1 truncate text-sm font-semibold text-zinc-950">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {rotated.width.toLocaleString('ko-KR')} x {rotated.height.toLocaleString('ko-KR')} · {formatBytes(item.size)}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">회전: {item.rotation}도</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" aria-label="왼쪽으로 90도 회전" onClick={() => rotateItem(item.id, -90)} disabled={processing} className="rounded-lg border border-zinc-200 px-2 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400">
                              <RotateCcw className="mx-auto size-4" aria-hidden />
                            </button>
                            <button type="button" aria-label="오른쪽으로 90도 회전" onClick={() => rotateItem(item.id, 90)} disabled={processing} className="rounded-lg border border-zinc-200 px-2 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400">
                              <RotateCw className="mx-auto size-4" aria-hidden />
                            </button>
                            <button type="button" aria-label="위로 이동" onClick={() => moveItem(item.id, -1)} disabled={processing || index === 0} className="rounded-lg border border-zinc-200 px-2 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400">
                              <ArrowUp className="mx-auto size-4" aria-hidden />
                            </button>
                            <button type="button" aria-label="아래로 이동" onClick={() => moveItem(item.id, 1)} disabled={processing || index === items.length - 1} className="rounded-lg border border-zinc-200 px-2 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400">
                              <ArrowDown className="mx-auto size-4" aria-hidden />
                            </button>
                            <button type="button" aria-label="이미지 삭제" onClick={() => removeItem(item.id)} disabled={processing} className="rounded-lg border border-red-100 bg-red-50 px-2 py-2 text-xs font-semibold text-red-700 disabled:text-zinc-400">
                              <Trash2 className="mx-auto size-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
          <div className="flex items-start gap-3">
            <FileText className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
            <div>
              <h3 className="text-lg font-bold text-zinc-950">PDF 페이지와 출력 설정</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                이미지 한 장이 PDF 한 페이지가 되며, 현재 목록 순서대로 PDF가 만들어집니다.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">페이지 크기</span>
                <select
                  value={pageSizeMode}
                  disabled={processing}
                  onChange={(event) => {
                    setPageSizeMode(event.target.value as PageSizeMode);
                    markStale();
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="a4">A4</option>
                  <option value="image">이미지 크기에 맞춤</option>
                </select>
              </label>
              {pageSizeMode === 'a4' && (
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">A4 페이지 방향</span>
                  <select
                    value={orientation}
                    disabled={processing}
                    onChange={(event) => {
                      setOrientation(event.target.value as A4Orientation);
                      markStale();
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="auto">자동</option>
                    <option value="portrait">세로</option>
                    <option value="landscape">가로</option>
                  </select>
                </label>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">이미지 배치</span>
                <select
                  value={fitMode}
                  disabled={processing}
                  onChange={(event) => {
                    setFitMode(event.target.value as FitMode);
                    markStale();
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="contain">페이지 안에 전체 이미지 표시</option>
                  <option value="cover">페이지를 가득 채우기</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">페이지 여백</span>
                <select
                  value={marginMode}
                  disabled={processing || fitMode === 'cover'}
                  onChange={(event) => {
                    setMarginMode(event.target.value as MarginMode);
                    markStale();
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  <option value="none">여백 없음</option>
                  <option value="narrow">좁게</option>
                  <option value="normal">보통</option>
                  <option value="wide">넓게</option>
                </select>
              </label>
            </div>

            {fitMode === 'cover' && (
              <p className="rounded-md border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                페이지 비율과 이미지 비율이 다르면 이미지 가장자리가 일부 잘릴 수 있습니다.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">PDF 화질</span>
                <select
                  value={qualityMode}
                  disabled={processing}
                  onChange={(event) => {
                    setQualityMode(event.target.value as QualityMode);
                    markStale();
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="small">작은 용량</option>
                  <option value="normal">일반 화질</option>
                  <option value="high">높은 화질</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">PDF 파일명</span>
                <input
                  value={fileName}
                  disabled={processing}
                  onChange={(event) => {
                    setFileName(event.target.value);
                    markStale();
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="이미지모음"
                />
              </label>
            </div>

            {items.length > 0 ? settingsSummary : (
              <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-center text-sm leading-relaxed text-zinc-500">
                이미지를 추가하고 순서를 정한 뒤 PDF 만들기를 눌러 주세요.
              </p>
            )}

            {processing && (
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-700" aria-live="polite">
                이미지를 PDF로 변환하고 있습니다. {progressText}
              </div>
            )}

            <button
              type="button"
              onClick={() => void createPdf()}
              disabled={processing}
              className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {processing ? '이미지를 PDF로 변환하고 있습니다.' : 'PDF 만들기'}
            </button>

            {result && (
              <div
                className={`rounded-md border p-4 ${
                  resultState === 'stale' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800'
                }`}
              >
                <p className="font-semibold">
                  {resultState === 'stale' ? '설정이나 이미지가 변경되었습니다. PDF를 다시 만들어 주세요.' : 'PDF 만들기 완료'}
                </p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <span>페이지 수: {result.pageCount.toLocaleString('ko-KR')}페이지</span>
                  <span>원본 이미지: {result.originalCount.toLocaleString('ko-KR')}장</span>
                  <span>원본 전체 용량: {formatBytes(result.originalTotalSize)}</span>
                  <span>PDF 파일 용량: {formatBytes(result.pdfSize)}</span>
                  <span className="truncate sm:col-span-2">결과 파일: {result.fileName}</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => downloadBlob(result.blob, pdfFileName)}
                    disabled={resultState !== 'done'}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-500"
                  >
                    <Download className="size-4" aria-hidden />
                    PDF 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    disabled={resultState !== 'done' || !result.url}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:border-zinc-200 disabled:text-zinc-400"
                  >
                    <Eye className="size-4" aria-hidden />
                    PDF 미리보기
                  </button>
                  <button
                    type="button"
                    onClick={clearImages}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    <X className="size-4" aria-hidden />
                    다른 이미지 변환
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    <RotateCcwSquare className="size-4" aria-hidden />
                    설정 초기화
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900">
              업로드한 이미지는 서버로 전송되지 않습니다. 이미지 읽기와 PDF 생성은 사용자의 브라우저에서만
              처리됩니다. 페이지를 닫거나 새로고침하면 업로드한 이미지와 생성 결과는 사라집니다.
            </div>

            <p className="text-xs leading-relaxed text-zinc-500">
              이미지 해상도가 지나치게 큰 경우 처리하기 어려울 수 있습니다. 필요하면{' '}
              <Link href="/free-tools/image-resize" className="font-semibold text-blue-700 hover:text-blue-900">
                이미지 크기·용량 줄이기
              </Link>
              에서 먼저 줄인 뒤 다시 시도해 주세요.
            </p>
          </div>
        </section>
      </div>

      {previewOpen && result?.url && resultState === 'done' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewOpen(false);
          }}
        >
          <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <p className="min-w-0 truncate text-sm font-bold text-zinc-950">PDF 미리보기: {result.fileName}</p>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                닫기
              </button>
            </div>
            <iframe src={result.url} title="생성된 PDF 미리보기" className="min-h-0 flex-1" />
          </div>
        </div>
      )}
    </>
  );
}
