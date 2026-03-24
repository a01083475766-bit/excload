/**
 * Name refinement function
 * Extracts name-like string candidates from input text
 */

import type { InputText } from '@/app/lib/refinement-engine/types/InputText';
import type { EntityResult } from '@/app/lib/refinement-engine/types/EntityResult';
import type { EntityHint } from '@/app/lib/refinement-engine/types/EntityHint';

/**
 * HOLD 플래그: 엔티티 결합 억제
 * - 이름 기반 그룹핑 비활성화
 */
const HOLD_BATCH_PROCESSING = true;

/**
 * 한국 성씨 목록 (단일 성씨 및 복성)
 */
const KOREAN_SURNAMES = new Set([
  // 주요 단일 성씨
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
  '한', '오', '서', '신', '권', '황', '안', '송', '류', '전',
  '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남',
  '심', '노', '하', '곽', '성', '차', '주', '우', '구', '라',
  '민', '진', '지', '엄', '채', '원', '천', '방', '공', '현',
  '함', '변', '염', '여', '추', '도', '소', '석', '선', '설',
  '마', '길', '연', '위', '표', '명', '기', '반', '왕', '금',
  '옥', '육', '인', '맹', '제', '모', '탁', '국', '어', '은',
  '편', '용', '예', '봉', '경', '사', '부', '피', '나', '로',
  '뢰', '누', '단', '담', '당', '대', '독', '돈', '동', '두',
  '란', '람', '량', '려', '련', '렬', '렴', '렵', '령', '료',
  '륙', '률', '륭', '륵', '름', '릉', '리', '린', '림', '립',
  '만', '말', '목', '묵', '미', '밀', '범', '법', '벽', '별',
  '보', '복', '북', '분', '비', '빈', '산', '삼', '상', '섭',
  '세', '수', '순', '숙', '숭', '실', '아', '애', '야', '억',
  '언', '열', '영', '온', '옹', '완', '요', '운', '육', '을',
  '음', '응', '의', '일', '입', '자', '잠', '재', '점', '종',
  '좌', '죽', '준', '중', '질', '집', '착', '찬', '찰', '창',
  '책', '처', '철', '첨', '청', '체', '초', '촉', '촌', '총',
  '촬', '추', '춘', '출', '충', '치', '탄', '탈', '탐', '탑',
  '탕', '태', '택', '판', '팽', '평', '포', '품', '풍', '학',
  '함', '합', '항', '해', '핵', '행', '향', '헌', '혈', '혁',
  '형', '혜', '호', '혹', '혼', '홀', '화', '확', '환', '활',
  '회', '획', '효', '후', '훈', '훌', '훙', '훤', '훼', '휘',
  '휴', '흉', '흑', '흔', '흘', '흠', '흡', '흥', '흩', '희',
  '힐', '힘',
  // 복성
  '남궁', '황보', '제갈', '사공', '선우', '서문', '독고', '동방', '어금', '망절',
  '무본', '무모', '사마', '소봉', '장곡', '전곡', '평원', '강전'
]);

/**
 * 조사·존칭 토큰 목록 (이름 value에서 제거하되, 원문 정보는 유지)
 */
const HONORIFIC_AND_PARTICLE_TOKENS = [
  '님', '께', '에게', '귀하', '께서', '한테', '께서는', '님께', '님에게', '님께서',
  '을', '를', '이', '가', '의', '에', '에서', '으로', '로', '와', '과', '도', '만',
  '부터', '까지', '처럼', '만큼', '보다', '같이', '는', '조차', '마저'
];

/**
 * 건물 관련 키워드 목록 (이름 후보에서 제외)
 */
const BUILDING_KEYWORDS = [
  '빌딩', '타워', '센터', '플라자', '아파트', '오피스텔', '상가'
];

/**
 * 수량·요청 문맥 단어 목록 (이름 후보에서 제외)
 */
const QUANTITY_REQUEST_KEYWORDS = [
  '하나', '둘', '한개', '두개', '세개', '하나요', '주세요', '부탁', '요청'
];

