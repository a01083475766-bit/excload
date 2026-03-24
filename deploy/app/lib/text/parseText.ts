/**
 * .txt 파일을 읽어 Record<string, any>[] 형태의 rows 반환
 * 각 줄을 하나의 row로 처리하며, rawText 필드에 해당 줄의 텍스트를 포함
 * 
 * @param file - 읽을 .txt 파일 (File 객체)
 * @returns 각 줄을 객체로 변환한 배열 (rawText 필드 포함)
 * @throws 파일을 읽을 수 없는 경우 에러 발생
 */
export async function parseText(file: File): Promise<Record<string, any>[]> {
  console.log('=== parseText 함수 시작 ===');
  console.log('입력 파일명:', file.name);
  console.log('입력 파일 크기:', file.size, 'bytes');
  
  // File을 텍스트로 읽기
  const text = await file.text();
  console.log('텍스트 읽기 완료, 길이:', text.length, 'characters');
  
  // 줄 단위로 분리 (빈 줄 제외하지 않음 - 이후 엔진에서 처리)
  const lines = text.split(/\r?\n/);
  console.log('총 줄 수:', lines.length);
  
  // 각 줄을 row로 변환
  const rows: Record<string, any>[] = lines.map((line, index) => {
    return {
      rawText: line.trim(), // 각 줄의 텍스트를 rawText 필드에 저장
    };
  });
  
  console.log('파싱 완료, row 개수:', rows.length);
  if (rows.length > 0) {
    console.log('첫 번째 row:', rows[0]);
  }
  
  return rows;
}
