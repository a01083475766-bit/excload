'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, RotateCcw, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { createSafeExcelParseTask } from '@/app/free-tools/_utils/safeExcelParser';
import { safeRandomId } from '@/app/free-tools/_utils/browserCompatibility';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';
import type { ExcelCleanupStats, SafeExcelParseTask } from '@/app/free-tools/_utils/safeExcelParser';

type SheetData = {
  name: string;
  rows: string[][];
  rowMeta?: Record<number, { fileName: string; sourceRowNumber: number }>;
};

type ColumnInfo = {
  index: number;
  label: string;
};

type DataRow = {
  sourceFileName: string;
  sourceRowNumber: number;
  values: string[];
};

type UploadedFileInfo = {
  name: string;
  size: number | null;
};

type ParsedFile = {
  fileName: string;
  fileSize: number;
  sheet: SheetData;
  headerRowIndex: number;
  columns: ColumnInfo[];
  dataRows: DataRow[];
  cleanupStats?: ExcelCleanupStats;
};

type DuplicateGroup = {
  groupNo: number;
  key: string;
  rows: DataRow[];
};

type ResultRow = DataRow & {
  groupNo: number | null;
  duplicateCount: number;
  status: 'duplicate' | 'unique' | 'empty-key';
};

type CheckResult = {
  totalRows: number;
  uniqueRows: number;
  duplicateGroupCount: number;
  duplicateRelatedRows: number;
  duplicateRemovalRows: number;
  emptyKeyRows: number;
  groups: DuplicateGroup[];
  allRows: ResultRow[];
  duplicateRows: ResultRow[];
  emptyRows: ResultRow[];
  dedupedRows: DataRow[];
};

type PreviewFilter = 'duplicates' | 'all' | 'empty';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_DATA_ROWS = 30000;
const MAX_PREVIEW_ROWS = 200;
const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'csv'];

