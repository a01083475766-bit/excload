/**
 * EXCLOAD Template Pipeline - 헤더 추출 함수
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage1 Template Pipeline 전용
 * 
 * 엑셀 파일에서 첫 번째 행의 헤더를 추출합니다.
 */

import * as XLSX from 'xlsx';

/**
 * 엑셀 파일에서 첫 번째 행의 헤더를 추출합니다.
 * 
 * @param file - 읽을 엑셀 파일 (File 객체)
 * @returns 첫 번째 행의 헤더 배열 (string[])
 * @throws 파일을 읽을 수 없거나 시트가 없는 경우 에러 발생
 * 
 * @example
 * ```typescript
 * const headers = await extractTemplateHeaders(file);
 * // ['받는분', '받는분전화', '받는분주소', ...]
 * ```
 */
export async function extractTemplateHeaders(file: File): Promise<string[]> {
  // File을 ArrayBuffer로 읽기
  const arrayBuffer = await file.arrayBuffer();
  
  // 워크북 읽기
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  // 첫 번째 시트 이름 가져오기
  const firstSheetName = workbook.SheetNames[0];
  
  if (!firstSheetName) {
    throw new Error('엑셀 파일에 시트가 없습니다.');
  }
  
  // 첫 번째 시트 가져오기
  const worksheet = workbook.Sheets[firstSheetName];
  
  // 첫 번째 행(헤더) 추출
  const headerRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as any[][];
  
  const headerRow = headerRows[0] || [];
  
  // 헤더 배열로 변환 (빈 문자열 제거 및 trim)
  const headers: string[] = headerRow
    .map((h: any) => String(h || '').trim())
    .filter((h: string) => h !== ''); // 빈 헤더 제거
  
  console.log('[Stage1] Extracted Headers:', headers);
  
  return headers;
}
