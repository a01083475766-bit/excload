'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownRight, Download, Image as ImageIcon, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import JSZip from 'jszip';
import { canvasToBlobWithFallback, safeRandomId } from '@/app/free-tools/_utils/browserCompatibility';

type ResizeMode = 'original' | 'percent' | 'max-width' | 'pixel-width' | 'pixel-height';
type QualityMode = 'high' | 'normal' | 'small' | 'custom';
type OutputFormat = 'original' | 'image/jpeg' | 'image/webp';
type ItemStatus = 'ready' | 'processing' | 'done' | 'failed' | 'stale';
type ApplyMode = 'global' | 'individual';

type ImageSettings = {
  resizeMode: ResizeMode;
  percent: number;
  maxWidth: number;
  pixelWidth: number;
  pixelHeight: number;
  quality: number;
  outputFormat: OutputFormat;
};

type ImageItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: ItemStatus;
  originalWidth?: number;
  originalHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  outputBlob?: Blob;
  outputName?: string;
  originalPreviewUrl: string;
  outputPreviewUrl?: string;
  customSettings?: ImageSettings;
  settingsOpen?: boolean;
  error?: string;
};

const MAX_FILES = 20;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ko-KR')}KB`;
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'image';
}

function getMimeFromFile(file: File) {
  const extension = getExtension(file.name);
  if (file.type && ACCEPTED_TYPES.includes(file.type)) return file.type;
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return '';
}

function getExtensionFromMime(mime: string) {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

function makeDownloadName(fileName: string, mime: string) {
  return `${getBaseName(fileName)}_compressed.${getExtensionFromMime(mime)}`;
}

function getFileReductionSummary(originalSize: number, outputSize?: number) {
  if (!outputSize) return '처리 전입니다.';
  const diff = originalSize - outputSize;
  if (diff < 0) {
    return `파일 용량이 원본보다 ${formatBytes(Math.abs(diff))} 커졌습니다. 품질이나 이미지 크기를 더 낮춰 보세요.`;
  }
  const percent = originalSize > 0 ? Math.round((diff / originalSize) * 100) : 0;
  return `파일 용량 ${percent}% 감소`;
}

function getPixelReductionSummary(item: ImageItem) {
  if (!item.originalWidth || !item.originalHeight || !item.outputWidth || !item.outputHeight) {
    return '이미지 크기 계산 전';
  }
  const originalPixels = item.originalWidth * item.originalHeight;
  const outputPixels = item.outputWidth * item.outputHeight;
  const reduction = originalPixels > 0 ? Math.max(0, Math.round(((originalPixels - outputPixels) / originalPixels) * 100)) : 0;
  return `이미지 크기 ${reduction}% 감소`;
}

function getQualityLabel(quality: number) {
  return `품질 ${Math.round(quality * 100)}%`;
}

function getFormatLabel(outputFormat: OutputFormat) {
  if (outputFormat === 'image/jpeg') return 'JPG';
  if (outputFormat === 'image/webp') return 'WEBP';
  return '원본 형식';
}

function getTransformLabelFromSettings(settings: ImageSettings) {
  if (settings.resizeMode === 'percent') return `${settings.percent}%로 축소`;
  if (settings.resizeMode === 'max-width') return `가로 ${settings.maxWidth.toLocaleString('ko-KR')}px로 축소`;
  if (settings.resizeMode === 'pixel-width') return `가로 ${settings.pixelWidth.toLocaleString('ko-KR')}px로 축소`;
  if (settings.resizeMode === 'pixel-height') return `세로 ${settings.pixelHeight.toLocaleString('ko-KR')}px로 축소`;
  return '품질 최적화';
}

function getSettingsSummary(settings: ImageSettings) {
  const sizeLabel =
    settings.resizeMode === 'percent'
      ? `${settings.percent}% 축소`
      : settings.resizeMode === 'max-width'
        ? `최대 가로 ${settings.maxWidth.toLocaleString('ko-KR')}px`
        : settings.resizeMode === 'pixel-width'
          ? `가로 ${settings.pixelWidth.toLocaleString('ko-KR')}px`
          : settings.resizeMode === 'pixel-height'
            ? `세로 ${settings.pixelHeight.toLocaleString('ko-KR')}px`
            : '원본 크기';

  return `${sizeLabel} · ${getQualityLabel(settings.quality)} · ${getFormatLabel(settings.outputFormat)}`;
}

function getPixelSizeError(label: '가로' | '세로', value: number) {
  if (!Number.isFinite(value) || value === 0) return `${label} 크기를 숫자로 입력해 주세요.`;
  if (value < 50) return `${label} 크기를 50px 이상 입력해 주세요.`;
  if (value > 10000) return `${label} 크기는 10000px 이하로 입력해 주세요.`;
  return null;
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

async function blobFromCanvas(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return canvasToBlobWithFallback(canvas, mime, mime === 'image/png' ? undefined : quality);
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
      // Some mobile browsers expose createImageBitmap but fail on certain JPGs/options.
      return loadImageElement(file);
    }
  }

  return loadImageElement(file);
}

