import * as XLSX from 'xlsx';

/**
 * XLSX 워크북을 생성하고 브라우저 File 객체로 반환하는 함수
 * 
 * @param data - 2차원 배열 형태의 데이터 (첫 번째 행은 헤더)
 * @param fileName - 생성할 파일명 (기본값: 'AI_주문.xlsx')
 * @param sheetName - 시트 이름 (기본값: 'Sheet1')
 * @returns File 객체
 * 
 * @example
 * ```typescript
 * const excelData = [
 *   ['이름', '전화번호', '주소', '상품'],
 *   ['홍길동', '010-1234-5678', '서울시 강남구', '상품A'],
 * ];
 * const file = createExcelFile(excelData, 'AI_주문.xlsx');
 * ```
 */
export function createExcelFile(
  data: any[][],
  fileName: string = 'AI_주문.xlsx',
  sheetName: string = 'Sheet1'
): File {
  // 1. 워크북 생성
  const wb = XLSX.utils.book_new();
  
  // 2. 워크시트 생성
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // 3. 워크북에 워크시트 추가
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // 4. ArrayBuffer 생성
  const arrayBuffer = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
  });
  
  // 5. MIME 타입 정의
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  
  // 6. File 객체 생성
  const file = new File([arrayBuffer], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
  
  return file;
}

/**
 * XLSX 워크북을 생성하고 ArrayBuffer로 반환하는 함수
 * 
 * @param data - 2차원 배열 형태의 데이터 (첫 번째 행은 헤더)
 * @param sheetName - 시트 이름 (기본값: 'Sheet1')
 * @returns ArrayBuffer
 * 
 * @example
 * ```typescript
 * const excelData = [['이름', '전화번호'], ['홍길동', '010-1234-5678']];
 * const arrayBuffer = createExcelArrayBuffer(excelData);
 * ```
 */
export function createExcelArrayBuffer(
  data: any[][],
  sheetName: string = 'Sheet1'
): ArrayBuffer {
  // 1. 워크북 생성
  const wb = XLSX.utils.book_new();
  
  // 2. 워크시트 생성
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // 3. 워크북에 워크시트 추가
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // 4. ArrayBuffer 생성
  const arrayBuffer = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
  });
  
  return arrayBuffer;
}

/**
 * File 객체를 다운로드하는 헬퍼 함수
 * 
 * @param file - 다운로드할 File 객체
 * 
 * @example
 * ```typescript
 * const file = createExcelFile(data, 'AI_주문.xlsx');
 * downloadFile(file);
 * ```
 */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * XLSX 데이터를 생성하고 즉시 다운로드하는 함수
 * 
 * @param data - 2차원 배열 형태의 데이터 (첫 번째 행은 헤더)
 * @param fileName - 생성할 파일명 (기본값: 'AI_주문.xlsx')
 * @param sheetName - 시트 이름 (기본값: 'Sheet1')
 * 
 * @example
 * ```typescript
 * const excelData = [['이름', '전화번호'], ['홍길동', '010-1234-5678']];
 * createAndDownloadExcel(excelData, 'AI_주문.xlsx');
 * ```
 */
export function createAndDownloadExcel(
  data: any[][],
  fileName: string = 'AI_주문.xlsx',
  sheetName: string = 'Sheet1'
): void {
  const file = createExcelFile(data, fileName, sheetName);
  downloadFile(file);
}
