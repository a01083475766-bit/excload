'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import {
  AlertCircle,
  ClipboardCopy,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  ScanText,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';

type LoadedImage = {
  file: File;
  name: string;
  size: number;
  sourceLabel: string;
  previewUrl: string;
};

type ToolStatus = 'initial' | 'ready' | 'processing' | 'done' | 'error';
type Rect = { x: number; y: number; width: number; height: number };
type NaturalSize = { width: number; height: number };
type PreprocessProfile = 'balanced' | 'small-text' | 'high-contrast' | 'light-text';
type PreprocessSettings = {
  targetWidth: number;
  maxScale: number;
  contrast: number;
  brightness: number;
  threshold: number;
  binarize: boolean;
  invert: boolean;
  sharpen: boolean;
};
type ExtractionAttempt = { label: string; source: HTMLCanvasElement; psm: number };
type ExtractionResult = { text: string; confidence: number; label: string };

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const EMPTY_RESULT_MESSAGE = '글자를 찾지 못했습니다. 더 선명한 이미지로 다시 시도해 주세요.';
const DOWNLOAD_BASENAME = 'extracted-text';
const OCR_TARGET_WIDTH = 1600;
const OCR_MIN_WIDTH = 1200;

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024)).toLocaleString('ko-KR')}KB`;
}

function isSupportedImage(file: File) {
  const extension = getExtension(file.name);
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(extension);
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/([가-힣])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([가-힣])/g, '$1 $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textToRows(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  const body = lines.length > 0 ? lines : [''];
  return [['추출된 글자'], ...body.map((line) => [line])];
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

function makeCsv(text: string) {
  return textToRows(text)
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function getProfileSettings(profile: PreprocessProfile) {
  if (profile === 'small-text') {
    return {
      targetWidth: 1800,
      maxScale: 4,
      contrast: 1.42,
      brightness: 8,
      threshold: 178,
      binarize: false,
      invert: false,
      sharpen: true,
    };
  }
  if (profile === 'high-contrast') {
    return {
      targetWidth: OCR_TARGET_WIDTH,
      maxScale: 4,
      contrast: 1.72,
      brightness: 10,
      threshold: 170,
      binarize: true,
      invert: false,
      sharpen: true,
    };
  }
  if (profile === 'light-text') {
    return {
      targetWidth: OCR_TARGET_WIDTH,
      maxScale: 4,
      contrast: 1.58,
      brightness: 0,
      threshold: 168,
      binarize: false,
      invert: true,
      sharpen: true,
    };
  }
  return {
    targetWidth: OCR_TARGET_WIDTH,
    maxScale: 4,
    contrast: 1.28,
    brightness: 5,
    threshold: 180,
    binarize: false,
    invert: false,
    sharpen: true,
  };
}

function loadImageElement(file: File) {
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

async function fileToCanvas(file: File) {
  const image = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d');

  if (!context) throw new Error('canvas_failed');
  context.drawImage(image, 0, 0);
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, rect: Rect | null) {
  if (!rect || rect.width < 4 || rect.height < 4) return source;

  const x = Math.max(0, Math.min(source.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(source.height - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(source.width - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.round(rect.height)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) throw new Error('canvas_failed');
  context.drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function sharpenImageData(imageData: ImageData) {
  const { width, height, data } = imageData;
  const copy = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        let kernelIndex = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const index = ((y + ky) * width + (x + kx)) * 4 + channel;
            value += copy[index] * kernel[kernelIndex];
            kernelIndex += 1;
          }
        }
        data[(y * width + x) * 4 + channel] = Math.max(0, Math.min(255, value));
      }
    }
  }
}

function getScaleForOcr(width: number, targetWidth = OCR_TARGET_WIDTH, maxScale = 4) {
  if (width <= 0) return 1;
  if (width < OCR_MIN_WIDTH) return Math.min(maxScale, Math.max(OCR_MIN_WIDTH / width, targetWidth / width));
  if (width < targetWidth) return Math.min(maxScale, targetWidth / width);
  return 1;
}

function resizeCanvasForOcr(source: HTMLCanvasElement, targetWidth = OCR_TARGET_WIDTH, maxScale = 4) {
  const scale = getScaleForOcr(source.width, targetWidth, maxScale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');

  if (!context) throw new Error('canvas_failed');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function preprocessCanvas(source: HTMLCanvasElement, profile: PreprocessProfile) {
  const settings = getProfileSettings(profile);
  const canvas = resizeCanvasForOcr(source, settings.targetWidth, settings.maxScale);
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) throw new Error('canvas_failed');

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const contrast = settings.contrast;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    let value = (gray - 128) * contrast + 128 + settings.brightness;

    if (settings.invert) value = 255 - value;

    if (settings.binarize) {
      value = value > settings.threshold ? 255 : 0;
    } else if (value > 236) {
      value = 255;
    } else if (value < 22) {
      value = 0;
    }

    const normalized = Math.max(0, Math.min(255, value));
    data[index] = normalized;
    data[index + 1] = normalized;
    data[index + 2] = normalized;
  }

  if (settings.sharpen) sharpenImageData(imageData);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function buildSourceCanvas(file: File, rect: Rect | null) {
  const baseCanvas = await fileToCanvas(file);
  return cropCanvas(baseCanvas, rect);
}

function scoreExtractionResult(result: ExtractionResult) {
  const letters = result.text.match(/[가-힣A-Za-z0-9]/g)?.length ?? 0;
  const noisy = result.text.match(/[�□■●◆◇]/g)?.length ?? 0;
  return result.confidence + Math.min(15, letters / 20) - noisy * 5;
}

async function recognizeSource(source: HTMLCanvasElement, psm: number, label: string): Promise<ExtractionResult> {
  const Tesseract = (await import('tesseract.js')).default;
  const result = await Tesseract.recognize(source, 'kor+eng', {
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: psm,
  } as Parameters<typeof Tesseract.recognize>[2]);

  return {
    text: normalizeExtractedText(result.data.text ?? ''),
    confidence: typeof result.data.confidence === 'number' ? result.data.confidence : 0,
    label,
  };
}

async function extractTextFromImage(file: File, rect: Rect | null) {
  const sourceCanvas = await buildSourceCanvas(file, rect);
  const attempts: ExtractionAttempt[] = [
    { label: '원본 확대', source: resizeCanvasForOcr(sourceCanvas), psm: 3 },
    { label: '자동 보정', source: preprocessCanvas(sourceCanvas, 'balanced'), psm: 6 },
    { label: '작은 글씨 보정', source: preprocessCanvas(sourceCanvas, 'small-text'), psm: 6 },
    { label: '대비 보정', source: preprocessCanvas(sourceCanvas, 'high-contrast'), psm: 6 },
    { label: '밝은 글씨 보정', source: preprocessCanvas(sourceCanvas, 'light-text'), psm: 6 },
  ];

  const results: ExtractionResult[] = [];
  for (const attempt of attempts) {
    results.push(await recognizeSource(attempt.source, attempt.psm, attempt.label));
  }

  return results.sort((a, b) => scoreExtractionResult(b) - scoreExtractionResult(a))[0] ?? {
    text: '',
    confidence: 0,
    label: '',
  };
}

function getClipboardImageFile(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  const file = imageItem?.getAsFile();

  if (!file) return null;
  const extension = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png';
  return new File([file], file.name || `pasted-capture.${extension}`, { type: file.type || 'image/png' });
}

export function ImageTextExtractor() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const extractionRunRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const pasteHintTimerRef = useRef<number | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<ToolStatus>('initial');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteHintVisible, setPasteHintVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const [resultConfidence, setResultConfidence] = useState<number | null>(null);

  const hasText = text.trim().length > 0;
  const processing = status === 'processing';
  const canDownload = hasText && !processing;

  const setImageFromFile = (file: File, sourceLabel: string) => {
    extractionRunRef.current += 1;
    setCopied(false);
    setError(null);
    setPasteHintVisible(false);

    if (!isSupportedImage(file)) {
      setStatus('error');
      setError('JPG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setStatus('error');
      setError(`파일 크기는 ${formatBytes(MAX_FILE_SIZE)} 이하로 올려 주세요.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = previewUrl;

    setLoadedImage({
      file,
      name: file.name || sourceLabel,
      size: file.size,
      sourceLabel,
      previewUrl,
    });
    setText('');
    setSelectionMode(false);
    setSelectionRect(null);
    setNaturalSize(null);
    setResultConfidence(null);
    setStatus('ready');
  };

  const resetAll = () => {
    extractionRunRef.current += 1;
    if (pasteHintTimerRef.current) window.clearTimeout(pasteHintTimerRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setLoadedImage(null);
    setText('');
    setStatus('initial');
    setError(null);
    setCopied(false);
    setPasteHintVisible(false);
    setSelectionMode(false);
    setSelectionRect(null);
    setNaturalSize(null);
    setResultConfidence(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const showPasteGuide = () => {
    setPasteHintVisible(true);
    if (pasteHintTimerRef.current) window.clearTimeout(pasteHintTimerRef.current);
    pasteHintTimerRef.current = window.setTimeout(() => setPasteHintVisible(false), 2500);
  };

  const runExtraction = async () => {
    if (!loadedImage) {
      setStatus('error');
      setError('이미지 파일을 올리거나 캡처 이미지를 붙여넣어 주세요.');
      return;
    }

    const runId = extractionRunRef.current + 1;
    extractionRunRef.current = runId;
    setCopied(false);
    setError(null);
    setText('');
    setResultConfidence(null);
    setStatus('processing');

    try {
      const result = await extractTextFromImage(loadedImage.file, selectionRect);
      if (extractionRunRef.current !== runId) return;
      if (!result.text) {
        setStatus('error');
        setError(EMPTY_RESULT_MESSAGE);
        return;
      }
      setText(result.text);
      setResultConfidence(result.confidence);
      setStatus('done');
    } catch {
      if (extractionRunRef.current !== runId) return;
      setStatus('error');
      setError(EMPTY_RESULT_MESSAGE);
    }
  };

  const getNaturalPoint = (event: PointerEvent<HTMLDivElement>) => {
    const image = previewImageRef.current;
    if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return null;

    const rect = image.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    return {
      x: (x / rect.width) * image.naturalWidth,
      y: (y / rect.height) * image.naturalHeight,
    };
  };

  const startSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!selectionMode || processing) return;
    const point = getNaturalPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    selectionStartRef.current = point;
    setSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!selectionMode || !selectionStartRef.current) return;
    const point = getNaturalPoint(event);
    if (!point) return;

    const start = selectionStartRef.current;
    setSelectionRect({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const finishSelection = () => {
    selectionStartRef.current = null;
    setSelectionRect((current) => {
      if (!current || current.width < 8 || current.height < 8) return null;
      return current;
    });
    setSelectionMode(false);
  };

  const handlePaste = (event: ClipboardEvent) => {
    if (processing) return;
    const file = getClipboardImageFile(event);
    if (!file) return;

    event.preventDefault();
    setImageFromFile(file, '붙여넣은 이미지');
  };

  const downloadTxt = () => {
    if (!hasText) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${DOWNLOAD_BASENAME}.txt`);
  };

  const downloadCsv = () => {
    if (!hasText) return;
    const blob = new Blob([`\uFEFF${makeCsv(text)}`], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${DOWNLOAD_BASENAME}.csv`);
  };

  const downloadXlsx = () => {
    if (!hasText) return;
    const worksheet = XLSX.utils.aoa_to_sheet(textToRows(text));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '추출된 글자');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `${DOWNLOAD_BASENAME}.xlsx`);
  };

  const copyText = async () => {
    if (!hasText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('복사하지 못했습니다. 텍스트를 직접 선택해서 복사해 주세요.');
    }
  };

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (pasteHintTimerRef.current) window.clearTimeout(pasteHintTimerRef.current);
    };
  }, []);

  const confidenceLabel =
    resultConfidence === null ? null : resultConfidence >= 80 ? '좋음' : resultConfidence >= 60 ? '보통' : '낮음';
  const isSmallImage = naturalSize ? naturalSize.width < 800 || naturalSize.height < 400 : false;
  const selectionStyle =
    selectionRect && naturalSize
      ? {
          left: `${(selectionRect.x / naturalSize.width) * 100}%`,
          top: `${(selectionRect.y / naturalSize.height) * 100}%`,
          width: `${(selectionRect.width / naturalSize.width) * 100}%`,
          height: `${(selectionRect.height / naturalSize.height) * 100}%`,
        }
      : null;

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <ImageIcon className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">이미지 속 글자 추출</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              이미지 파일을 올리거나 캡처한 화면을 바로 붙여넣으면, 안에 있는 글자를 자동으로 읽어 텍스트로 정리합니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = event.dataTransfer.files[0];
                if (file && !processing) setImageFromFile(file, '업로드한 이미지');
              }}
              className={`flex min-h-56 flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-7 text-center transition ${
                processing
                  ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400'
                  : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'
              }`}
            >
              <Upload className="size-8 text-blue-600" aria-hidden />
              <span className="mt-3 text-base font-bold text-zinc-950">저장된 이미지 파일 업로드</span>
              <span className="mt-2 text-sm leading-relaxed text-zinc-600">
                저장된 이미지 파일이 있다면 선택하거나 이곳에 끌어다 놓으세요.
              </span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={processing}
                className="mt-5 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                파일 선택
              </button>
              <span className="mt-3 text-xs text-zinc-500">JPG, JPEG, PNG, WEBP 지원 · 파일당 최대 20MB</span>
              <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                disabled={processing}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setImageFromFile(file, '업로드한 이미지');
                  event.currentTarget.value = '';
                }}
              />
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={showPasteGuide}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  showPasteGuide();
                }
              }}
              className="flex min-h-56 flex-col items-center justify-center rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-7 text-center transition hover:bg-emerald-50"
            >
              <ClipboardCopy className="size-8 text-emerald-600" aria-hidden />
              <span className="mt-3 text-base font-bold text-zinc-950">캡처 화면 바로 붙여넣기</span>
              <span className="mt-2 text-sm leading-relaxed text-zinc-600">
                방금 화면을 캡처했다면 파일을 찾을 필요 없이 이 화면에서 Ctrl + V를 눌러 붙여넣으세요.
              </span>
              <span className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                붙여넣기 대기 중
              </span>
              <span className="mt-3 text-xs leading-relaxed text-zinc-500">
                예: Win + Shift + S → 캡처 영역 선택 → 이 화면에서 Ctrl + V
              </span>
              {pasteHintVisible ? (
                <span className="mt-3 text-xs font-semibold text-emerald-700">
                  캡처 후 Ctrl + V를 눌러 붙여넣어 주세요.
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm leading-relaxed text-blue-900">
            작은 이미지도 자동으로 확대하고 여러 보정 결과를 비교해 가장 잘 읽힌 결과를 사용합니다. 업로드하거나 붙여넣은
            이미지는 글자 추출 용도로만 사용되며 저장하지 않습니다.
          </div>

          {loadedImage ? (
            <div className="rounded-md border border-blue-200 bg-blue-50/70 p-4 shadow-sm ring-1 ring-blue-100">
              <div className="flex flex-col gap-3">
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-white/90 sm:h-44">
                  <div
                    className={`relative inline-flex max-h-full max-w-full ${selectionMode ? 'cursor-crosshair' : ''}`}
                    onPointerDown={startSelection}
                    onPointerMove={updateSelection}
                    onPointerUp={finishSelection}
                    onPointerCancel={finishSelection}
                  >
                    <img
                      ref={previewImageRef}
                      src={loadedImage.previewUrl}
                      alt="입력한 이미지 미리보기"
                      draggable={false}
                      onLoad={(event) => {
                        setNaturalSize({
                          width: event.currentTarget.naturalWidth,
                          height: event.currentTarget.naturalHeight,
                        });
                      }}
                      className="max-h-44 max-w-full select-none object-contain sm:max-h-52"
                    />
                    {selectionStyle ? (
                      <span
                        className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/15 shadow-[0_0_0_9999px_rgba(15,23,42,0.18)]"
                        style={selectionStyle}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white/90 px-3 py-2 ring-1 ring-blue-100">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-blue-700">{loadedImage.sourceLabel}</p>
                    <p className="truncate text-sm font-bold text-zinc-950">{loadedImage.name}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {formatBytes(loadedImage.size)}
                  </span>
                </div>
                {isSmallImage ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                    이미지 크기가 작아 일부 글자가 다르게 인식될 수 있습니다. 자동 확대 보정을 적용하지만, 가능하면 더 크게
                    캡처하거나 읽을 영역만 선택해 주세요.
                  </div>
                ) : null}
                <div className="rounded-lg bg-white/90 p-3 text-xs leading-relaxed text-zinc-600 ring-1 ring-blue-100">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-zinc-900">읽을 영역 선택</p>
                      <p className="mt-1">필요한 부분만 선택하면 더 정확하게 읽을 수 있습니다.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectionMode((current) => !current)}
                        disabled={processing}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:text-zinc-400"
                      >
                        {selectionMode ? '선택 중' : '읽을 영역 선택'}
                      </button>
                      {selectionRect ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectionRect(null);
                            setSelectionMode(false);
                          }}
                          disabled={processing}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-400"
                        >
                          선택 해제
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {selectionRect ? (
                    <p className="mt-2 font-semibold text-blue-700">선택한 영역만 읽습니다.</p>
                  ) : selectionMode ? (
                    <p className="mt-2 font-semibold text-blue-700">미리보기에서 읽을 부분을 드래그해 주세요.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-center text-sm leading-relaxed text-zinc-500">
              아직 입력한 이미지가 없습니다. 저장된 이미지 파일을 올리거나 캡처 이미지를 바로 붙여넣어 주세요.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void runExtraction()}
              disabled={!loadedImage || processing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              {processing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScanText className="size-4" aria-hidden />}
              {processing ? '이미지 속 글자를 읽는 중입니다...' : status === 'error' ? '다시 시도' : '글자 추출'}
            </button>
            <button
              type="button"
              onClick={resetAll}
              disabled={processing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
            >
              <RotateCcw className="size-4" aria-hidden />
              초기화
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <div>
          <div>
            <h3 className="text-lg font-bold text-zinc-950">추출된 글자</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              추출한 글자는 직접 수정한 뒤 복사하거나 TXT, CSV, 엑셀 파일로 다운로드할 수 있습니다.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              글자가 작거나 배경이 복잡한 이미지는 자동 보정 후에도 일부 글자가 다르게 인식될 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {confidenceLabel ? (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                  읽기 상태: {confidenceLabel}
                </span>
              ) : null}
              <button
                type="button"
                onClick={copyText}
                disabled={!hasText || processing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                <ClipboardCopy className="size-4" aria-hidden />
                {copied ? '복사됨' : '복사하기'}
              </button>
            </div>
          </div>
        </div>

        {processing ? (
          <div className="mt-5 flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
            <Loader2 className="size-8 animate-spin text-blue-600" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-blue-900">이미지 속 글자를 읽는 중입니다...</p>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setCopied(false);
              if (status === 'error' && error === EMPTY_RESULT_MESSAGE) {
                setStatus(event.target.value.trim() ? 'done' : loadedImage ? 'ready' : 'initial');
                setError(null);
              }
            }}
            placeholder={
              status === 'initial'
                ? '이미지를 올리거나 캡처 이미지를 붙여넣으면 추출된 글자가 여기에 표시됩니다.'
                : status === 'ready'
                  ? '글자 추출 버튼을 누르면 결과가 여기에 표시됩니다.'
                  : '추출된 글자를 확인하고 필요하면 직접 수정해 주세요.'
            }
            className="mt-5 min-h-80 w-full resize-y rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={downloadTxt}
            disabled={!canDownload}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <FileText className="size-4" aria-hidden />
            TXT 다운로드
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!canDownload}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <Download className="size-4" aria-hidden />
            CSV 다운로드
          </button>
          <button
            type="button"
            onClick={downloadXlsx}
            disabled={!canDownload}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <Download className="size-4" aria-hidden />
            XLSX 다운로드
          </button>
        </div>

        {!hasText && !processing ? (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-center text-sm leading-relaxed text-zinc-500">
            {status === 'error'
              ? '실패 안내를 확인한 뒤 더 선명한 이미지로 다시 시도해 주세요.'
              : '추출된 글자가 있으면 복사와 다운로드 버튼을 사용할 수 있습니다.'}
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          이미지 글자 추출은 원본 이미지의 선명도에 따라 결과가 달라질 수 있습니다. 글자가 작거나 주변 내용이 많다면 읽을
          영역 선택을 사용해 주세요.
        </p>
      </section>
    </div>
  );
}