const exampleRows = [
  ['주문번호', '수취인명', '연락처', '주소', '상품명', '수량'],
  ['A1001', '홍길동', '010-1234-5678', '서울시 강남구 1', '참치', '1'],
  ['A1002', '김영희', '010-2222-3333', '인천시 미추홀구 2', '연어', '1'],
  ['A1001', '홍길동', '01012345678', '서울시 강남구 1', '참치', '1'],
  ['A1003', '박민수', '010-5555-6666', '부산시 해운대구 3', '초밥', '2'],
  ['A1004', '이수진', '010-7777-8888', '대전시 서구 4', '참치', '1'],
  ['A1005', '홍길동', '010 1234 5678', '서울시 강남구 1', '연어', '1'],
  ['A1006', '최유리', '', '광주시 북구 5', '광어', '1'],
];

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizeCell(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function isPhoneColumn(label: string) {
  return /연락처|전화|휴대|phone|tel/i.test(label);
}

function normalizeForCompare(value: string, label: string) {
  const trimmed = normalizeCell(value);
  if (isPhoneColumn(label)) return trimmed.replace(/\D/g, '');
  return trimmed.toLowerCase();
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024)).toLocaleString('ko-KR')}KB`;
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || '주문파일';
}

function rowHasValue(row: string[]) {
  return row.some((cell) => normalizeCell(cell) !== '');
}

function makeUniqueColumns(headerRow: string[]) {
  const used = new Map<string, number>();

  return headerRow.map((cell, index) => {
    const raw = normalizeCell(cell) || `열 ${index + 1}`;
    const count = used.get(raw) ?? 0;
    used.set(raw, count + 1);
    return {
      index,
      label: count === 0 ? raw : `${raw} (${count + 1})`,
    };
  });
}

function detectHeaderRow(rows: string[][]) {
  const keywords = ['주문', '수취', '받는', '연락', '전화', '주소', '상품', 'order'];
  let fallback = 0;

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const row = rows[index] ?? [];
    const nonEmptyCount = row.filter((cell) => normalizeCell(cell) !== '').length;
    if (nonEmptyCount >= 2 && fallback === 0) fallback = index;

    const joined = normalizeLabel(row.join(' '));
    if (nonEmptyCount >= 2 && keywords.some((keyword) => joined.includes(normalizeLabel(keyword)))) {
      return index;
    }
  }

  return fallback;
}

function findColumn(columns: ColumnInfo[], candidates: string[]) {
  return columns.find((column) => {
    const label = normalizeLabel(column.label);
    return candidates.some((candidate) => label.includes(normalizeLabel(candidate)));
  });
}

function includesColumnSet(selected: number[], required: number[]) {
  if (required.length === 0) return false;
  return required.every((index) => selected.includes(index));
}

function getDataRows(sheet: SheetData, headerRowIndex: number) {
  return sheet.rows
    .slice(headerRowIndex + 1)
    .map((row, index) => {
      const rowIndex = headerRowIndex + 1 + index;
      const meta = sheet.rowMeta?.[rowIndex];
      return {
        sourceFileName: meta?.fileName ?? '업로드 파일',
        sourceRowNumber: meta?.sourceRowNumber ?? rowIndex + 1,
        values: row,
      };
    })
    .filter((row) => rowHasValue(row.values));
}

function createWorkbookAndDownload(rows: Record<string, string | number>[], fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '결과');
  XLSX.writeFile(workbook, fileName);
}

function dataRowKey(row: DataRow) {
  return `${row.sourceFileName}\u001E${row.sourceRowNumber}`;
}

function sameHeaders(left: ColumnInfo[], right: ColumnInfo[]) {
  return (
    left.length === right.length &&
    left.every((column, index) => column.label === right[index]?.label)
  );
}

export function DuplicateCheck() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const excelParseTaskRef = useRef<SafeExcelParseTask | null>(null);
  const loadRequestIdRef = useRef<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [baseName, setBaseName] = useState('주문파일');
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [selectedColumnIndexes, setSelectedColumnIndexes] = useState<number[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('duplicates');
  const [dedupeConfirmOpen, setDedupeConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [cleanupNotice, setCleanupNotice] = useState<ExcelCleanupStats | null>(null);
  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock({
    onUploadCancel: () => {
      setLoading(false);
      setProcessingStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const activeSheet = sheets[selectedSheetIndex] ?? null;
  const columns = useMemo(
    () => (activeSheet ? makeUniqueColumns(activeSheet.rows[headerRowIndex] ?? []) : []),
    [activeSheet, headerRowIndex],
  );
  const dataRows = useMemo(
    () => (activeSheet ? getDataRows(activeSheet, headerRowIndex) : []),
    [activeSheet, headerRowIndex],
  );

  const quickColumns = useMemo(() => {
    const order = findColumn(columns, [
      '주문번호',
      '주문 번호',
      '상품주문번호',
      '주문id',
      '결제번호',
      'order no',
      'order id',
    ]);
    const phone = findColumn(columns, [
      '연락처',
      '전화번호',
      '휴대폰',
      '휴대전화',
      '수취인연락처',
      '배송지전화번호',
      '받는분연락처',
      '수령인휴대폰',
    ]);
    const recipient = findColumn(columns, ['수취인', '수취인명', '받는분', '받는 사람', '수령인', '배송받는분']);
    const addressColumns = columns.filter((column) =>
      ['주소', '배송주소', '배송지주소', '수취인주소', '기본주소', '상세주소', '주소1', '주소2'].some(
        (candidate) => normalizeLabel(column.label).includes(normalizeLabel(candidate)),
      ),
    );

    return {
      order: order ? [order.index] : [],
      phone: phone ? [phone.index] : [],
      recipientAddress: recipient ? [recipient.index, ...addressColumns.map((column) => column.index)].slice(0, 4) : [],
    };
  }, [columns]);

  const resetResult = () => {
    setResult(null);
    setPreviewFilter('duplicates');
  };

  useEffect(() => {
    return () => {
      excelParseTaskRef.current?.worker.terminate();
    };
  }, []);

  const resetAll = () => {
    excelParseTaskRef.current?.worker.terminate();
    excelParseTaskRef.current = null;
    loadRequestIdRef.current = null;
    setFileName('');
    setFileSize(null);
    setUploadedFiles([]);
    setBaseName('주문파일');
    setSheets([]);
    setSelectedSheetIndex(0);
    setHeaderRowIndex(0);
    setSelectedColumnIndexes([]);
    setError(null);
    setLoading(false);
    setProcessingStatus('');
    setCleanupNotice(null);
    setDedupeConfirmOpen(false);
    resetResult();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyRows = (
    nextSheets: SheetData[],
    nextFileName: string,
    nextFileSize: number | null,
    nextCleanupStats?: ExcelCleanupStats,
  ) => {
    if (nextSheets.length === 0) {
      setError('시트를 찾을 수 없습니다.');
      return;
    }

    const firstDataSheetIndex = Math.max(0, nextSheets.findIndex((sheet) => sheet.rows.some(rowHasValue)));
    const selectedSheet = nextSheets[firstDataSheetIndex] ?? nextSheets[0];
    const detectedHeaderIndex = detectHeaderRow(selectedSheet.rows);
    const rowMeta: SheetData['rowMeta'] = {};
    selectedSheet.rows.forEach((_, index) => {
      if (index > detectedHeaderIndex) {
        rowMeta[index] = { fileName: nextFileName, sourceRowNumber: index + 1 };
      }
    });
    const sheetWithMeta = { ...selectedSheet, rowMeta };

    setSheets(nextSheets.map((sheet, index) => (index === firstDataSheetIndex ? sheetWithMeta : sheet)));
    setSelectedSheetIndex(firstDataSheetIndex);
    setHeaderRowIndex(detectedHeaderIndex);
    setSelectedColumnIndexes([]);
    setFileName(nextFileName);
    setFileSize(nextFileSize);
    setUploadedFiles([{ name: nextFileName, size: nextFileSize }]);
    setBaseName(getBaseName(nextFileName));
    setError(null);
    setProcessingStatus('');
    setCleanupNotice(nextCleanupStats?.cleaned ? nextCleanupStats : null);
    resetResult();
  };

  const parseFile = async (file: File): Promise<ParsedFile> => {
    const extension = getExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      throw new Error('xlsx, xls, csv 파일만 업로드할 수 있습니다.');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`${file.name} 파일은 최대 20MB까지 업로드할 수 있습니다.`);
    }

    let cleanupStats: ExcelCleanupStats | undefined;
    let sheetsFromFile: SheetData[];

    if (extension === 'csv') {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', raw: false });
      sheetsFromFile = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        }),
      }));
    } else {
      const unlockedBuffer = await unlockExcelFile(file);
      const task = createSafeExcelParseTask(file, extension, (message) => {
        setProcessingStatus(message);
      }, unlockedBuffer);
      excelParseTaskRef.current = task;
      const parsed = await task.promise;
      cleanupStats = parsed.cleanupStats;
      sheetsFromFile = parsed.sheets;
    }
    const firstDataSheetIndex = Math.max(0, sheetsFromFile.findIndex((sheet) => sheet.rows.some(rowHasValue)));
    const sheet = sheetsFromFile[firstDataSheetIndex] ?? sheetsFromFile[0];

    if (!sheet) {
      throw new Error(`${file.name} 파일에서 시트를 찾을 수 없습니다.`);
    }

    const detectedHeaderIndex = detectHeaderRow(sheet.rows);
    const columnsFromFile = makeUniqueColumns(sheet.rows[detectedHeaderIndex] ?? []);
    const rowMeta: SheetData['rowMeta'] = {};
    sheet.rows.forEach((_, index) => {
      if (index > detectedHeaderIndex) {
        rowMeta[index] = { fileName: file.name, sourceRowNumber: index + 1 };
      }
    });
    const sheetWithMeta = { ...sheet, rowMeta };

    return {
      fileName: file.name,
      fileSize: file.size,
      sheet: sheetWithMeta,
      headerRowIndex: detectedHeaderIndex,
      columns: columnsFromFile,
      dataRows: getDataRows(sheetWithMeta, detectedHeaderIndex),
      cleanupStats,
    };
  };

  const loadFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const loadRequestId = safeRandomId('duplicate-check');
    loadRequestIdRef.current = loadRequestId;
    excelParseTaskRef.current?.worker.terminate();
    excelParseTaskRef.current = null;

    try {
      setLoading(true);
      setProcessingStatus('파일 구조를 확인하고 있습니다.');
      setCleanupNotice(null);
      const parsedFiles: ParsedFile[] = [];
      for (const file of files) {
        parsedFiles.push(await parseFile(file));
      }
      if (loadRequestIdRef.current !== loadRequestId) return;

      const nextCleanupNotice = parsedFiles.reduce<ExcelCleanupStats>(
        (acc, parsed) => {
          if (!parsed.cleanupStats?.cleaned) return acc;
          return {
            cleaned: true,
            removedEmptyRows: acc.removedEmptyRows + parsed.cleanupStats.removedEmptyRows,
            rowsWithCells: acc.rowsWithCells + parsed.cleanupStats.rowsWithCells,
          };
        },
        { cleaned: false, removedEmptyRows: 0, rowsWithCells: 0 },
      );
      setCleanupNotice(nextCleanupNotice.cleaned ? nextCleanupNotice : null);
      setProcessingStatus('중복 주문을 검사하고 있습니다.');

      if (!activeSheet) {
        if (parsedFiles.length === 1) {
          const parsed = parsedFiles[0];
          applyRows([parsed.sheet], parsed.fileName, parsed.fileSize, parsed.cleanupStats);
          return;
        }

        const [first, ...rest] = parsedFiles;
        const mismatch = rest.find((parsed) => !sameHeaders(first.columns, parsed.columns));
        if (mismatch) {
          setError(`${mismatch.fileName} 파일은 첫 번째 파일과 헤더가 달라 함께 검사할 수 없습니다.`);
          return;
        }

        const header = first.sheet.rows[first.headerRowIndex] ?? [];
        const combinedRows = [header];
        const rowMeta: SheetData['rowMeta'] = {};
        parsedFiles.forEach((parsed) => {
          parsed.dataRows.forEach((row) => {
            const nextIndex = combinedRows.length;
            combinedRows.push(row.values);
            rowMeta[nextIndex] = {
              fileName: row.sourceFileName,
              sourceRowNumber: row.sourceRowNumber,
            };
          });
        });

        setSheets([{ name: '통합 데이터', rows: combinedRows, rowMeta }]);
        setSelectedSheetIndex(0);
        setHeaderRowIndex(0);
        setSelectedColumnIndexes([]);
        setUploadedFiles(parsedFiles.map((parsed) => ({ name: parsed.fileName, size: parsed.fileSize })));
        setFileName(`${parsedFiles.length}개 파일`);
        setFileSize(parsedFiles.reduce((sum, parsed) => sum + parsed.fileSize, 0));
        setBaseName('통합_중복검사');
        setError(null);
        resetResult();
        return;
      }

      const currentColumns = makeUniqueColumns(activeSheet.rows[headerRowIndex] ?? []);
      const mismatch = parsedFiles.find((parsed) => !sameHeaders(currentColumns, parsed.columns));
      if (mismatch) {
        setError(`${mismatch.fileName} 파일은 현재 파일과 헤더가 달라 함께 검사할 수 없습니다.`);
        return;
      }

      const existingRows = getDataRows(activeSheet, headerRowIndex);
      const header = activeSheet.rows[headerRowIndex] ?? [];
      const combinedRows = [header];
      const rowMeta: SheetData['rowMeta'] = {};

      [...existingRows, ...parsedFiles.flatMap((parsed) => parsed.dataRows)].forEach((row) => {
        const nextIndex = combinedRows.length;
        combinedRows.push(row.values);
        rowMeta[nextIndex] = {
          fileName: row.sourceFileName,
          sourceRowNumber: row.sourceRowNumber,
        };
      });

      const nextUploadedFiles = [
        ...uploadedFiles,
        ...parsedFiles.map((parsed) => ({ name: parsed.fileName, size: parsed.fileSize })),
      ];
      setSheets([{ name: '통합 데이터', rows: combinedRows, rowMeta }]);
      setSelectedSheetIndex(0);
      setHeaderRowIndex(0);
      setSelectedColumnIndexes([]);
      setUploadedFiles(nextUploadedFiles);
      setFileName(`${nextUploadedFiles.length}개 파일`);
      setFileSize(nextUploadedFiles.reduce((sum, file) => sum + (file.size ?? 0), 0));
      setBaseName('통합_중복검사');
      setError(null);
      resetResult();
    } catch (error) {
      if (loadRequestIdRef.current !== loadRequestId) return;
      if (error instanceof ExcelUnlockCancelledError) {
        setError(null);
        return;
      }
      setError(
        error instanceof Error
          ? error.message
          : '파일을 읽을 수 없습니다. 암호가 설정되어 있거나 손상된 파일인지 확인해 주세요.',
      );
    } finally {
      if (loadRequestIdRef.current === loadRequestId) {
        setLoading(false);
        setProcessingStatus('');
      }
    }
  };

  const loadExample = () => {
    setProcessingStatus('');
    applyRows([{ name: '예시 주문', rows: exampleRows }], '예시_주문_중복검사.xlsx', null);
  };

  const handleSheetChange = (index: number) => {
    const sheet = sheets[index];
    if (!sheet) return;
    setSelectedSheetIndex(index);
    setHeaderRowIndex(detectHeaderRow(sheet.rows));
    setSelectedColumnIndexes([]);
    setError(null);
    setCleanupNotice(null);
    resetResult();
  };

  const handleHeaderChange = (index: number) => {
    setHeaderRowIndex(index);
    setSelectedColumnIndexes([]);
    setError(null);
    resetResult();
  };

  const addQuickColumns = (indexes: number[]) => {
    if (indexes.length === 0) {
      setError('해당 기준으로 사용할 열을 찾지 못했습니다. 직접 열을 선택해 주세요.');
      return;
    }
    setSelectedColumnIndexes((prev) => Array.from(new Set([...prev, ...indexes])));
    setError(null);
    resetResult();
  };

  const toggleColumn = (index: number) => {
    setSelectedColumnIndexes((prev) => {
      if (prev.includes(index)) return prev.filter((value) => value !== index);
      setError(null);
      return [...prev, index];
    });
    resetResult();
  };

  const selectAllColumns = () => {
    setSelectedColumnIndexes(columns.map((column) => column.index));
    setError(null);
    resetResult();
  };

  const clearSelectedColumns = () => {
    setSelectedColumnIndexes([]);
    setError(null);
    resetResult();
  };

  const runCheck = () => {
    if (!activeSheet) {
      setError('파일을 선택하거나 드래그해서 첨부해 주세요.');
      return;
    }
    if (selectedColumnIndexes.length === 0) {
      setError('중복 기준 열을 1개 이상 선택해 주세요.');
      return;
    }
    if (dataRows.length === 0) {
      setError('검사할 주문 데이터가 없습니다.');
      return;
    }
    if (dataRows.length > MAX_DATA_ROWS) {
      setError('무료 중복 검사는 최대 30,000개 행까지 지원합니다.');
      return;
    }

    setLoading(true);
    setProcessingStatus('중복 주문을 검사하고 있습니다.');
    try {
      const map = new Map<string, DataRow[]>();
      const emptyRows: DataRow[] = [];

      for (const row of dataRows) {
        const parts = selectedColumnIndexes.map((columnIndex) =>
          normalizeForCompare(row.values[columnIndex] ?? '', columns[columnIndex]?.label ?? ''),
        );
        if (parts.every((part) => part === '')) {
          emptyRows.push(row);
          continue;
        }
        const key = parts.join('\u001F');
        map.set(key, [...(map.get(key) ?? []), row]);
      }

      const groups: DuplicateGroup[] = [];
      for (const [key, rows] of map.entries()) {
        if (rows.length > 1) groups.push({ groupNo: groups.length + 1, key, rows });
      }

      const groupByRow = new Map<string, DuplicateGroup>();
      const removalRows = new Set<string>();
      for (const group of groups) {
        group.rows.forEach((row, index) => {
          const key = dataRowKey(row);
          groupByRow.set(key, group);
          if (index > 0) removalRows.add(key);
        });
      }
      const emptyRowKeys = new Set(emptyRows.map((row) => dataRowKey(row)));

      const allRows: ResultRow[] = dataRows.map((row) => {
        const key = dataRowKey(row);
        const group = groupByRow.get(key);
        return {
          ...row,
          groupNo: group?.groupNo ?? null,
          duplicateCount: group?.rows.length ?? 1,
          status: group ? 'duplicate' : emptyRowKeys.has(key) ? 'empty-key' : 'unique',
        };
      });

      const duplicateRows = allRows.filter((row) => row.status === 'duplicate');
      const emptyResultRows = allRows.filter((row) => row.status === 'empty-key');
      const dedupedRows = dataRows.filter((row) => !removalRows.has(dataRowKey(row)));

      setResult({
        totalRows: dataRows.length,
        uniqueRows: allRows.filter((row) => row.status === 'unique').length,
        duplicateGroupCount: groups.length,
        duplicateRelatedRows: duplicateRows.length,
        duplicateRemovalRows: removalRows.size,
        emptyKeyRows: emptyRows.length,
        groups,
        allRows,
        duplicateRows,
        emptyRows: emptyResultRows,
        dedupedRows,
      });
      setPreviewFilter('duplicates');
      setError(null);
    } finally {
      setLoading(false);
      setProcessingStatus('');
    }
  };

  const resultRowsForPreview = result
    ? previewFilter === 'duplicates'
      ? [...result.duplicateRows].sort(
          (a, b) =>
            (a.groupNo ?? 0) - (b.groupNo ?? 0) ||
            a.sourceFileName.localeCompare(b.sourceFileName, 'ko') ||
            a.sourceRowNumber - b.sourceRowNumber,
        )
      : previewFilter === 'empty'
        ? result.emptyRows
        : result.allRows
    : [];

  const downloadDuplicateRows = () => {
    if (!result || result.duplicateRows.length === 0) return;
    const rows = result.duplicateRows.map((row) => {
      const data: Record<string, string | number> = {
        중복그룹: row.groupNo ? `중복 그룹 ${row.groupNo}` : '',
        중복개수: row.duplicateCount,
        원본파일명: row.sourceFileName,
        원본행번호: row.sourceRowNumber,
      };
      columns.forEach((column) => {
        data[column.label] = row.values[column.index] ?? '';
      });
      return data;
    });
    createWorkbookAndDownload(rows, `엑클로드_중복행_${baseName}.xlsx`);
  };

  const downloadDedupedRows = () => {
    if (!result) return;
    const rows = result.dedupedRows.map((row) => {
      const data: Record<string, string | number> = { 원본파일명: row.sourceFileName };
      columns.forEach((column) => {
        data[column.label] = row.values[column.index] ?? '';
      });
      return data;
    });
    createWorkbookAndDownload(rows, `엑클로드_중복제거_${baseName}.xlsx`);
  };

  const headerOptions = activeSheet?.rows
    .slice(0, Math.min(activeSheet.rows.length, 30))
    .map((row, index) => ({ index, label: `${index + 1}행 (${row.filter((cell) => normalizeCell(cell)).length}개 열)` })) ?? [];

  return (
    <>
      <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">파일과 검사 기준 설정</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              주문번호, 연락처, 수취인 정보 등을 기준으로 중복 주문을 브라우저에서 검사합니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <label
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
                void loadFiles(Array.from(event.dataTransfer.files));
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-8 text-center hover:bg-blue-50"
            >
              <Upload className="size-8 text-blue-600" aria-hidden />
              <span className="mt-3 text-sm font-bold text-zinc-950">
                주문 엑셀 또는 CSV 파일을 선택해 주세요.
              </span>
              <span className="mt-1 text-xs text-zinc-500">
                xlsx, xls, csv 파일을 지원합니다. 같은 양식이면 여러 파일을 함께 추가할 수 있습니다.
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(event) => {
                  void loadFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
            </label>

            {uploadedFiles.length > 0 && (
              <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 truncate font-medium text-zinc-800">
                    {fileName}
                    {fileSize !== null && <span className="ml-2 text-zinc-500">({formatFileSize(fileSize)})</span>}
                  </span>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="inline-flex w-fit items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                  >
                    <X className="size-3.5" aria-hidden />
                    파일 모두 제거
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                  {uploadedFiles.map((file) => (
                    <li key={`${file.name}-${file.size}`} className="truncate">
                      {file.name}
                      {file.size !== null && <span className="ml-1 text-zinc-400">({formatFileSize(file.size)})</span>}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 inline-flex w-fit items-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  파일 추가
                </button>
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              업로드한 파일은 서버로 전송되거나 저장되지 않으며 현재 브라우저에서만 처리됩니다.
            </p>

            {loading && processingStatus && (
              <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-700">
                {processingStatus}
              </div>
            )}

            {error && (
              <div
                className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={loadExample}
              className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              예시 데이터 불러오기
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RotateCcw className="size-4" aria-hidden />
              초기화
            </button>
          </div>

          {activeSheet && (
            <>
              {sheets.length > 1 && (
                <label className="block">
                  <span className="text-sm font-bold text-zinc-950">검사할 시트</span>
                  <select
                    value={selectedSheetIndex}
                    onChange={(event) => handleSheetChange(Number(event.target.value))}
                    className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                  >
                    {sheets.map((sheet, index) => (
                      <option key={sheet.name} value={index}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-sm font-bold text-zinc-950">열 제목이 있는 행</span>
                <select
                  value={headerRowIndex}
                  onChange={(event) => handleHeaderChange(Number(event.target.value))}
                  className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                >
                  {headerOptions.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <p className="text-sm font-bold text-zinc-950">중복 기준 빠른 선택</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => addQuickColumns(quickColumns.order)}
                    disabled={quickColumns.order.length === 0}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold disabled:text-zinc-400 ${
                      includesColumnSet(selectedColumnIndexes, quickColumns.order)
                        ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    주문번호
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuickColumns(quickColumns.phone)}
                    disabled={quickColumns.phone.length === 0}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold disabled:text-zinc-400 ${
                      includesColumnSet(selectedColumnIndexes, quickColumns.phone)
                        ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    연락처
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuickColumns(quickColumns.recipientAddress)}
                    disabled={quickColumns.recipientAddress.length === 0}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold disabled:text-zinc-400 ${
                      includesColumnSet(selectedColumnIndexes, quickColumns.recipientAddress)
                        ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    수취인 + 주소
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedColumns}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                      selectedColumnIndexes.length === 0
                        ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    직접 열 선택
                  </button>
                </div>
              </div>

              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-zinc-950">직접 열 선택</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      1개 이상의 열을 선택할 수 있습니다. 선택한 모든 열의 값이 같을 때 중복으로 판단합니다.
                    </p>
                    <p className="mt-1 text-xs font-semibold text-zinc-600">
                      선택한 열: {selectedColumnIndexes.length.toLocaleString('ko-KR')}개
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={selectAllColumns}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedColumns}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                    >
                      선택 해제
                    </button>
                  </div>
                </div>
                {selectedColumnIndexes.length >= 5 && (
                  <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">
                    선택한 열이 많을수록 모든 값이 같아야 하므로 중복이 적게 발견될 수 있습니다.
                  </p>
                )}
                <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  {columns.map((column) => (
                    <label
                      key={column.index}
                      title={column.label}
                      className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
                        selectedColumnIndexes.includes(column.index)
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-zinc-200 bg-white text-zinc-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedColumnIndexes.includes(column.index)}
                        onChange={() => toggleColumn(column.index)}
                        className="size-3.5 shrink-0"
                      />
                      <span className="min-w-0 truncate">{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={runCheck}
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? '검사 중...' : '중복 검사하기'}
          </button>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <h3 className="text-lg font-bold text-zinc-950">검사 결과</h3>
        {!result ? (
          <p className="mt-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-sm leading-relaxed text-zinc-600">
            파일과 중복 기준을 선택한 뒤 중복 검사하기를 누르면 결과가 표시됩니다.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {cleanupNotice?.cleaned && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800">
                <p className="font-semibold">
                  파일에 불필요한 빈 서식 행이 많이 포함되어 있어 자동으로 정리한 뒤 검사했습니다.
                </p>
                <p className="mt-1">
                  실제 데이터 {result.totalRows.toLocaleString('ko-KR')}행을 기준으로 검사했습니다.
                  {cleanupNotice.removedEmptyRows > 0 &&
                    ` 빈 서식 행 ${cleanupNotice.removedEmptyRows.toLocaleString('ko-KR')}개를 제외했습니다.`}
                </p>
              </div>
            )}

            <div
              className={`rounded-md border p-4 ${
                result.duplicateGroupCount === 0
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                  : 'border-amber-100 bg-amber-50 text-amber-900'
              }`}
            >
              <p className="font-semibold">
                {result.duplicateGroupCount === 0
                  ? '선택한 기준으로 확인된 중복 주문이 없습니다.'
                  : `중복 그룹 ${result.duplicateGroupCount.toLocaleString('ko-KR')}개를 찾았습니다.`}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <span>전체 데이터: {result.totalRows.toLocaleString('ko-KR')}건</span>
                <span>정상 또는 고유 행: {result.uniqueRows.toLocaleString('ko-KR')}건</span>
                <span>중복 관련 행: {result.duplicateRelatedRows.toLocaleString('ko-KR')}건</span>
                <span>중복 제거 대상: {result.duplicateRemovalRows.toLocaleString('ko-KR')}건</span>
                <span>기준값 없음: {result.emptyKeyRows.toLocaleString('ko-KR')}건</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={downloadDuplicateRows}
                disabled={result.duplicateRows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400"
              >
                <Download className="size-4" aria-hidden />
                중복 행만 엑셀로 받기
              </button>
              <button
                type="button"
                onClick={() => setDedupeConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <Download className="size-4" aria-hidden />
                중복 제거 파일 받기
              </button>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              원본 파일은 변경되지 않습니다. 다운로드 파일은 새로 만들어지며 원본의 일부 서식이나 수식은 유지되지 않을 수 있습니다.
            </p>

            <div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'duplicates', label: '중복만 보기' },
                  { value: 'all', label: '전체 보기' },
                  { value: 'empty', label: '기준값 없음' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setPreviewFilter(filter.value as PreviewFilter)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      previewFilter === filter.value
                        ? 'bg-blue-600 text-white'
                        : 'border border-zinc-200 bg-white text-zinc-600'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 h-[420px] max-w-full overflow-auto rounded-lg border border-zinc-200">
                <table className="min-w-max text-left text-xs">
                  <thead className="bg-zinc-100 text-zinc-700">
                    <tr>
                      <th className="px-3 py-2">중복 그룹</th>
                      <th className="px-3 py-2">원본 파일</th>
                      <th className="px-3 py-2">원본 행</th>
                      {columns.map((column) => (
                        <th key={column.index} className="px-3 py-2">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultRowsForPreview.slice(0, MAX_PREVIEW_ROWS).map((row, index, visibleRows) => {
                      const startsNewGroup =
                        previewFilter === 'duplicates' &&
                        index > 0 &&
                        row.groupNo !== visibleRows[index - 1]?.groupNo;

                      return (
                        <tr
                          key={dataRowKey(row)}
                          className={`${row.status === 'duplicate' ? 'bg-orange-50' : row.status === 'empty-key' ? 'bg-zinc-50' : 'bg-white'} ${
                            startsNewGroup ? 'border-t-4 border-orange-200' : ''
                          }`}
                        >
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">
                            {row.groupNo ? `중복 그룹 ${row.groupNo}` : row.status === 'empty-key' ? '기준값 없음' : '-'}
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-2">{row.sourceFileName}</td>
                          <td className="whitespace-nowrap px-3 py-2">원본 {row.sourceRowNumber}행</td>
                          {columns.map((column) => (
                            <td key={column.index} className="max-w-[180px] truncate px-3 py-2">
                              {row.values[column.index] ?? ''}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {resultRowsForPreview.length === 0 && (
                      <tr>
                        <td colSpan={columns.length + 3} className="px-3 py-8 text-center text-zinc-500">
                          표시할 행이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {resultRowsForPreview.length > MAX_PREVIEW_ROWS && (
                <p className="mt-2 text-xs text-zinc-500">
                  화면에는 처음 200개 행만 표시되며 다운로드 파일에는 전체 결과가 포함됩니다.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      </div>
      {dedupeConfirmOpen && result && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dedupe-download-title"
            className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6 shadow-xl"
          >
            <h3 id="dedupe-download-title" className="text-lg font-bold text-zinc-950">
              중복 제거 파일을 다운로드할까요?
            </h3>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-600">
              <p>
                중복 그룹마다 <strong className="text-zinc-900">처음 나온 1건은 유지</strong>하고,
                두 번째 행부터 제거한 새 엑셀 파일을 만듭니다.
              </p>
              <p>
                중복 제거 대상은{' '}
                <strong className="text-red-700">
                  {result.duplicateRemovalRows.toLocaleString('ko-KR')}건
                </strong>
                입니다. 기준값이 없는 행과 중복이 아닌 행은 그대로 유지됩니다.
              </p>
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                선택한 기준 열이 같더라도 상품명, 수량, 옵션, 배송메시지 등 다른 내용은 서로 다를 수
                있습니다. 다운로드 후 삭제된 주문이 실제로 제외해도 되는 주문인지 확인하고, 필요한
                상품명·수량·옵션은 직접 수정해 주세요.
              </p>
              <p className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-500">
                원본 파일은 변경되지 않습니다. 다운로드 파일만 새로 생성됩니다.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setDedupeConfirmOpen(false)}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadDedupedRows();
                  setDedupeConfirmOpen(false);
                }}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                확인 후 다운로드
              </button>
            </div>
          </div>
        </div>
      )}

      {excelUnlockUi}
    </>
  );
}