/**
 * 이름 후보 필터링용 블랙리스트 (점수 계산 전에 즉시 제거)
 */
const BLACKLIST_KEYWORDS = [
  '연락처', '전화', '전화번호', '주소', '수신자', '받는분', '받는 분',
  '이름', '성함', '고객', '고객명'
];

/**
 * 단독 명사 빈출 리스트 (문장 끝 10자 이내에 있으면 -40점 보정)
 */
const FREQUENT_NOUNS = [
  '포장', '보관', '배송', '요청', '옵션', '확인', '문의', '전달'
];

/**
 * 한글 2~4자 패턴 추출 및 성씨 검증
 */
interface NameCandidate {
  text: string;
  startIndex: number;
  endIndex: number;
  score: number;
}

/**
 * 이름 후보에서 조사·존칭 토큰(님, 는, 께, 에게)을 모두 제거한 순수 이름만 반환
 * 원문의 startIndex/endIndex는 조사·존칭 토큰을 포함한 전체 범위로 유지
 * 점수는 감점하지 않음
 * 
 * @param candidate - 원문에서 매칭된 전체 텍스트 (조사·존칭 토큰 포함 가능) 또는 이미 정규화된 이름
 * @param originalText - 원문 텍스트 (뒤 문맥 확인용, optional)
 * @param candidateEndIndex - 후보의 원문 기준 endIndex (뒤 문맥 확인용, optional)
 * @param alreadyNormalized - 이미 정규화된 이름인지 여부 (true면 조사 제거 로직을 건너뜀)
 * @returns 조사·존칭 토큰이 제거된 순수 이름
 */
function removeHonorificAndParticles(
  candidate: string,
  originalText?: string,
  candidateEndIndex?: number,
  alreadyNormalized: boolean = false
): string {
  // 이미 정규화된 이름인 경우 조사 제거 로직을 건너뛰고 그대로 반환
  if (alreadyNormalized) {
    return candidate;
  }
  let cleanedName = candidate;
  
  // 1단계: "님", "께", "에게", "는"을 더 이상 존재하지 않을 때까지 반복 제거
  // "에게"를 먼저 확인해야 "께"와 중복되지 않음
  const tokens = ['에게', '께', '님', '는'];
  
  let changed = true;
  while (changed) {
    changed = false;
    for (const token of tokens) {
      if (cleanedName.endsWith(token)) {
        cleanedName = cleanedName.slice(0, -token.length);
        changed = true;
        break; // 한 번에 하나씩 제거하고 다시 확인
      }
    }
  }
  
  return cleanedName;
}

/**
 * localText에서 이름 후보를 추출하고, 원문 기준 인덱스로 변환
 * 
 * @param localText - PHONE + ADDRESS 범위가 은신된 텍스트 (이름 후보 추출용)
 * @param originalText - 원문 텍스트 (인덱스 계산용)
 * @returns 원문 기준 인덱스를 가진 이름 후보 배열
 */
