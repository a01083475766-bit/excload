/**
 * Text preprocessing utilities
 * Common text preprocessing functions for refinement engine
 */

/**
 * 인삿말·의례·종결·대화체 불용어 목록
 * 요청사항 추출 직전에만 사용되며, 다른 엔티티 추출 로직에는 영향을 주지 않음
 */
export const COURTESY_STOPWORDS = [
  '안녕하세요',
  '감사합니다',
  '부탁드립니다',
  '수고하세요',
  '입니다',
  '해주세요',
  '혹시',
];

/**
 * 텍스트에서 인삿말·의례·종결·대화체 불용어를 제거
 * 
 * @param text - 원본 텍스트
 * @returns 불용어가 제거된 텍스트
 */
export function removeCourtesyStopwords(text: string): string {
  let processedText = text;
  
  // 불용어 목록을 순회하며 제거
  for (const stopword of COURTESY_STOPWORDS) {
    // 이스케이프 처리
    const escapedStopword = stopword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 다양한 패턴으로 불용어 제거
    // 1. 앞뒤 공백이 있는 경우: " 안녕하세요 " -> " "
    // 2. 앞 공백만 있는 경우: " 안녕하세요" -> ""
    // 3. 뒤 공백만 있는 경우: "안녕하세요 " -> ""
    // 4. 문장 시작: "안녕하세요" -> ""
    // 5. 문장 끝: "안녕하세요" -> ""
    // 6. 문장 부호와 함께: "안녕하세요." -> "."
    
    const patterns = [
      new RegExp(`\\s+${escapedStopword}\\s+`, 'g'), // 앞뒤 공백
      new RegExp(`^${escapedStopword}\\s+`, 'g'), // 시작 + 뒤 공백
      new RegExp(`\\s+${escapedStopword}$`, 'g'), // 앞 공백 + 끝
      new RegExp(`^${escapedStopword}$`, 'g'), // 전체가 불용어
      new RegExp(`\\s+${escapedStopword}[.!?]`, 'g'), // 앞 공백 + 뒤 문장부호
      new RegExp(`${escapedStopword}[.!?]`, 'g'), // 뒤 문장부호만
      new RegExp(`^${escapedStopword}[.!?]`, 'g'), // 시작 + 뒤 문장부호
    ];
    
    for (const pattern of patterns) {
      processedText = processedText.replace(pattern, (match) => {
        // 문장 부호가 포함된 경우 문장 부호만 남기기
        const punctuation = match.match(/[.!?]/)?.[0];
        if (punctuation) {
          // 앞 공백이 있으면 공백 유지
          if (match.startsWith(' ')) {
            return ' ' + punctuation;
          }
          return punctuation;
        }
        // 공백만 있는 경우 공백 하나로 대체
        if (match.trim() === '') {
          return ' ';
        }
        // 불용어만 있는 경우 제거
        return '';
      });
    }
  }
  
  // 연속된 공백을 하나로 정리
  processedText = processedText.replace(/\s+/g, ' ').trim();
  
  return processedText;
}

