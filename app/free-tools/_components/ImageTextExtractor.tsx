'use client';

import { useEffect, useRef, useState } from 'react';
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

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const EMPTY_RESULT_MESSAGE = '글자를 찾지 못했습니다. 더 선명한 이미지로 다시 시도해 주세요.';
const DOWNLOAD_BASENAME = 'extracted-text';

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
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
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

async function extractTextFromImage(file: File) {
  const Tesseract = (await import('tesseract.js')).default;
  const result = await Tesseract.recognize(file, 'kor+eng', {
    tessedit_pageseg_mode: 6,
  } as Parameters<typeof Tesseract.recognize>[2]);

  return normalizeExtractedText(result.data.text ?? '');
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
  const extractionRunRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const pasteHintTimerRef = useRef<number | null>(null);
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<ToolStatus>('initial');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteHintVisible, setPasteHintVisible] = useState(false);

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
    setStatus('processing');

    try {
      const nextText = await extractTextFromImage(loadedImage.file);
      if (extractionRunRef.current !== runId) return;
      if (!nextText) {
        setStatus('error');
        setError(EMPTY_RESULT_MESSAGE);
        return;
      }
      setText(nextText);
      setStatus('done');
    } catch {
      if (extractionRunRef.current !== runId) return;
      setStatus('error');
      setError(EMPTY_RESULT_MESSAGE);
    }
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

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] xl:items-start">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
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
            업로드하거나 붙여넣은 이미지는 글자 추출 용도로만 사용되며 저장하지 않습니다.
          </div>

          {loadedImage ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm ring-1 ring-blue-100">
              <div className="flex flex-col gap-3">
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-white/90 sm:h-44">
                  <img
                    src={loadedImage.previewUrl}
                    alt="입력한 이미지 미리보기"
                    className="max-h-full max-w-full object-contain"
                  />
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

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-950">추출된 글자</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              추출한 글자는 직접 수정한 뒤 복사하거나 TXT, CSV, 엑셀 파일로 다운로드할 수 있습니다.
            </p>
          </div>
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
      </section>
    </div>
  );
}