function extractNameCandidates(localText: string, originalText: string): NameCandidate[] {
  const candidates: NameCandidate[] = [];
  
  // 한글 2~4자 패턴 매칭 (조사·존칭 토큰 포함 가능)
  // 조사·존칭 토큰이 포함된 경우를 고려하여 더 긴 패턴도 매칭
  const koreanNamePattern = /[가-힣]{2,6}/g;
  let match;
  
  while ((match = koreanNamePattern.exec(localText)) !== null) {
    const fullMatch = match[0];
    const localStartIndex = match.index;
    const localEndIndex = match.index + fullMatch.length;
    
    // 조사·존칭 토큰(님, 는, 께, 에게)을 제거한 순수 이름 추출
    // 원문 기준으로 단 1회만 수행하기 위해 원문 정보 전달
    // localText와 originalText는 길이가 동일하고 인덱스가 그대로 매핑되므로 localEndIndex를 originalText 기준으로 사용
    const originalEndIndex = localEndIndex;
    const cleanedName = removeHonorificAndParticles(fullMatch, originalText, originalEndIndex, false);
    
    // 조사만으로 구성된 경우는 제외
    if (cleanedName.length === 0) {
      continue;
    }
    
    // 후처리: 제거 후 순수 이름 길이(2~4자)를 다시 검증
    if (cleanedName.length < 2 || cleanedName.length > 4) {
      continue;
    }
    
    // 성씨 검증: 첫 글자 또는 첫 두 글자가 성씨 목록에 있는지 확인
    const firstChar = cleanedName[0];
    const firstTwoChars = cleanedName.length >= 2 ? cleanedName.substring(0, 2) : '';
    
    if (KOREAN_SURNAMES.has(firstChar) || (firstTwoChars && KOREAN_SURNAMES.has(firstTwoChars))) {
      // localText에서 매칭된 텍스트를 원문에서 찾아 원문 기준 인덱스 계산
      // localText와 originalText는 길이가 동일하므로 인덱스가 그대로 매핑됨
      // 단, localText에서 공백으로 은신된 부분은 원문에서 실제 문자이므로
      // localText의 인덱스를 그대로 원문 인덱스로 사용 가능
      const originalStartIndex = localStartIndex;
      const originalEndIndex = localEndIndex;
      
      // text에는 조사·존칭 토큰이 제거된 순수 이름만 저장
      // startIndex/endIndex는 원문 기준으로 유지 (조사·존칭 토큰 포함)
      // score는 나중에 점수 계산 단계에서 덮어쓰므로 임시로 0 설정
      candidates.push({
        text: cleanedName,
        startIndex: originalStartIndex,
        endIndex: originalEndIndex,
        score: 0,
      });
    }
  }
  
  return candidates;
}

/**
 * Refines names from input text
 * Extracts name-like string candidates and returns them as EntityResult<string>
 * 
 * ============================================================================
 * 명시적 규칙: Phone/Address 엔티티 참조 (힌트 전용)
 * ============================================================================
 * 규칙 1: phoneResult와 addressResult는 오직 힌트(hint) 계산에만 사용됨
 * 규칙 2: phoneResult.selected/value/candidates를 이름 확정 판단에 직접 사용하지 않음
 * 규칙 3: addressResult.selected/value/candidates를 이름 확정 판단에 직접 사용하지 않음
 * 규칙 4: phoneResult와 addressResult는 위치 정보(hint)로만 활용되며, 점수 계산에만 반영됨
 * 규칙 5: HOLD_BATCH_PROCESSING이 true일 때는 addressResult 힌트를 점수에 반영하지 않고 힌트로만 기록
 * ============================================================================
 * 
 * 규칙:
 * - InputText 기준 이름 후보를 추출
 * - 한국 성씨 목록(단일·복성)을 기반으로 한글 2~4자 패턴만 후보로 인정
 * - 성씨가 일치하는 경우 기본 점수를 500점으로 설정
 * - 후보 startIndex 기준 앞뒤 인접 범위에 전화번호 후보가 존재하면 +30점 (힌트 기반)
 * - 주소 START~END 확정 범위 내부 또는 인접하면 +30점을 각각 추가 (힌트 기반, HOLD일 때는 힌트로만 기록)
 * - 성씨 기반 규칙과 인명 패턴을 통과한 이름 후보는 기존 점수 체계를 그대로 유지
 * - 생성된 이름 후보들 중 가장 높은 점수를 가진 1개만 이름으로 확정
 * - 동일 점수일 경우 원문에서 가장 먼저 등장한 것을 선택
 * - 확정된 이름의 range는 LOCK 처리하여 다른 파이프라인이나 엔티티 판단에 재사용하지 않음
 * - 이후 단계에서는 점수 경쟁이나 확정 판단에 사용하지 않고 수령자·담당자 등 사람 문맥 힌트로만 활용
 * 
 * @param input - InputText containing the text to process
 * @param phoneResult - Phone refinement result (optional, 힌트 전용 - 점수 계산에만 사용)
 * @param addressResult - Address refinement result (optional, 힌트 전용 - 점수 계산에만 사용)
 * @returns EntityResult<string> with name candidates
 */
