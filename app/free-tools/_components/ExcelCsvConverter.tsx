'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, RotateCcw, Upload, X } from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';
import { decodeTextWithFallback } from '@/app/free-tools/_utils/browserCompatibility';

type FileKind = 'excel' | 'csv';
type CsvDelimiter = 'auto' | ',' | '\t' | ';';
type CsvEncoding = 'auto' | 'utf-8' | 'euc-kr';
type CsvOutputEncoding = 'utf8-bom' | 'utf8';
type ExcelSheetMode = 'selected' | 'all';
type ResultState = 'empty' | 'done' | 'stale';

type LoadedFile = {
  file: File;
  kind: FileKind;
  extension: string;
  baseName: string;
  rows: string[][];
  workbook?: XLSX.WorkBook;
  sheetNames: string[];
  selectedSheetName: string;
  detectedDelimiter?: Exclude<CsvDelimiter, 'auto'>;
  detectedEncoding?: Exclude<CsvEncoding, 'auto'>;
};

type ConvertResult = {
  blob: Blob;
  fileName: string;
  outputFormat: 'CSV' | 'XLSX' | 'ZIP';
  rowCount: number;
  columnCount: number;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ROWS = 30000;
const PREVIEW_ROWS = 20;
const PREVIEW_COLUMNS = 15;

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024)).toLocaleString('ko-KR')}KB`;
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'converted';
}

function safeFilePart(value: string) {
  return (value || 'Sheet1').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function safeSheetName(value: string) {
  const cleaned = value.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return cleaned || 'Sheet1';
}

function rowHasValue(row: string[]) {
  return row.some((cell) => String(cell ?? '').trim() !== '');
}

function getColumnCount(rows: string[][]) {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function delimiterLabel(delimiter?: CsvDelimiter | Exclude<CsvDelimiter, 'auto'>) {
  if (delimiter === '\t') return '탭';
  if (delimiter === ';') return '세미콜론(;)';
  if (delimiter === ',') return '쉼표(,)';
  return '자동 감지';
}

function encodingLabel(encoding?: CsvEncoding | Exclude<CsvEncoding, 'auto'>) {
  if (encoding === 'euc-kr') return 'CP949/EUC-KR';
  if (encoding === 'utf-8') return 'UTF-8';
  return '자동 감지';
}

function detectDelimiter(text: string): Exclude<CsvDelimiter, 'auto'> {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const candidates: Exclude<CsvDelimiter, 'auto'>[] = [',', '\t', ';'];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: sample.split('\n').reduce((sum, line) => sum + Math.max(0, line.split(delimiter).length - 1), 0),
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

function parseCsvLine(line: string, delimiter: Exclude<CsvDelimiter, 'auto'>) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(text: string, delimiter: Exclude<CsvDelimiter, 'auto'>) {
  const rows: string[][] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      currentLine += '""';
      index += 1;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      rows.push(parseCsvLine(currentLine, delimiter));
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine || text.endsWith('\n')) rows.push(parseCsvLine(currentLine, delimiter));
  return rows.filter((row) => rowHasValue(row));
}

function decodeCsv(buffer: ArrayBuffer, encoding: CsvEncoding) {
  if (encoding === 'utf-8') {
    return { text: decodeTextWithFallback(buffer, ['utf-8']), detectedEncoding: 'utf-8' as const };
  }
  if (encoding === 'euc-kr') {
    return { text: decodeTextWithFallback(buffer, ['euc-kr', 'cp949', 'utf-8']), detectedEncoding: 'euc-kr' as const };
  }

  try {
    return { text: decodeTextWithFallback(buffer, ['utf-8'], { fatal: true }), detectedEncoding: 'utf-8' as const };
  } catch {
    return { text: decodeTextWithFallback(buffer, ['euc-kr', 'cp949', 'utf-8']), detectedEncoding: 'euc-kr' as const };
  }
}

function makeCsvBlob(csv: string, encoding: CsvOutputEncoding) {
  const content = encoding === 'utf8-bom' ? `\uFEFF${csv}` : csv;
  return new Blob([content], { type: 'text/csv;charset=utf-8' });
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

function rowsToWorkbook(rows: string[][], sheetName: string, preserveText: boolean) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  if (preserveText && worksheet['!ref']) {
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[address];
        if (cell) cell.t = 's';
      }
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
  return workbook;
}

export function ExcelCsvConverter() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loadedFile, setLoadedFile] = useState<LoadedFile | null>(null);
  const [excelSheetMode, setExcelSheetMode] = useState<ExcelSheetMode>('selected');
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>('auto');
  const [csvEncoding, setCsvEncoding] = useState<CsvEncoding>('auto');
  const [csvOutputDelimiter, setCsvOutputDelimiter] = useState<Exclude<CsvDelimiter, 'auto'>>(',');
  const [csvOutputEncoding, setCsvOutputEncoding] = useState<CsvOutputEncoding>('utf8-bom');
  const [csvSheetName, setCsvSheetName] = useState('Sheet1');
  const [preserveText, setPreserveText] = useState(true);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [resultState, setResultState] = useState<ResultState>('empty');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock({
    onUploadCancel: () => {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const markStale = () => {
    setError(null);
    if (result) setResultState('stale');
  };

  const resetAll = () => {
    setLoadedFile(null);
    setExcelSheetMode('selected');
    setCsvDelimiter('auto');
    setCsvEncoding('auto');
    setCsvOutputDelimiter(',');
    setCsvOutputEncoding('utf8-bom');
    setCsvSheetName('Sheet1');
    setPreserveText(true);
    setResult(null);
    setResultState('empty');
    setError(null);
    setProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateLoadedRows = (file: LoadedFile, nextRows: string[][], extra?: Partial<LoadedFile>) => {
    if (nextRows.length === 0) {
      setError('변환할 데이터가 없는 파일입니다.');
      return;
    }
    if (nextRows.length > MAX_ROWS) {
      setError('데이터가 30,000행을 초과하여 변환할 수 없습니다.');
      return;
    }
    setLoadedFile({ ...file, ...extra, rows: nextRows });
    setResult(null);
    setResultState('empty');
    setError(null);
  };

  const loadExcelFile = async (file: File, extension: string) => {
    try {
      const buffer = await unlockExcelFile(file);
      const workbook = XLSX.read(buffer, { type: 'array', raw: false });
      const sheetNames = workbook.SheetNames;
      if (sheetNames.length === 0) {
        setError('엑셀 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.');
        return;
      }
      const selectedSheetName = sheetNames[0];
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[selectedSheetName], {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false,
      });
      const nextFile: LoadedFile = {
        file,
        kind: 'excel',
        extension,
        baseName: getBaseName(file.name),
        workbook,
        sheetNames,
        selectedSheetName,
        rows,
      };
      updateLoadedRows(nextFile, rows);
    } catch (error) {
      if (error instanceof ExcelUnlockCancelledError) {
        setError(null);
        return;
      }
      setError(error instanceof Error ? error.message : '엑셀 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.');
    }
  };

  const loadCsvFile = async (
    file: File,
    nextDelimiter: CsvDelimiter = csvDelimiter,
    nextEncoding: CsvEncoding = csvEncoding,
  ) => {
    try {
      const buffer = await file.arrayBuffer();
      const decoded = decodeCsv(buffer, nextEncoding);
      const delimiter = nextDelimiter === 'auto' ? detectDelimiter(decoded.text) : nextDelimiter;
      const rows = parseCsv(decoded.text.replace(/^\uFEFF/, ''), delimiter);
      const nextFile: LoadedFile = {
        file,
        kind: 'csv',
        extension: 'csv',
        baseName: getBaseName(file.name),
        rows,
        sheetNames: ['Sheet1'],
        selectedSheetName: safeSheetName(getBaseName(file.name)),
        detectedDelimiter: delimiter,
        detectedEncoding: decoded.detectedEncoding,
      };
      setCsvSheetName(safeSheetName(getBaseName(file.name)));
      updateLoadedRows(nextFile, rows);
    } catch {
      setError('일부 문자가 정상적으로 표시되지 않습니다. 문자 인코딩을 CP949/EUC-KR 또는 UTF-8로 변경해 보세요.');
    }
  };

  const loadFile = async (file: File) => {
    const extension = getExtension(file.name);
    if (!['xlsx', 'xls', 'csv'].includes(extension)) {
      setError('XLSX, XLS 또는 CSV 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('파일 크기는 20MB 이하만 사용할 수 있습니다.');
      return;
    }

    resetAll();
    if (extension === 'csv') await loadCsvFile(file, 'auto', 'auto');
    else await loadExcelFile(file, extension);
  };

  const changeSheet = (sheetName: string) => {
    if (!loadedFile?.workbook) return;
    const rows = XLSX.utils.sheet_to_json<string[]>(loadedFile.workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    });
    updateLoadedRows(loadedFile, rows, { selectedSheetName: sheetName });
    markStale();
  };

  const rereadCsv = async (nextDelimiter = csvDelimiter, nextEncoding = csvEncoding) => {
    if (!loadedFile || loadedFile.kind !== 'csv') return;
    setCsvDelimiter(nextDelimiter);
    setCsvEncoding(nextEncoding);
    setResult(null);
    setResultState('empty');
    await loadCsvFile(loadedFile.file, nextDelimiter, nextEncoding);
  };

  const convertFile = async () => {
    if (!loadedFile) {
      setError('엑셀 또는 CSV 파일을 먼저 올려 주세요.');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      if (loadedFile.kind === 'excel') {
        if (!loadedFile.workbook) throw new Error('workbook_missing');
        if (excelSheetMode === 'all' && loadedFile.sheetNames.length > 1) {
          const zip = new JSZip();
          loadedFile.sheetNames.forEach((sheetName) => {
            const worksheet = loadedFile.workbook?.Sheets[sheetName];
            if (!worksheet) return;
            const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: csvOutputDelimiter });
            zip.file(`${safeFilePart(loadedFile.baseName)}_${safeFilePart(sheetName)}.csv`, makeCsvBlob(csv, csvOutputEncoding));
          });
          const blob = await zip.generateAsync({ type: 'blob' });
          setResult({
            blob,
            fileName: 'excload-csv-files.zip',
            outputFormat: 'ZIP',
            rowCount: loadedFile.rows.length,
            columnCount: getColumnCount(loadedFile.rows),
          });
        } else {
          const worksheet = loadedFile.workbook.Sheets[loadedFile.selectedSheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: csvOutputDelimiter });
          const needsSheetName = loadedFile.sheetNames.length > 1;
          setResult({
            blob: makeCsvBlob(csv, csvOutputEncoding),
            fileName: `${safeFilePart(loadedFile.baseName)}${needsSheetName ? `_${safeFilePart(loadedFile.selectedSheetName)}` : ''}.csv`,
            outputFormat: 'CSV',
            rowCount: loadedFile.rows.length,
            columnCount: getColumnCount(loadedFile.rows),
          });
        }
      } else {
        const workbook = rowsToWorkbook(loadedFile.rows, csvSheetName, preserveText);
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        setResult({
          blob: new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          fileName: `${safeFilePart(loadedFile.baseName)}.xlsx`,
          outputFormat: 'XLSX',
          rowCount: loadedFile.rows.length,
          columnCount: getColumnCount(loadedFile.rows),
        });
      }

      setResultState('done');
    } catch {
      setError('파일 변환 중 문제가 발생했습니다. 파일을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setProcessing(false);
    }
  };

  const previewRows = loadedFile?.rows.slice(0, PREVIEW_ROWS) ?? [];
  const previewColumnCount = Math.min(getColumnCount(previewRows), PREVIEW_COLUMNS);

  return (
    <>
    <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">파일 업로드와 변환 설정</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              엑셀 파일을 CSV로, CSV 파일을 엑셀 파일로 변환할 수 있습니다. 파일은 서버로 전송되지 않고
              사용자의 브라우저에서만 처리됩니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <label
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
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
                const file = event.dataTransfer.files[0];
                if (file) void loadFile(file);
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-8 text-center hover:bg-blue-50"
            >
              <Upload className="size-8 text-blue-600" aria-hidden />
              <span className="mt-3 text-sm font-bold text-zinc-950">엑셀 또는 CSV 파일을 올려 주세요.</span>
              <span className="mt-1 text-xs text-zinc-500">지원 형식: XLSX, XLS, CSV · 최대 20MB · 데이터 행 최대 30,000행</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>

            {loadedFile && (
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 truncate font-medium text-zinc-800">
                  {loadedFile.file.name}
                  <span className="ml-2 text-zinc-500">({formatBytes(loadedFile.file.size)})</span>
                </span>
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex w-fit items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  <X className="size-3.5" aria-hidden />
                  파일 제거
                </button>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert" aria-live="polite">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}
          </div>

          {loadedFile?.kind === 'excel' && (
            <div className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-bold text-zinc-950">엑셀 → CSV 설정</p>
              {loadedFile.sheetNames.length > 1 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                    <input
                      type="radio"
                      checked={excelSheetMode === 'selected'}
                      onChange={() => {
                        setExcelSheetMode('selected');
                        markStale();
                      }}
                    />
                    선택한 시트만 CSV로 변환
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                    <input
                      type="radio"
                      checked={excelSheetMode === 'all'}
                      onChange={() => {
                        setExcelSheetMode('all');
                        markStale();
                      }}
                    />
                    모든 시트를 각각 CSV로 변환
                  </label>
                </div>
              )}
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">변환할 시트</span>
                <select
                  value={loadedFile.selectedSheetName}
                  disabled={excelSheetMode === 'all'}
                  onChange={(event) => changeSheet(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {loadedFile.sheetNames.map((sheetName) => (
                    <option key={sheetName} value={sheetName}>
                      {sheetName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">구분 문자</span>
                  <select
                    value={csvOutputDelimiter}
                    onChange={(event) => {
                      setCsvOutputDelimiter(event.target.value as Exclude<CsvDelimiter, 'auto'>);
                      markStale();
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value=",">쉼표(,)</option>
                    <option value="\t">탭</option>
                    <option value=";">세미콜론(;)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">파일 인코딩</span>
                  <select
                    value={csvOutputEncoding}
                    onChange={(event) => {
                      setCsvOutputEncoding(event.target.value as CsvOutputEncoding);
                      markStale();
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="utf8-bom">UTF-8 BOM 포함</option>
                    <option value="utf8">UTF-8</option>
                  </select>
                </label>
              </div>
              <p className="rounded-md bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
                CSV 파일은 엑셀의 셀 색상, 글꼴, 테두리, 병합 등의 서식을 저장하지 않습니다. 수식이 있는
                경우 CSV에는 화면에 표시되는 값만 저장될 수 있습니다.
              </p>
            </div>
          )}

          {loadedFile?.kind === 'csv' && (
            <div className="space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-bold text-zinc-950">CSV → 엑셀 설정</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">문자 인코딩</span>
                  <select
                    value={csvEncoding}
                    onChange={(event) => void rereadCsv(csvDelimiter, event.target.value as CsvEncoding)}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="auto">자동 감지</option>
                    <option value="utf-8">UTF-8</option>
                    <option value="euc-kr">CP949/EUC-KR</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">구분 문자</span>
                  <select
                    value={csvDelimiter}
                    onChange={(event) => void rereadCsv(event.target.value as CsvDelimiter, csvEncoding)}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="auto">자동 감지</option>
                    <option value=",">쉼표(,)</option>
                    <option value="\t">탭</option>
                    <option value=";">세미콜론(;)</option>
                  </select>
                </label>
              </div>
              <div className="rounded-md bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
                감지된 구분 문자: {delimiterLabel(loadedFile.detectedDelimiter)} · 감지된 인코딩:{' '}
                {encodingLabel(loadedFile.detectedEncoding)}
              </div>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">엑셀 시트 이름</span>
                <input
                  value={csvSheetName}
                  onChange={(event) => {
                    setCsvSheetName(safeSheetName(event.target.value));
                    markStale();
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-start gap-2 text-sm font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={preserveText}
                  onChange={(event) => {
                    setPreserveText(event.target.checked);
                    markStale();
                  }}
                  className="mt-1"
                />
                <span>
                  숫자처럼 보이는 값도 원문 그대로 유지
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                    전화번호, 우편번호, 주문번호 등의 앞자리 0이 사라지지 않도록 원문 그대로 저장합니다.
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void convertFile()}
              disabled={processing}
              className="rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {processing
                ? '파일을 변환하고 있습니다.'
                : !loadedFile
                  ? '파일 올리고 변환하기'
                  : loadedFile.kind === 'csv'
                    ? '엑셀 파일로 변환'
                    : 'CSV 파일로 변환'}
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RotateCcw className="size-4" aria-hidden />
              설정 초기화
            </button>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900">
            업로드한 엑셀과 CSV 파일은 서버로 전송되지 않습니다. 파일 읽기와 변환은 사용자의 브라우저에서만
            처리됩니다. 페이지를 닫거나 새로고침하면 업로드한 파일과 변환 결과는 사라집니다.
          </div>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <h3 className="text-lg font-bold text-zinc-950">파일 정보와 미리보기</h3>
        {!loadedFile ? (
          <p className="mt-5 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
            파일을 올리면 정보와 데이터 미리보기가 표시됩니다.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm sm:grid-cols-2">
              <p><span className="font-semibold text-zinc-600">파일명:</span> {loadedFile.file.name}</p>
              <p><span className="font-semibold text-zinc-600">형식:</span> {loadedFile.extension.toUpperCase()}</p>
              <p><span className="font-semibold text-zinc-600">크기:</span> {formatBytes(loadedFile.file.size)}</p>
              <p>
                <span className="font-semibold text-zinc-600">데이터:</span>{' '}
                {loadedFile.rows.length.toLocaleString('ko-KR')}행 × {getColumnCount(loadedFile.rows).toLocaleString('ko-KR')}열
              </p>
              {loadedFile.kind === 'excel' && (
                <p><span className="font-semibold text-zinc-600">시트:</span> {loadedFile.sheetNames.length}개</p>
              )}
            </div>

            <div>
              <p className="text-sm font-bold text-zinc-950">
                미리보기: 처음 {Math.min(PREVIEW_ROWS, loadedFile.rows.length)}행
              </p>
              <div className="mt-3 max-h-[420px] max-w-full overflow-auto rounded-lg border border-zinc-200">
                <table className="min-w-max text-left text-xs">
                  <tbody>
                    {previewRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-zinc-100 first:border-t-0">
                        <th className="sticky left-0 bg-zinc-100 px-3 py-2 font-semibold text-zinc-600">
                          {rowIndex + 1}
                        </th>
                        {Array.from({ length: previewColumnCount }).map((_, colIndex) => (
                          <td key={colIndex} title={row[colIndex] ?? ''} className="max-w-[180px] truncate px-3 py-2 text-zinc-700">
                            {row[colIndex] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {getColumnCount(loadedFile.rows) > PREVIEW_COLUMNS && (
                <p className="mt-2 text-xs text-zinc-500">
                  전체 {getColumnCount(loadedFile.rows)}열 중 처음 {PREVIEW_COLUMNS}열만 미리보기로 표시합니다.
                </p>
              )}
            </div>

            {result && (
              <div
                className={`rounded-md border p-4 ${
                  resultState === 'stale'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-emerald-100 bg-emerald-50 text-emerald-800'
                }`}
              >
                <p className="font-semibold">
                  {resultState === 'stale' ? '설정이 변경되었습니다. 파일을 다시 변환해 주세요.' : '변환이 완료되었습니다.'}
                </p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <span>원본 형식: {loadedFile.extension.toUpperCase()}</span>
                  <span>결과 형식: {result.outputFormat}</span>
                  <span>데이터: {result.rowCount.toLocaleString('ko-KR')}행 × {result.columnCount.toLocaleString('ko-KR')}열</span>
                  <span className="truncate">결과 파일: {result.fileName}</span>
                </div>
                <button
                  type="button"
                  disabled={resultState !== 'done'}
                  onClick={() => downloadBlob(result.blob, result.fileName)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-500"
                >
                  <Download className="size-4" aria-hidden />
                  {result.outputFormat === 'ZIP' ? 'CSV 파일 ZIP 다운로드' : '변환 파일 다운로드'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
    {excelUnlockUi}
    </>
  );
}
