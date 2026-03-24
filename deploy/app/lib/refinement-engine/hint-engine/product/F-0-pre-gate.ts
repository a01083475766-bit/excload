/**
 * F-0 Pre-Gate: ProductCandidate 생성 전 요청/명령 문장 필터링
 * 
 * 문장 단위로 요청/명령 문장인지 판별하여,
 * 요청/명령 문장은 product 파이프라인에 진입시키지 않고 requestText로만 남기도록 함
 */

/**
 * 문장 단위로 요청/명령 문장인지 판별하는 함수
 * 
 * 다음 키워드가 포함된 문장은 요청/명령 문장으로 판별:
 * - 주문
 * - 배송
 * - 부탁
 * - 요청
 * - 해주세요
 * - 종결어미 (습니다, 해요, 하세요, 주세요, 부탁드립니다, 바랍니다 등)
 * 
 * @param sentence - 판별할 문장
 * @returns true면 요청/명령 문장, false면 일반 문장
 */
export function isRequestSentence(sentence: string): boolean {
  const trimmedSentence = sentence.trim();
  
  // 빈 문장은 false 반환
  if (trimmedSentence.length === 0) {
    return false;
  }
  
  // 요청/명령 키워드 패턴
  const requestKeywords = [
    '주문',
    '배송',
    '부탁',
    '요청',
    '해주세요',
  ];
  
  // 종결어미 패턴 (정규표현식)
  // 한국어 종결어미 패턴: ~습니다, ~해요, ~하세요, ~주세요, ~부탁드립니다, ~바랍니다 등
  const endingPatterns = [
    /습니다$/,
    /해요$/,
    /하세요$/,
    /주세요$/,
    /부탁드립니다$/,
    /바랍니다$/,
    /드립니다$/,
    /드려요$/,
    /해드려요$/,
    /해드리세요$/,
    /해주세요$/,
    /해주시면$/,
    /해주시고$/,
    /해주시고요$/,
    /해주시겠어요$/,
    /해주시겠습니다$/,
    /해주시기를$/,
    /해주시기를요$/,
    /해주시기를 바랍니다$/,
    /해주시기를 부탁드립니다$/,
    /해주시기를 부탁합니다$/,
    /해주시기를 부탁드려요$/,
    /해주시기를 부탁드리세요$/,
    /해주시기를 부탁드리겠어요$/,
    /해주시기를 부탁드리겠습니다$/,
  ];
  
  // 요청/명령 키워드가 포함되어 있는지 확인
  for (const keyword of requestKeywords) {
    if (trimmedSentence.includes(keyword)) {
      return true;
    }
  }
  
  // 종결어미 패턴이 매칭되는지 확인
  for (const pattern of endingPatterns) {
    if (pattern.test(trimmedSentence)) {
      return true;
    }
  }
  
  return false;
}