export function refineName(
  input: InputText,
  phoneResult?: EntityResult<string>,
  addressResult?: EntityResult<string>
): EntityResult<string> {
  const text = input.text;
  
  // ============================================================================
  // PHONE + ADDRESS 범위 은신 처리: localText 생성
  // ============================================================================
  // 규칙: phoneResult.hints.maskRanges에서 PHONE 타입 범위 추출하여 은신
  // 규칙: addressResult.hints.maskRanges에서 ADDRESS 타입 범위 추출하여 은신
  // 규칙: PHONE + ADDRESS 범위만 은신하고 그 외 범위는 절대 건드리지 않음
  // 규칙: 후보 생성은 localText 기준으로만 수행
  // 규칙: index 계산, startIndex/endIndex, 점수 계산, resolver 로직은 원문(text) 기준 유지
  // ============================================================================
  let localText = text;
  
  // PHONE 타입 maskRanges 추출
  const phoneMaskRanges: Array<{ startIndex: number; endIndex: number }> = [];
  if (phoneResult?.hints?.maskRanges) {
    const filtered = phoneResult.hints.maskRanges.filter(
      range => range.entityType === 'PHONE'
    );
    phoneMaskRanges.push(...filtered.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // ADDRESS 타입 maskRanges 추출
  const addressMaskRanges: Array<{ startIndex: number; endIndex: number }> = [];
  if (addressResult?.hints?.maskRanges) {
    const filtered = addressResult.hints.maskRanges.filter(
      range => range.entityType === 'ADDRESS'
    );
    addressMaskRanges.push(...filtered.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // PHONE + ADDRESS 범위가 하나라도 있으면 은신 처리
  const allMaskRanges = [...phoneMaskRanges, ...addressMaskRanges];
  if (allMaskRanges.length > 0) {
    // 원문을 복사하여 localText 배열 생성
    const localTextArray = text.split('');
    
    // PHONE + ADDRESS 범위를 동일 길이의 공백으로 은신
    for (const maskRange of allMaskRanges) {
      const start = maskRange.startIndex;
      const end = maskRange.endIndex;
      
      // 범위 내의 모든 문자를 공백으로 대체
      for (let i = start; i < end; i++) {
        if (i >= 0 && i < localTextArray.length) {
          localTextArray[i] = ' ';
        }
      }
    }
    
    localText = localTextArray.join('');
  }
  
  // localText 기준으로 이름 후보 생성 (인덱스는 원문 기준으로 유지됨)
  let nameCandidates = extractNameCandidates(localText, text);
  
  // 이름 후보 후처리: 이미 정규화된 이름의 길이(2~4자) 재검증
  // 조사·존칭 제거는 extractNameCandidates에서 이미 수행되었으므로 여기서는 재적용하지 않음
  nameCandidates = nameCandidates.filter(candidate => {
    // extractNameCandidates에서 이미 정규화된 cleanedName이 candidate.text에 저장되어 있음
    // 이미 정규화된 이름이므로 조사 제거 로직을 다시 적용하지 않음
    const cleanedName = candidate.text;
    
    // 제거 후 순수 이름 길이(2~4자) 재검증
    if (cleanedName.length < 2 || cleanedName.length > 4) {
      return false; // 후보 제거
    }
    
    // 이미 정규화된 이름이므로 candidate.text는 그대로 유지
    return true; // 후보 유지
  });
  
  // 건물 관련 키워드가 포함된 이름 후보 제외
  nameCandidates = nameCandidates.filter(candidate => {
    const candidateText = candidate.text;
    return !BUILDING_KEYWORDS.some(keyword => candidateText.includes(keyword));
  });
  
  // 수량·요청 문맥 단어가 포함된 이름 후보 제외
  nameCandidates = nameCandidates.filter(candidate => {
    const candidateText = candidate.text;
    return !QUANTITY_REQUEST_KEYWORDS.some(keyword => candidateText.includes(keyword));
  });
  
  // 블랙리스트 키워드가 포함된 이름 후보 제외 (점수 계산 전에 즉시 제거)
  nameCandidates = nameCandidates.filter(candidate => {
    const candidateText = candidate.text;
    return !BLACKLIST_KEYWORDS.some(keyword => candidateText.includes(keyword));
  });
  
  // ============================================================================
  // 명시적 규칙: Phone 엔티티 위치 정보 추출 (힌트 전용)
  // ============================================================================
  // 규칙: phoneResult.candidates는 위치 정보(hint) 추출에만 사용됨
  // 규칙: phoneResult.candidates의 값(value)을 이름 확정 판단에 직접 사용하지 않음
  // 규칙: phoneResult.selected를 이름 확정 판단에 직접 사용하지 않음
  // ============================================================================
  
  // 전화번호 후보의 startIndex 찾기 (힌트 전용 - 위치 정보만 추출)
  const phonePositions: Array<{ startIndex: number; endIndex: number }> = [];
  if (phoneResult && phoneResult.candidates.length > 0) {
    // 명시적 guard: phoneResult.candidates는 위치 정보 추출에만 사용, 이름 확정 판단에는 사용하지 않음
    for (const phoneCandidate of phoneResult.candidates) {
      // 원문에서 전화번호 후보의 위치 찾기 (힌트 전용)
      let searchIndex = 0;
      while (true) {
        const index = text.indexOf(phoneCandidate, searchIndex);
        if (index === -1) break;
        phonePositions.push({
          startIndex: index,
          endIndex: index + phoneCandidate.length,
        });
        searchIndex = index + 1;
      }
    }
  }
  
  // ============================================================================
  // 명시적 규칙: Address 엔티티 위치 정보 추출 (힌트 전용)
  // ============================================================================
  // 규칙: addressResult.candidates는 위치 정보(hint) 추출에만 사용됨
  // 규칙: addressResult.candidates의 값(value)을 이름 확정 판단에 직접 사용하지 않음
  // 규칙: addressResult.selected를 이름 확정 판단에 직접 사용하지 않음
  // ============================================================================
  
  // 주소 START~END 확정 범위 찾기 (힌트 전용 - 위치 정보만 추출)
  const addressRanges: Array<{ startIndex: number; endIndex: number }> = [];
  if (addressResult && addressResult.candidates.length > 0) {
    // 명시적 guard: addressResult.candidates는 위치 정보 추출에만 사용, 이름 확정 판단에는 사용하지 않음
    for (const addressCandidate of addressResult.candidates) {
      // 원문에서 주소 후보의 위치 찾기 (힌트 전용)
      let searchIndex = 0;
      while (true) {
        const index = text.indexOf(addressCandidate, searchIndex);
        if (index === -1) break;
        addressRanges.push({
          startIndex: index,
          endIndex: index + addressCandidate.length,
        });
        searchIndex = index + 1;
      }
    }
  }
  
  // 각 이름 후보에 대해 점수 계산 및 저장
  const scoredCandidates: NameCandidate[] = [];
  const candidates: string[] = [];
  
  // 주소 연관성 힌트 정보 (HOLD일 때 사용)
  let addressNearbyHint = false;
  
  // 거리 기반 점수 보정을 위한 최소 거리 추적 (가장 가까운 후보 찾기용)
  let minOverallDistance = Infinity;
  let closestCandidateIndex = -1;
  
  for (let i = 0; i < nameCandidates.length; i++) {
    const nameCandidate = nameCandidates[i];
    candidates.push(nameCandidate.text);
    
    let score = 500; // 기본 점수 500점
    
    const nameStart = nameCandidate.startIndex;
    const nameEnd = nameCandidate.endIndex;
    const nearbyRangeStart = Math.max(0, nameStart - 20);
    const nearbyRangeEnd = Math.min(text.length, nameEnd + 20);
    
    // 전화번호 후보가 인접 범위에 있는지 확인 (앞뒤 20자)
    for (const phonePos of phonePositions) {
      // 전화번호가 이름 후보의 인접 범위 내에 있는지 확인
      if (phonePos.startIndex >= nearbyRangeStart && phonePos.endIndex <= nearbyRangeEnd) {
        score += 30;
        break; // 한 번만 가산
      }
    }
    
    // 거리 기반 점수 보정: 전화번호 endIndex와 이름 후보의 거리
    let phoneDistanceScore = 0;
    let minPhoneDistanceForCandidate = Infinity;
    for (const phonePos of phonePositions) {
      // 이름 후보의 startIndex와 전화번호 endIndex 사이의 거리 계산
      const distance = Math.abs(nameStart - phonePos.endIndex);
      if (distance <= 10) {
        phoneDistanceScore = Math.max(phoneDistanceScore, 40);
      } else if (distance <= 20) {
        phoneDistanceScore = Math.max(phoneDistanceScore, 35);
      } else if (distance <= 30) {
        phoneDistanceScore = Math.max(phoneDistanceScore, 30);
      }
      minPhoneDistanceForCandidate = Math.min(minPhoneDistanceForCandidate, distance);
    }
    score += phoneDistanceScore;
    
    // 거리 기반 점수 보정: 주소 endIndex와 이름 후보의 거리
    let addressDistanceScore = 0;
    let minAddressDistanceForCandidate = Infinity;
    for (const addressRange of addressRanges) {
      // 이름 후보의 startIndex와 주소 endIndex 사이의 거리 계산
      const distance = Math.abs(nameStart - addressRange.endIndex);
      if (distance <= 10) {
        addressDistanceScore = Math.max(addressDistanceScore, 40);
      } else if (distance <= 20) {
        addressDistanceScore = Math.max(addressDistanceScore, 35);
      } else if (distance <= 30) {
        addressDistanceScore = Math.max(addressDistanceScore, 30);
      }
      minAddressDistanceForCandidate = Math.min(minAddressDistanceForCandidate, distance);
    }
    score += addressDistanceScore;
    
    // 거리 기반 점수 보정: 원문 길이와 이름 후보의 거리
    const textEndDistance = text.length - nameEnd;
    let textEndDistanceScore = 0;
    if (textEndDistance <= 10) {
      textEndDistanceScore = 40;
    } else if (textEndDistance <= 20) {
      textEndDistanceScore = 35;
    } else if (textEndDistance <= 30) {
      textEndDistanceScore = 30;
    }
    score += textEndDistanceScore;
    
    // 가장 가까운 후보 찾기: 전화번호/주소/원문 끝 중 가장 가까운 거리 계산
    const overallMinDistance = Math.min(
      minPhoneDistanceForCandidate === Infinity ? Infinity : minPhoneDistanceForCandidate,
      minAddressDistanceForCandidate === Infinity ? Infinity : minAddressDistanceForCandidate,
      textEndDistance
    );
    if (overallMinDistance < minOverallDistance) {
      minOverallDistance = overallMinDistance;
      closestCandidateIndex = i;
    }
    
    // ============================================================================
    // 명시적 규칙: HOLD_BATCH_PROCESSING 분기 (점수 계산 vs 힌트 기록)
    // ============================================================================
    // 규칙 1: HOLD_BATCH_PROCESSING이 false일 때: 주소 연관성을 점수에 반영 (+30점)
    // 규칙 2: HOLD_BATCH_PROCESSING이 true일 때: 주소 연관성을 점수에 반영하지 않고 힌트로만 기록
    // 규칙 3: 점수 계산 단계와 힌트 기록 단계를 명시적으로 분리
    // 규칙 4: addressResult.candidates의 값(value)을 이름 확정 판단에 직접 사용하지 않음
    // ============================================================================
    
    // HOLD: 엔티티 결합 억제
    // 주소 START~END 확정 범위 내부 또는 인접한지 확인
    if (HOLD_BATCH_PROCESSING) {
      // HOLD 플래그 활성화 시: 주소 연관성 점수 계산은 비활성화하되, 힌트 정보로만 기록
      // 점수 계산 단계에는 영향을 주지 않고, 최종 확정 여부(status 결정) 단계에서만 활용
      // 명시적 guard: addressResult는 힌트 전용, 이름 확정 판단에는 사용하지 않음
      for (const addressRange of addressRanges) {
        const addressStart = addressRange.startIndex;
        const addressEnd = addressRange.endIndex;
        
        // 이름 후보가 주소 범위 내부에 있거나
        // 이름 후보가 주소 범위와 인접한지 확인 (앞뒤 20자)
        const isInside = nameStart >= addressStart && nameEnd <= addressEnd;
        const isAdjacent = 
          (nameStart >= addressStart - 20 && nameStart <= addressEnd + 20) ||
          (nameEnd >= addressStart - 20 && nameEnd <= addressEnd + 20);
        
        if (isInside || isAdjacent) {
          // 점수에는 반영하지 않고 힌트로만 기록 (HOLD일 때)
          addressNearbyHint = true;
          break; // 한 번만 기록
        }
      }
    } else {
      // 기존 로직: 주소와 이름의 연관성 점수 계산 (HOLD가 false일 때)
      // 명시적 guard: addressResult는 힌트 전용, 이름 확정 판단에는 사용하지 않음
      for (const addressRange of addressRanges) {
        const addressStart = addressRange.startIndex;
        const addressEnd = addressRange.endIndex;
        
        // 이름 후보가 주소 범위 내부에 있거나
        // 이름 후보가 주소 범위와 인접한지 확인 (앞뒤 20자)
        const isInside = nameStart >= addressStart && nameEnd <= addressEnd;
        const isAdjacent = 
          (nameStart >= addressStart - 20 && nameStart <= addressEnd + 20) ||
          (nameEnd >= addressStart - 20 && nameEnd <= addressEnd + 20);
        
        if (isInside || isAdjacent) {
          // 점수에 반영 (HOLD가 false일 때만)
          score += 30;
          break; // 한 번만 가산
        }
      }
    }
    
    // 이름 후보에서 조사 '은'이 포함된 경우, 순수 이름이 한글 2~3글자일 때만 사람 이름 가산(+30점) 부여
    // 조사 '은' 자체는 이름 value에 포함되지 않지만, 원문에 존재했다는 사실은 점수 계산에 활용
    // 원문에서 이름 후보 범위(nameStart ~ nameEnd)에 조사 '은'이 포함되어 있는지 확인
    const originalTextInRange = text.substring(nameStart, nameEnd);
    const nameText = nameCandidate.text;
    
    // 원문 범위에 조사 '은'이 포함되어 있는지 확인
    // (원문 범위가 순수 이름보다 긴 경우 조사 '은'이 포함된 것으로 판단)
    const hasParticleEun = originalTextInRange.length > nameText.length && originalTextInRange.endsWith('은');
    
    if (hasParticleEun) {
      // 순수 이름이 한글 2~3글자인지 확인
      const koreanCharCount = (nameText.match(/[가-힣]/g) || []).length;
      
      if (koreanCharCount >= 2 && koreanCharCount <= 3) {
        // 사람 이름 가산(+30점) 부여 ('은' 제거 시 점수 감점 없음)
        score += 30;
      }
    } else {
      // 원문 범위에 조사 '은'이 포함되지 않은 경우, 이름 후보 바로 뒤에 붙은 경우 확인
      const textAfterName = text.substring(nameEnd);
      
      // "께", "에게" 패턴 확인 (이름 후보 바로 뒤에 붙은 경우)
      // '님'은 이름 후보에서 제외되므로 여기서는 확인하지 않음
      const honorificPatterns = [
        /^께/,
        /^에게/,
      ];
      
      for (const pattern of honorificPatterns) {
        const match = textAfterName.match(pattern);
        if (match) {
          // 순수 이름이 한글 2~3글자인지 확인
          const koreanCharCount = (nameText.match(/[가-힣]/g) || []).length;
          
          if (koreanCharCount >= 2 && koreanCharCount <= 3) {
            // 사람 이름 가산(+30점) 부여
            score += 30;
            break; // 한 번만 가산
          }
        }
      }
    }
    
    // 단독 명사 빈출 리스트 점수 보정: 문장 끝 10자 이내에 있고 빈출 리스트에 포함되면 -40점
    const distanceFromEnd = text.length - nameEnd;
    if (distanceFromEnd <= 10 && FREQUENT_NOUNS.includes(nameCandidate.text)) {
      score -= 40;
    }
    
    // 점수를 포함한 후보 저장
    scoredCandidates.push({
      ...nameCandidate,
      score,
    });
  }
  
  // 가장 가까운 후보에 +30 규칙 적용
  if (closestCandidateIndex >= 0 && closestCandidateIndex < scoredCandidates.length) {
    scoredCandidates[closestCandidateIndex].score += 30;
  }
  
  // 가장 높은 점수를 가진 1개만 이름으로 확정 (무조건 선택)
  // 동일 점수일 경우 원문에서 가장 먼저 등장한 것을 선택
  let selectedName: NameCandidate | null = null;
  if (scoredCandidates.length > 0) {
    selectedName = scoredCandidates.reduce((best, current) => {
      if (current.score > best.score) return current;
      if (current.score === best.score && current.startIndex < best.startIndex) return current;
      return best;
    });
  }
  
  // 확정된 이름의 range를 LOCK 처리 (maskRanges에 추가)
  // Dead-State 처리: 엔티티 타입과 range 메타정보만 유지 (value·token·pattern·score 접근 차단)
  const nameMaskRanges: Array<{ startIndex: number; endIndex: number; entityType: 'NAME' }> = [];
  if (selectedName) {
    nameMaskRanges.push({
      startIndex: selectedName.startIndex,
      endIndex: selectedName.endIndex,
      entityType: 'NAME',
    });
  }
  
  // confidence는 선택된 이름의 점수로 설정 (없으면 0)
  const confidence = selectedName ? selectedName.score : 0;
  
  // ============================================================================
  // 명시적 규칙: HOLD_BATCH_PROCESSING status 결정 단계
  // ============================================================================
  // 규칙 1: HOLD_BATCH_PROCESSING이 true일 때: addressNearby 힌트를 hints에 기록
  // 규칙 2: HOLD_BATCH_PROCESSING이 false일 때: addressNearby 힌트를 hints에 기록하지 않음 (점수에 이미 반영됨)
  // 규칙 3: status 결정은 buildFinalStruct 단계에서 수행됨 (이 함수에서는 수행하지 않음)
  // ============================================================================
  
  return {
    candidates,
    selected: selectedName ? selectedName.text : undefined,
    confidence,
    hints: {
      // 이름 묶음 범위: 이 범위에 포함된 요소들은 다른 파이프라인이나 엔티티 판단에 재사용하지 않음
      // 이후 단계에서는 점수 경쟁이나 확정 판단에 사용하지 않고 수령자·담당자 등 사람 문맥 힌트로만 활용
      maskRanges: nameMaskRanges.length > 0 ? nameMaskRanges : undefined,
      // 주소 연관성 힌트 (HOLD일 때만 사용, 점수 계산에는 영향 없음)
      // 명시적 guard: 이 힌트는 확정 판단에 사용하지 않으며, 단순히 연관성 정보만 제공
      addressNearby: HOLD_BATCH_PROCESSING ? addressNearbyHint : undefined,
      // 조건 분기 없이 무조건 CONFIRMED로 설정
      status: 'CONFIRMED' as const,
    } as EntityHint,
  };
}