function calculateTargetSize(
  width: number,
  height: number,
  resizeMode: ResizeMode,
  percent: number,
  maxWidth: number,
  pixelWidth: number,
  pixelHeight: number,
) {
  if (resizeMode === 'percent') {
    const ratio = Math.min(1, Math.max(0.1, percent / 100));
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
    };
  }

  if (resizeMode === 'max-width' && width > maxWidth) {
    const ratio = maxWidth / width;
    return {
      width: Math.round(width * ratio),
      height: Math.max(1, Math.round(height * ratio)),
    };
  }

  if (resizeMode === 'pixel-width' && width > pixelWidth) {
    const ratio = pixelWidth / width;
    return {
      width: Math.round(width * ratio),
      height: Math.max(1, Math.round(height * ratio)),
    };
  }

  if (resizeMode === 'pixel-height' && height > pixelHeight) {
    const ratio = pixelHeight / height;
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.round(height * ratio),
    };
  }

  return { width, height };
}

function revokeItemUrls(item: ImageItem, includeOriginal = true) {
  if (includeOriginal) URL.revokeObjectURL(item.originalPreviewUrl);
  if (item.outputPreviewUrl) URL.revokeObjectURL(item.outputPreviewUrl);
}

function PreviewFrame({
  label,
  badgeClassName,
  src,
  alt,
  meta,
  placeholder,
}: {
  label: string;
  badgeClassName: string;
  src?: string;
  alt: string;
  meta: string;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClassName}`}>
          {label}
        </span>
        <span className="truncate text-xs text-zinc-500">{meta}</span>
      </div>
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0]">
        {src ? (
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="px-4 text-center text-xs leading-relaxed text-zinc-500">{placeholder}</p>
        )}
      </div>
    </div>
  );
}

export function ImageCompressor() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<ImageItem[]>([]);
  const lastAutoProcessSignatureRef = useRef('');
  const [items, setItems] = useState<ImageItem[]>([]);
  const [applyMode, setApplyMode] = useState<ApplyMode>('global');
  const [resizeMode, setResizeMode] = useState<ResizeMode>('original');
  const [percentPreset, setPercentPreset] = useState('80');
  const [customPercent, setCustomPercent] = useState('80');
  const [maxWidthPreset, setMaxWidthPreset] = useState('1280');
  const [customMaxWidth, setCustomMaxWidth] = useState('1200');
  const [pixelWidthInput, setPixelWidthInput] = useState('800');
  const [pixelHeightInput, setPixelHeightInput] = useState('800');
  const [qualityMode, setQualityMode] = useState<QualityMode>('normal');
  const [customQuality, setCustomQuality] = useState('80');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('original');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const completedItems = items.filter((item) => item.status === 'done' && item.outputBlob);
  const canEdit = !processing;
  const previewItem = items.find((item) => item.id === previewItemId) ?? null;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => revokeItemUrls(item));
    };
  }, []);

  useEffect(() => {
    if (!previewItemId) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewItemId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewItemId]);

  const getQuality = () => {
    if (qualityMode === 'high') return 0.9;
    if (qualityMode === 'small') return 0.7;
    if (qualityMode === 'custom') return Math.min(100, Math.max(10, Number(customQuality) || 80)) / 100;
    return 0.8;
  };

  const getPercent = () => {
    const value = percentPreset === 'custom' ? customPercent : percentPreset;
    return Math.min(100, Math.max(10, Number(value) || 80));
  };

  const getMaxWidth = () => {
    const value = maxWidthPreset === 'custom' ? customMaxWidth : maxWidthPreset;
    return Math.max(1, Number(value) || 1280);
  };

  const getPixelWidth = () => Number(pixelWidthInput);
  const getPixelHeight = () => Number(pixelHeightInput);

  const globalSettings: ImageSettings = {
    resizeMode,
    percent: getPercent(),
    maxWidth: getMaxWidth(),
    pixelWidth: getPixelWidth(),
    pixelHeight: getPixelHeight(),
    quality: getQuality(),
    outputFormat,
  };

  const resetResults = (nextItems = items) => {
    setItems(
      nextItems.map((item) => {
        if (item.outputPreviewUrl) URL.revokeObjectURL(item.outputPreviewUrl);

        return {
          ...item,
          status: 'ready',
          outputWidth: undefined,
          outputHeight: undefined,
          outputBlob: undefined,
          outputName: undefined,
          outputPreviewUrl: undefined,
          error: undefined,
        };
      }),
    );
  };

  const invalidateProcessedItems = (usesGlobalOnly: boolean) => {
    setItems((prev) =>
      prev.map((item) => {
        if (usesGlobalOnly && item.customSettings) return item;
        if (item.status !== 'done' && item.status !== 'failed') return item;
        if (item.outputPreviewUrl) URL.revokeObjectURL(item.outputPreviewUrl);

        return {
          ...item,
          status: 'stale',
          outputWidth: undefined,
          outputHeight: undefined,
          outputBlob: undefined,
          outputName: undefined,
          outputPreviewUrl: undefined,
          error: '설정이 변경되었습니다. 이미지 줄이기를 다시 실행해 주세요.',
        };
      }),
    );
  };

  const updateSetting = (callback: () => void) => {
    callback();
    invalidateProcessedItems(applyMode === 'individual');
  };

  const getEffectiveSettings = (item: ImageItem) =>
    applyMode === 'individual' && item.customSettings ? item.customSettings : globalSettings;

  const updateItemCustomSettings = (id: string, patch: Partial<ImageSettings>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextSettings = {
          ...(item.customSettings ?? globalSettings),
          ...patch,
        };

        if (item.outputPreviewUrl) URL.revokeObjectURL(item.outputPreviewUrl);

        return {
          ...item,
          customSettings: nextSettings,
          status: item.status === 'done' || item.status === 'failed' ? 'stale' : item.status,
          outputWidth: undefined,
          outputHeight: undefined,
          outputBlob: undefined,
          outputName: undefined,
          outputPreviewUrl: undefined,
          error:
            item.status === 'done' || item.status === 'failed'
              ? '설정이 변경되었습니다. 이미지 줄이기를 다시 실행해 주세요.'
              : item.error,
        };
      }),
    );
  };

  const toggleItemSettings = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              settingsOpen: !item.settingsOpen,
              customSettings: item.customSettings ?? globalSettings,
            }
          : item,
      ),
    );
  };

  const resetItemToGlobal = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (item.outputPreviewUrl) URL.revokeObjectURL(item.outputPreviewUrl);

        return {
          ...item,
          customSettings: undefined,
          settingsOpen: false,
          status: item.status === 'done' || item.status === 'failed' ? 'stale' : item.status,
          outputWidth: undefined,
          outputHeight: undefined,
          outputBlob: undefined,
          outputName: undefined,
          outputPreviewUrl: undefined,
          error:
            item.status === 'done' || item.status === 'failed'
              ? '설정이 변경되었습니다. 이미지 줄이기를 다시 실행해 주세요.'
              : item.error,
        };
      }),
    );
  };

  const addFiles = (fileList: FileList | File[]) => {
    if (!canEdit) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const availableSlots = MAX_FILES - items.length;
    if (availableSlots <= 0 || files.length > availableSlots) {
      setError('이미지는 최대 20개까지 올릴 수 있습니다.');
      return;
    }

    const nextItems: ImageItem[] = [];
    for (const file of files) {
      const extension = getExtension(file.name);
      const mime = getMimeFromFile(file);

      if (!mime || !ACCEPTED_EXTENSIONS.includes(extension)) {
        setError('JPG, JPEG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} 파일은 20MB를 초과했습니다.`);
        return;
      }

      nextItems.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${safeRandomId('image')}`,
        file,
        name: file.name,
        size: file.size,
        type: mime,
        status: 'ready',
        originalPreviewUrl: URL.createObjectURL(file),
      });
    }

    setError(null);
    setItems((prev) => [...prev, ...nextItems]);
  };

  const removeItem = (id: string) => {
    if (!canEdit) return;
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) revokeItemUrls(target);
      return prev.filter((item) => item.id !== id);
    });
    if (previewItemId === id) setPreviewItemId(null);
  };

  const clearAll = () => {
    if (!canEdit) return;
    items.forEach((item) => revokeItemUrls(item));
    setItems([]);
    setPreviewItemId(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const resetSettings = () => {
    if (!canEdit) return;
    setResizeMode('original');
    setPercentPreset('80');
    setCustomPercent('80');
    setMaxWidthPreset('1280');
    setCustomMaxWidth('1200');
    setPixelWidthInput('800');
    setPixelHeightInput('800');
    setQualityMode('normal');
    setCustomQuality('80');
    setOutputFormat('original');
    resetResults();
  };

  const processOne = async (item: ImageItem, settings: ImageSettings) => {
    const bitmap = await loadBitmap(item.file);
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const targetSize = calculateTargetSize(
      originalWidth,
      originalHeight,
      settings.resizeMode,
      settings.percent,
      settings.maxWidth,
      settings.pixelWidth,
      settings.pixelHeight,
    );
    const mime = settings.outputFormat === 'original' ? item.type : settings.outputFormat;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;
    const context = canvas.getContext('2d');

    if (!context) throw new Error('canvas_failed');

    if (mime === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(bitmap, 0, 0, targetSize.width, targetSize.height);
    const outputBlob = await blobFromCanvas(canvas, mime, settings.quality);

    if ('close' in bitmap && typeof bitmap.close === 'function') {
      bitmap.close();
    }

    canvas.width = 0;
    canvas.height = 0;

    return {
      originalWidth,
      originalHeight,
      outputWidth: targetSize.width,
      outputHeight: targetSize.height,
      outputBlob,
      outputName: makeDownloadName(item.name, mime),
    };
  };

  const processImages = async () => {
    if (items.length === 0) {
      setError('이미지를 먼저 선택하거나 드래그해서 첨부해 주세요.');
      return;
    }

    const invalidPixelSetting = items
      .map((item) => getEffectiveSettings(item))
      .find(
        (settings) =>
          (settings.resizeMode === 'pixel-width' && (settings.pixelWidth < 50 || settings.pixelWidth > 10000)) ||
          (settings.resizeMode === 'pixel-height' && (settings.pixelHeight < 50 || settings.pixelHeight > 10000)),
      );

    if (invalidPixelSetting) {
      const invalidValue =
        invalidPixelSetting.resizeMode === 'pixel-height'
          ? invalidPixelSetting.pixelHeight
          : invalidPixelSetting.pixelWidth;
      setError(
        invalidValue < 50
          ? `${invalidPixelSetting.resizeMode === 'pixel-height' ? '세로' : '가로'} 크기를 50px 이상 입력해 주세요.`
          : `${invalidPixelSetting.resizeMode === 'pixel-height' ? '세로' : '가로'} 크기는 10000px 이하로 입력해 주세요.`,
      );
      return;
    }

    setProcessing(true);
    setError(null);

    for (const item of items) {
      setItems((prev) =>
        prev.map((current) => {
          if (current.id !== item.id) return current;
          if (current.outputPreviewUrl) URL.revokeObjectURL(current.outputPreviewUrl);
          return {
            ...current,
            status: 'processing',
            outputWidth: undefined,
            outputHeight: undefined,
            outputBlob: undefined,
            outputName: undefined,
            outputPreviewUrl: undefined,
            error: undefined,
          };
        }),
      );

      try {
        const effectiveSettings = getEffectiveSettings(item);
        const output = await processOne(item, effectiveSettings);
        const outputPreviewUrl = URL.createObjectURL(output.outputBlob);
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  status: 'done',
                  ...output,
                  outputPreviewUrl,
                }
              : current,
          ),
        );
      } catch {
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  status: 'failed',
                  error: '이미지를 읽거나 변환하지 못했습니다.',
                }
              : current,
          ),
        );
      }
    }

    setProcessing(false);
  };

  const downloadAll = async () => {
    if (completedItems.length === 0) {
      setError('다운로드할 변환 결과가 없습니다.');
      return;
    }

    const zip = new JSZip();
    completedItems.forEach((item) => {
      if (item.outputBlob && item.outputName) {
        zip.file(item.outputName, item.outputBlob);
      }
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'excload-images.zip');
  };

  const statusLabel: Record<ItemStatus, string> = {
    ready: '대기',
    processing: '처리 중',
    done: '완료',
    failed: '실패',
    stale: '다시 처리 필요',
  };
  const globalPixelWidthError =
    resizeMode === 'pixel-width' ? getPixelSizeError('가로', globalSettings.pixelWidth) : null;
  const globalPixelHeightError =
    resizeMode === 'pixel-height' ? getPixelSizeError('세로', globalSettings.pixelHeight) : null;
  const autoProcessSignature = JSON.stringify({
    applyMode,
    globalSettings,
    items: items.map((item) => ({
      id: item.id,
      customSettings: item.customSettings ?? null,
    })),
  });

  useEffect(() => {
    if (items.length === 0 || processing || globalPixelWidthError || globalPixelHeightError) return undefined;
    if (lastAutoProcessSignatureRef.current === autoProcessSignature) return undefined;

    lastAutoProcessSignatureRef.current = autoProcessSignature;
    const timeoutId = window.setTimeout(() => {
      void processImages();
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [autoProcessSignature, globalPixelHeightError, globalPixelWidthError, items.length, processing]);

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <ImageIcon className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">이미지 업로드와 설정</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              이미지를 올리면 크기와 용량을 줄여 다운로드할 수 있습니다. 파일은 서버로 전송되지 않고
              사용자의 브라우저에서만 처리됩니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <label
              tabIndex={0}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && canEdit) {
                  event.preventDefault();
                  inputRef.current?.click();
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
                addFiles(event.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center ${
                canEdit
                  ? 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-400'
              }`}
            >
              <Upload className="size-8 text-blue-600" aria-hidden />
              <span className="mt-3 text-sm font-bold text-zinc-950">이미지를 선택하거나 드래그해서 첨부해 주세요.</span>
              <span className="mt-1 text-xs text-zinc-500">JPG, PNG, WEBP 지원 · 최대 20개 · 파일당 20MB</span>
              <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                multiple
                disabled={!canEdit}
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!canEdit}
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              이미지 추가
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={!canEdit}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
            >
              전체 삭제
            </button>
            <button
              type="button"
              onClick={resetSettings}
              disabled={!canEdit}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
            >
              <RotateCcw className="size-4" aria-hidden />
              설정 초기화
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-950">크기 설정</p>
            <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-bold text-zinc-800">설정 적용 방식</p>
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="radio"
                    name="applyMode"
                    value="global"
                    checked={applyMode === 'global'}
                    disabled={!canEdit}
                    onChange={() => {
                      setApplyMode('global');
                      invalidateProcessedItems(false);
                    }}
                  />
                  모든 이미지에 같은 설정 적용
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="radio"
                    name="applyMode"
                    value="individual"
                    checked={applyMode === 'individual'}
                    disabled={!canEdit}
                    onChange={() => {
                      setApplyMode('individual');
                      invalidateProcessedItems(false);
                    }}
                  />
                  이미지마다 다르게 설정
                </label>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-blue-700">
                {applyMode === 'individual'
                  ? '개별 설정한 이미지는 해당 설정으로 처리되며, 나머지 이미지는 위의 공통 설정으로 처리됩니다.'
                  : '현재 설정은 업로드한 모든 이미지에 동일하게 적용됩니다.'}
              </p>
            </div>
            <div className="mt-3 space-y-3">
              {[
                ['original', '원본 크기 유지'],
                ['percent', '비율로 줄이기'],
                ['max-width', '최대 가로 크기 지정'],
                ['pixel-width', '가로 픽셀 직접 입력'],
                ['pixel-height', '세로 픽셀 직접 입력'],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="radio"
                    name="resizeMode"
                    value={value}
                    checked={resizeMode === value}
                    disabled={!canEdit}
                    onChange={() => updateSetting(() => setResizeMode(value as ResizeMode))}
                  />
                  {label}
                </label>
              ))}
            </div>

            {resizeMode === 'percent' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">비율 선택</span>
                  <select
                    value={percentPreset}
                    disabled={!canEdit}
                    onChange={(event) => updateSetting(() => setPercentPreset(event.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="90">90%</option>
                    <option value="80">80%</option>
                    <option value="70">70%</option>
                    <option value="50">50%</option>
                    <option value="custom">직접 입력</option>
                  </select>
                </label>
                {percentPreset === 'custom' && (
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">직접 입력(10~100%)</span>
                    <input
                      value={customPercent}
                      disabled={!canEdit}
                      onChange={(event) => updateSetting(() => setCustomPercent(event.target.value.replace(/\D/g, '').slice(0, 3)))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                )}
              </div>
            )}

            {resizeMode === 'max-width' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">최대 가로 크기</span>
                  <select
                    value={maxWidthPreset}
                    disabled={!canEdit}
                    onChange={(event) => updateSetting(() => setMaxWidthPreset(event.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="1920">1920px</option>
                    <option value="1280">1280px</option>
                    <option value="1024">1024px</option>
                    <option value="800">800px</option>
                    <option value="custom">직접 입력</option>
                  </select>
                </label>
                {maxWidthPreset === 'custom' && (
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">직접 입력(px)</span>
                    <input
                      value={customMaxWidth}
                      disabled={!canEdit}
                      onChange={(event) => updateSetting(() => setCustomMaxWidth(event.target.value.replace(/\D/g, '').slice(0, 5)))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                )}
              </div>
            )}

            {resizeMode === 'pixel-width' && (
              <div className="mt-4 rounded-lg border border-blue-100 bg-white p-4">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">가로 크기 입력</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={pixelWidthInput}
                      disabled={!canEdit}
                      onChange={(event) => updateSetting(() => setPixelWidthInput(event.target.value.replace(/\D/g, '').slice(0, 5)))}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${
                        globalPixelWidthError ? 'border-red-300' : 'border-zinc-200'
                      }`}
                    />
                    <span className="text-sm font-semibold text-zinc-600">px</span>
                  </div>
                </label>
                {globalPixelWidthError && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                    {globalPixelWidthError}
                  </p>
                )}
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  원하는 가로 크기를 픽셀(px)로 입력해 주세요. 세로 크기는 이미지 비율에 맞게 자동으로
                  조정됩니다. 원본보다 작은 이미지는 확대하지 않습니다.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-blue-700">
                  입력한 가로 크기는 모든 이미지에 동일하게 적용됩니다. 세로 크기는 각 이미지의 원본
                  비율에 따라 자동으로 계산됩니다.
                </p>
              </div>
            )}

            {resizeMode === 'pixel-height' && (
              <div className="mt-4 rounded-lg border border-blue-100 bg-white p-4">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">세로 크기 입력</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={pixelHeightInput}
                      disabled={!canEdit}
                      onChange={(event) => updateSetting(() => setPixelHeightInput(event.target.value.replace(/\D/g, '').slice(0, 5)))}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${
                        globalPixelHeightError ? 'border-red-300' : 'border-zinc-200'
                      }`}
                    />
                    <span className="text-sm font-semibold text-zinc-600">px</span>
                  </div>
                </label>
                {globalPixelHeightError && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                    {globalPixelHeightError}
                  </p>
                )}
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  원하는 세로 크기를 픽셀(px)로 입력해 주세요. 가로 크기는 이미지 비율에 맞게 자동으로
                  조정됩니다. 원본보다 작은 이미지는 확대하지 않습니다.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-blue-700">
                  입력한 세로 크기는 모든 이미지에 동일하게 적용됩니다. 가로 크기는 각 이미지의 원본
                  비율에 따라 자동으로 계산됩니다.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-950">품질과 결과 형식</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">품질</span>
                <select
                  value={qualityMode}
                  disabled={!canEdit}
                  onChange={(event) => updateSetting(() => setQualityMode(event.target.value as QualityMode))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="high">높은 품질 90%</option>
                  <option value="normal">일반 품질 80%</option>
                  <option value="small">작은 용량 70%</option>
                  <option value="custom">직접 설정</option>
                </select>
              </label>

              {qualityMode === 'custom' && (
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">직접 품질(10~100%)</span>
                  <input
                    value={customQuality}
                    disabled={!canEdit}
                    onChange={(event) => updateSetting(() => setCustomQuality(event.target.value.replace(/\D/g, '').slice(0, 3)))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
              )}

              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-zinc-600">결과 형식</span>
                <select
                  value={outputFormat}
                  disabled={!canEdit}
                  onChange={(event) => updateSetting(() => setOutputFormat(event.target.value as OutputFormat))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="original">원본 형식 유지</option>
                  <option value="image/jpeg">JPG</option>
                  <option value="image/webp">WEBP</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-amber-700">
              PNG는 원본 형식을 유지하면 용량이 크게 줄지 않을 수 있습니다. 더 작은 용량이 필요하면 JPG
              또는 WEBP를 선택해 주세요.
            </p>
          </div>

          <button
            type="button"
            onClick={processImages}
            disabled={processing}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {processing ? '처리 중...' : '이미지 줄이기'}
          </button>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900">
            업로드한 이미지는 서버로 전송되지 않습니다. 이미지 크기 조절과 용량 줄이기는 사용자의
            브라우저에서만 처리됩니다. 페이지를 닫거나 새로고침하면 작업 내용은 사라집니다.
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-950">이미지 목록과 결과</h3>
            <p className="mt-2 text-sm text-zinc-600">파일별 처리 상태와 줄어든 용량을 확인할 수 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={() => void downloadAll()}
            disabled={completedItems.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-500"
          >
            <Download className="size-4" aria-hidden />
            전체 다운로드
          </button>
        </div>

        {items.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-center text-sm text-zinc-500">
            이미지를 추가하면 이곳에 처리 결과가 표시됩니다.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {items.map((item) => {
              const hasOutput = item.status === 'done' && item.outputBlob && item.outputName;
              const effectiveSettings = getEffectiveSettings(item);
              const itemPixelWidthError =
                effectiveSettings.resizeMode === 'pixel-width'
                  ? getPixelSizeError('가로', effectiveSettings.pixelWidth)
                  : null;
              const itemPixelHeightError =
                effectiveSettings.resizeMode === 'pixel-height'
                  ? getPixelSizeError('세로', effectiveSettings.pixelHeight)
                  : null;
              return (
                <div key={item.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-zinc-950">{item.name}</p>
                        {applyMode === 'individual' && item.customSettings && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            개별설정 적용
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{getSettingsSummary(effectiveSettings)}</p>
                      {item.error && <p className="mt-2 text-xs text-red-700">{item.error}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          item.status === 'done'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : item.status === 'processing'
                                ? 'bg-blue-100 text-blue-700'
                                : item.status === 'stale'
                                  ? 'bg-amber-100 text-amber-700'
                                : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {statusLabel[item.status]}
                      </span>
                      {applyMode === 'individual' && (
                        <button
                          type="button"
                          onClick={() => toggleItemSettings(item.id)}
                          disabled={!canEdit}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:text-zinc-400"
                        >
                          개별설정
                        </button>
                      )}
                      {hasOutput && (
                        <button
                          type="button"
                          onClick={() => setPreviewItemId(item.id)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          크게 보기
                        </button>
                      )}
                      {hasOutput && (
                        <button
                          type="button"
                          onClick={() => item.outputBlob && item.outputName && downloadBlob(item.outputBlob, item.outputName)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Download className="size-3.5" aria-hidden />
                          다운로드
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={!canEdit}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-400"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        삭제
                      </button>
                    </div>
                  </div>

                  {applyMode === 'individual' && item.settingsOpen && (
                    <div className="mt-4 rounded-lg border border-blue-100 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-bold text-zinc-950">이 이미지 개별 설정</p>
                        <button
                          type="button"
                          onClick={() => resetItemToGlobal(item.id)}
                          disabled={!canEdit}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-400"
                        >
                          전체 설정으로 되돌리기
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-medium text-zinc-600">크기 설정</span>
                          <select
                            value={effectiveSettings.resizeMode}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItemCustomSettings(item.id, { resizeMode: event.target.value as ResizeMode })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="original">원본 크기 유지</option>
                            <option value="percent">비율로 줄이기</option>
                            <option value="max-width">최대 가로 크기 지정</option>
                            <option value="pixel-width">가로 픽셀 직접 입력</option>
                            <option value="pixel-height">세로 픽셀 직접 입력</option>
                          </select>
                        </label>

                        {effectiveSettings.resizeMode === 'percent' && (
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">비율 선택</span>
                            <select
                              value={[90, 80, 70, 50].includes(effectiveSettings.percent) ? String(effectiveSettings.percent) : 'custom'}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateItemCustomSettings(item.id, {
                                  percent: event.target.value === 'custom' ? effectiveSettings.percent : Number(event.target.value),
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="90">90%</option>
                              <option value="80">80%</option>
                              <option value="70">70%</option>
                              <option value="50">50%</option>
                              <option value="custom">직접 입력</option>
                            </select>
                          </label>
                        )}

                        {effectiveSettings.resizeMode === 'percent' && (
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">직접 입력/현재값(10~100%)</span>
                            <input
                              value={String(effectiveSettings.percent)}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateItemCustomSettings(item.id, {
                                  percent: Math.min(100, Math.max(10, Number(event.target.value.replace(/\D/g, '')) || 10)),
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        )}

                        {effectiveSettings.resizeMode === 'max-width' && (
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">최대 가로 크기</span>
                            <select
                              value={[1920, 1280, 1024, 800].includes(effectiveSettings.maxWidth) ? String(effectiveSettings.maxWidth) : 'custom'}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateItemCustomSettings(item.id, {
                                  maxWidth: event.target.value === 'custom' ? effectiveSettings.maxWidth : Number(event.target.value),
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="1920">1920px</option>
                              <option value="1280">1280px</option>
                              <option value="1024">1024px</option>
                              <option value="800">800px</option>
                              <option value="custom">직접 입력</option>
                            </select>
                          </label>
                        )}

                        {effectiveSettings.resizeMode === 'max-width' && (
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">직접 입력/현재값(px)</span>
                            <input
                              value={String(effectiveSettings.maxWidth)}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateItemCustomSettings(item.id, {
                                  maxWidth: Math.max(1, Number(event.target.value.replace(/\D/g, '')) || 1),
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        )}

                        {effectiveSettings.resizeMode === 'pixel-width' && (
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-zinc-600">가로 크기 입력</span>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                value={String(effectiveSettings.pixelWidth || '')}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateItemCustomSettings(item.id, {
                                    pixelWidth: Number(event.target.value.replace(/\D/g, '').slice(0, 5)),
                                  })
                                }
                                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${
                                  itemPixelWidthError ? 'border-red-300' : 'border-zinc-200'
                                }`}
                              />
                              <span className="text-sm font-semibold text-zinc-600">px</span>
                            </div>
                            {itemPixelWidthError && (
                              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                                {itemPixelWidthError}
                              </p>
                            )}
                            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                              세로 크기는 이 이미지의 원본 비율에 맞게 자동으로 계산됩니다. 원본보다 작은
                              이미지는 확대하지 않습니다.
                            </p>
                          </label>
                        )}

                        {effectiveSettings.resizeMode === 'pixel-height' && (
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-medium text-zinc-600">세로 크기 입력</span>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                value={String(effectiveSettings.pixelHeight || '')}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateItemCustomSettings(item.id, {
                                    pixelHeight: Number(event.target.value.replace(/\D/g, '').slice(0, 5)),
                                  })
                                }
                                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${
                                  itemPixelHeightError ? 'border-red-300' : 'border-zinc-200'
                                }`}
                              />
                              <span className="text-sm font-semibold text-zinc-600">px</span>
                            </div>
                            {itemPixelHeightError && (
                              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                                {itemPixelHeightError}
                              </p>
                            )}
                            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                              가로 크기는 이 이미지의 원본 비율에 맞게 자동으로 계산됩니다. 원본보다 작은
                              이미지는 확대하지 않습니다.
                            </p>
                          </label>
                        )}

                        <label className="block">
                          <span className="text-xs font-medium text-zinc-600">품질</span>
                          <select
                            value={[0.9, 0.8, 0.7].includes(effectiveSettings.quality) ? String(effectiveSettings.quality) : 'custom'}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItemCustomSettings(item.id, {
                                quality: event.target.value === 'custom' ? effectiveSettings.quality : Number(event.target.value),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="0.9">높은 품질 90%</option>
                            <option value="0.8">일반 품질 80%</option>
                            <option value="0.7">작은 용량 70%</option>
                            <option value="custom">직접 설정</option>
                          </select>
                        </label>

                        {(
                          <label className="block">
                            <span className="text-xs font-medium text-zinc-600">직접 품질/현재값(10~100%)</span>
                            <input
                              value={String(Math.round(effectiveSettings.quality * 100))}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateItemCustomSettings(item.id, {
                                  quality:
                                    Math.min(100, Math.max(10, Number(event.target.value.replace(/\D/g, '')) || 80)) / 100,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        )}

                        <label className="block">
                          <span className="text-xs font-medium text-zinc-600">결과 형식</span>
                          <select
                            value={effectiveSettings.outputFormat}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItemCustomSettings(item.id, { outputFormat: event.target.value as OutputFormat })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="original">원본 형식 유지</option>
                            <option value="image/jpeg">JPG</option>
                            <option value="image/webp">WEBP</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                    <PreviewFrame
                      label="원본"
                      badgeClassName="bg-zinc-200 text-zinc-700"
                      src={item.originalPreviewUrl}
                      alt={`${item.name} 원본 이미지`}
                      meta={`${item.originalWidth && item.originalHeight ? `${item.originalWidth} × ${item.originalHeight}` : '크기 확인 전'} · ${formatBytes(item.size)}`}
                    />

                    <div className="flex shrink-0 flex-row items-center justify-center gap-2 text-blue-700 md:w-20 md:flex-col">
                      <ArrowDownRight className="size-5" aria-hidden />
                      <span className="text-center text-xs font-semibold">{getTransformLabelFromSettings(effectiveSettings)}</span>
                    </div>

                    <PreviewFrame
                      label="줄인 이미지"
                      badgeClassName="bg-emerald-100 text-emerald-700"
                      src={item.outputPreviewUrl}
                      alt={`${item.name} 줄인 이미지`}
                      meta={
                        item.outputWidth && item.outputHeight && item.outputBlob
                          ? `${item.outputWidth} × ${item.outputHeight} · ${formatBytes(item.outputBlob.size)}`
                          : '-'
                      }
                      placeholder={
                        item.status === 'processing'
                          ? '이미지를 줄이고 있습니다.'
                          : '이미지 줄이기를 실행하면 결과를 여기에서 확인할 수 있습니다.'
                      }
                    />
                  </div>

                  <div
                    className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${
                      item.outputBlob && item.outputBlob.size > item.size
                        ? 'bg-amber-50 text-amber-700'
                        : hasOutput
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-white text-zinc-500'
                    }`}
                  >
                    {hasOutput ? (
                      item.outputBlob && item.outputBlob.size > item.size ? (
                        getFileReductionSummary(item.size, item.outputBlob.size)
                      ) : (
                        `${getPixelReductionSummary(item)} · ${getFileReductionSummary(item.size, item.outputBlob?.size)}`
                      )
                    ) : (
                      '처리 전입니다.'
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setPreviewItemId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-preview-dialog-title"
            className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl bg-white p-5 shadow-xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="image-preview-dialog-title" className="truncate text-lg font-bold text-zinc-950">
                  크게 보기
                </h3>
                <p className="mt-1 truncate text-sm text-zinc-600">{previewItem.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItemId(null)}
                aria-label="크게 보기 닫기"
                className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-5 flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
              <PreviewFrame
                label="원본"
                badgeClassName="bg-zinc-200 text-zinc-700"
                src={previewItem.originalPreviewUrl}
                alt={`${previewItem.name} 원본 이미지 크게 보기`}
                meta={`${previewItem.originalWidth && previewItem.originalHeight ? `${previewItem.originalWidth} × ${previewItem.originalHeight}` : '크기 확인 전'} · ${formatBytes(previewItem.size)}`}
              />
              <div className="flex shrink-0 flex-row items-center justify-center gap-2 text-blue-700 lg:w-24 lg:flex-col">
                <ArrowDownRight className="size-6" aria-hidden />
                <span className="text-center text-sm font-semibold">
                  {getTransformLabelFromSettings(getEffectiveSettings(previewItem))}
                </span>
              </div>
              <PreviewFrame
                label="줄인 이미지"
                badgeClassName="bg-emerald-100 text-emerald-700"
                src={previewItem.outputPreviewUrl}
                alt={`${previewItem.name} 줄인 이미지 크게 보기`}
                meta={
                  previewItem.outputWidth && previewItem.outputHeight && previewItem.outputBlob
                    ? `${previewItem.outputWidth} × ${previewItem.outputHeight} · ${formatBytes(previewItem.outputBlob.size)}`
                    : '-'
                }
                placeholder="이미지 줄이기를 실행하면 결과를 여기에서 확인할 수 있습니다."
              />
            </div>

            <div
              className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                previewItem.outputBlob && previewItem.outputBlob.size > previewItem.size
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {previewItem.outputBlob && previewItem.outputBlob.size > previewItem.size
                ? getFileReductionSummary(previewItem.size, previewItem.outputBlob.size)
                : `${getPixelReductionSummary(previewItem)} · ${getFileReductionSummary(previewItem.size, previewItem.outputBlob?.size)}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
