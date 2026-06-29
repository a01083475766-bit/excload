'use client';

import { useRef, useState } from 'react';
import { AlertCircle, ClipboardCopy, Download, FileText, Image as ImageIcon, Loader2, RotateCcw, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

type LoadedImage = {
  file: File;
  baseName: string;
  previewUrl: string;
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const EMPTY_RESULT_MESSAGE = '글자를 찾지 못했습니다. 선명한 이미지로 다시 시도해 주세요.';

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'image-text';
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

export function ImageTextExtractor() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const extractionRunRef = useRef(0);
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [text, setText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasText = text.trim().length > 0;
  const canDownload = hasText && !processing;

  const resetAll = () => {
    extractionRunRef.current += 1;
    if (loadedImage) URL.revokeObjectURL(loadedImage.previewUrl);
    setLoadedImage(null);
    setText('');
    setProcessing(false);
    setError(null);
    setCopied(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const loadFile = async (file: File) => {
    const runId = extractionRunRef.current + 1;
    extractionRunRef.current = runId;
    setCopied(false);
    setError(null);

    if (!isSupportedImage(file)) {
      setError('JPG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(`파일 크기는 ${formatBytes(MAX_FILE_SIZE)} 이하로 올려 주세요.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setLoadedImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return {
        file,
        baseName: getBaseName(file.name),
        previewUrl,
      };
    });
    setText('');
    setProcessing(true);

    try {
      const nextText = await extractTextFromImage(file);
      if (extractionRunRef.current !== runId) return;
      if (!nextText) {
        setError(EMPTY_RESULT_MESSAGE);
        setText('');
        return;
      }
      setText(nextText);
    } catch {
      if (extractionRunRef.current !== runId) return;
      setError(EMPTY_RESULT_MESSAGE);
      setText('');
    } finally {
      if (extractionRunRef.current === runId) setProcessing(false);
    }
  };

  const downloadTxt = () => {
    if (!hasText) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${loadedImage?.baseName ?? 'image-text'}_text.txt`);
  };

  const downloadCsv = () => {
    if (!hasText) return;
    const blob = new Blob([`\uFEFF${makeCsv(text)}`], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${loadedImage?.baseName ?? 'image-text'}_text.csv`);
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
    downloadBlob(blob, `${loadedImage?.baseName ?? 'image-text'}_text.xlsx`);
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

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] xl:items-start">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <ImageIcon className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">이미지 업로드</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              사진, 캡처 화면, 스크린샷을 올리면 이미지 안의 글자를 자동으로 읽어 텍스트로 정리합니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <label
            tabIndex={0}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && !processing) {
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
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const file = event.dataTransfer.files[0];
              if (file && !processing) void loadFile(file);
            }}
            className={`flex min-h-44 flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
              processing
                ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400'
                : 'cursor-pointer border-blue-200 bg-blue-50/50 hover:bg-blue-50'
            }`}
          >
            {processing ? (
              <Loader2 className="size-8 animate-spin text-blue-600" aria-hidden />
            ) : (
              <Upload className="size-8 text-blue-600" aria-hidden />
            )}
            <span className="mt-3 text-sm font-bold text-zinc-950">이미지를 선택하거나 드래그해서 올려 주세요.</span>
            <span className="mt-1 text-xs text-zinc-500">JPG, JPEG, PNG, WEBP 지원 · 파일당 최대 20MB</span>
            <span className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white">
              이미지 업로드하기
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              disabled={processing}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
                event.currentTarget.value = '';
              }}
            />
          </label>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm leading-relaxed text-blue-900">
            업로드한 이미지는 글자 추출 용도로만 사용되며 저장하지 않습니다. 처리는 가능한 범위에서
            사용자의 브라우저 안에서 진행됩니다.
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {loadedImage ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-start gap-3">
                <img
                  src={loadedImage.previewUrl}
                  alt="업로드한 이미지 미리보기"
                  className="h-20 w-20 rounded-lg border border-zinc-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-950">{loadedImage.file.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatBytes(loadedImage.file.size)}</p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                    {processing ? '이미지 속 글자를 읽는 중입니다. 잠시만 기다려 주세요.' : '다른 이미지를 올리면 새로 읽습니다.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-center text-sm leading-relaxed text-zinc-500">
              파일을 올리기 전입니다. 선명한 사진이나 스크린샷일수록 글자를 더 잘 읽을 수 있습니다.
            </p>
          )}

          <button
            type="button"
            onClick={resetAll}
            disabled={processing && !loadedImage}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400 sm:w-fit"
          >
            <RotateCcw className="size-4" aria-hidden />
            초기화
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-950">추출된 글자</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              읽어 온 글자는 직접 수정한 뒤 복사하거나 파일로 저장할 수 있습니다.
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

        <div className="mt-5">
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setCopied(false);
              if (error === EMPTY_RESULT_MESSAGE) setError(null);
            }}
            placeholder={processing ? '이미지 속 글자를 읽는 중입니다...' : '이미지를 올리면 추출된 글자가 여기에 표시됩니다.'}
            disabled={processing}
            className="min-h-80 w-full resize-y rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-zinc-50 disabled:text-zinc-500"
          />
        </div>

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
            onClick={downloadXlsx}
            disabled={!canDownload}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <Download className="size-4" aria-hidden />
            XLSX 다운로드
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
        </div>

        {!hasText && !processing ? (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-center text-sm leading-relaxed text-zinc-500">
            추출된 글자가 있으면 복사와 다운로드 버튼을 사용할 수 있습니다.
          </p>
        ) : null}
      </section>
    </div>
  );
}
