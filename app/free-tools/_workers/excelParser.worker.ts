import JSZip from 'jszip';
import * as XLSX from 'xlsx';

type WorkerRequest = {
  id: string;
  fileName: string;
  extension: string;
  buffer: ArrayBuffer;
};

type CleanupStats = {
  cleaned: boolean;
  removedEmptyRows: number;
  rowsWithCells: number;
};

type SheetData = {
  name: string;
  rows: string[][];
};

const MAX_WORKSHEET_XML_SIZE = 100 * 1024 * 1024;
const MAX_TOTAL_XML_SIZE = 200 * 1024 * 1024;

function normalizeCell(value: unknown) {
  return String(value ?? '').trim();
}

function rowHasValue(row: string[]) {
  return row.some((cell) => normalizeCell(cell) !== '');
}

function postStatus(id: string, message: string) {
  self.postMessage({ type: 'status', id, message });
}

async function cleanupXlsxBuffer(buffer: ArrayBuffer, id: string): Promise<{ buffer: ArrayBuffer; stats: CleanupStats }> {
  postStatus(id, '파일 구조를 확인하고 있습니다.');
  const zip = await JSZip.loadAsync(buffer);
  const worksheetFiles = Object.values(zip.files).filter(
    (file) => !file.dir && /^xl\/worksheets\/sheet\d+\.xml$/i.test(file.name),
  );

  let totalXmlSize = 0;
  let removedEmptyRows = 0;
  let rowsWithCells = 0;
  let cleaned = false;

  postStatus(id, '불필요한 빈 서식 행을 정리하고 있습니다.');

  for (const file of worksheetFiles) {
    const xml = await file.async('string');
    totalXmlSize += xml.length;

    if (xml.length > MAX_WORKSHEET_XML_SIZE || totalXmlSize > MAX_TOTAL_XML_SIZE) {
      throw new Error('파일 내부에 지나치게 많은 빈 행이나 서식이 포함되어 있습니다. 엑셀에서 실제 데이터만 새 파일로 저장한 뒤 다시 시도해 주세요.');
    }

    let fileRemovedRows = 0;
    let fileRowsWithCells = 0;
    const nextXml = xml
      .replace(/<dimension\b[^>]*\/>/i, '')
      .replace(/<row\b[\s\S]*?(?:\/>|<\/row>)/g, (rowXml) => {
        if (/<c\b/i.test(rowXml)) {
          fileRowsWithCells += 1;
          return rowXml;
        }
        fileRemovedRows += 1;
        return '';
      });

    if (fileRemovedRows > 0) {
      cleaned = true;
      removedEmptyRows += fileRemovedRows;
      rowsWithCells += fileRowsWithCells;
      zip.file(file.name, nextXml);
    } else {
      rowsWithCells += fileRowsWithCells;
    }
  }

  if (!cleaned) {
    return {
      buffer,
      stats: { cleaned: false, removedEmptyRows: 0, rowsWithCells },
    };
  }

  const cleanedBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return {
    buffer: cleanedBuffer,
    stats: { cleaned, removedEmptyRows, rowsWithCells },
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, fileName, extension, buffer } = event.data;

  try {
    const shouldCleanup = extension === 'xlsx';
    const cleaned = shouldCleanup
      ? await cleanupXlsxBuffer(buffer, id)
      : {
          buffer,
          stats: { cleaned: false, removedEmptyRows: 0, rowsWithCells: 0 },
        };

    postStatus(id, '주문 데이터를 읽고 있습니다.');
    const workbook = XLSX.read(cleaned.buffer, { type: 'array', raw: false, dense: true });
    const sheets: SheetData[] = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils
        .sheet_to_json<string[]>(workbook.Sheets[name], {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        })
        .filter(rowHasValue),
    }));

    self.postMessage({
      type: 'done',
      id,
      fileName,
      sheets,
      cleanupStats: cleaned.stats,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message:
        error instanceof Error
          ? error.message
          : '파일을 읽을 수 없습니다. 암호가 설정되어 있거나 손상된 파일인지 확인해 주세요.',
    });
  }
};
