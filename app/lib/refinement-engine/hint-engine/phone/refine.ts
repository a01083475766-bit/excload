/**
 * Phone refinement function
 * Extracts phone number-like string candidates from input text
 */

import type { InputText } from '@/app/lib/refinement-engine/types/InputText';
import type { EntityResult } from '@/app/lib/refinement-engine/types/EntityResult';
import type { EntityHint } from '@/app/lib/refinement-engine/types/EntityHint';

/**
 * Refines phone numbers from input text
 * Extracts phone number-like string candidates and returns them as EntityResult<string>
 * 
 * 전화번호 파이프라인 처리 기준:
 * 1. Core 단계에서 유효한 전화번호 후보는 900점으로 생성
 * 2. 900점 후보들 중 가장 높은 점수를 가진 1개만 전화번호로 확정
 *    - 모든 유효한 후보는 900점이므로, 동일 점수일 경우 원문에서 가장 먼저 등장한 것을 선택
 * 3. 확정된 전화번호의 range는 LOCK 처리하여 다른 파이프라인이나 엔티티 판단에 재사용하지 않음 (maskRanges로 표시)
 * 4. 이후 단계에서는 점수 경쟁이나 확정 판단에 사용하지 않으며, 연락처 존재 여부 등의 힌트 정보로만 활용
 * 
 * @param input - InputText containing the text to process
 * @returns EntityResult<string> with phone number candidates
 */
export function refinePhone(input: InputText): EntityResult<string> {
  const text = input.text;
  const candidates: string[] = [];
  
  // 한국 전화번호 패턴 정의
  const mobilePrefixes = ['010', '011', '016', '017', '018', '019'];
  const areaPrefixes = ['02', '031', '032', '033', '041', '042', '043', '044', '051', '052', '053', '054', '055', '061', '062', '063', '064'];
  
  // 암시 단어 목록
  const phoneContextWords = ['연락처', '전화', '휴대폰', '핸드폰', 'TEL', 'tel', '전화번호', '연락', '연락처번호'];
  
  // 전화번호 패턴 매칭 (숫자, 하이픈, 공백, 괄호, 점 등 포함)
  // 예: 010-1234-5678, 010 1234 5678, (010)1234-5678, 02-1234-5678, 010.1234.5678 등
  // 연속된 숫자와 구분자(하이픈, 공백, 괄호, 점)로 구성된 패턴 찾기
  const phonePattern = /[\d\s\-\(\)\.]+/g;
  let match;
  
  // 전화번호 후보 인터페이스 (점수와 위치 정보 포함)
  interface PhoneCandidate {
    text: string;
    startIndex: number;
    endIndex: number;
    score: number; // 900점 고정
  }
  
  const phoneCandidates: PhoneCandidate[] = [];
  
  while ((match = phonePattern.exec(text)) !== null) {
    const matchedText = match[0];
    // 숫자만 추출
    const digitsOnly = matchedText.replace(/\D/g, '');
    
    console.debug('[refinePhone] STEP 1: Pattern match found', {
      matchedText,
      digitsOnly,
      digitsLength: digitsOnly.length,
      matchIndex: match.index,
    });
    
    // 9~11자리인지 확인
    if (digitsOnly.length < 9 || digitsOnly.length > 11) {
      console.debug('[refinePhone] STEP 2: 탈락 - 자릿수 부적절', {
        digitsLength: digitsOnly.length,
        reason: '9~11자리가 아님',
      });
      continue;
    }
    
    // 한국 전화번호 패턴 검증
    let isValid = false;
    
    // 휴대폰 번호 검증 (11자리)
    if (digitsOnly.length === 11) {
      const prefix = digitsOnly.substring(0, 3);
      if (mobilePrefixes.includes(prefix)) {
        isValid = true;
        console.debug('[refinePhone] STEP 3: 휴대폰 번호 검증 통과', { prefix });
      }
    }
    
    // 지역번호 검증 (9~10자리)
    if (digitsOnly.length === 9 || digitsOnly.length === 10) {
      // 2자리 지역번호 (02)
      if (digitsOnly.startsWith('02')) {
        isValid = true;
        console.debug('[refinePhone] STEP 3: 지역번호(02) 검증 통과', {
          digitsLength: digitsOnly.length,
        });
      }
      // 3자리 지역번호
      else {
        const prefix = digitsOnly.substring(0, 3);
        if (areaPrefixes.includes(prefix)) {
          isValid = true;
          console.debug('[refinePhone] STEP 3: 지역번호(3자리) 검증 통과', { prefix });
        }
      }
    }
    
    if (!isValid) {
      console.debug('[refinePhone] STEP 3: 탈락 - 패턴 검증 실패', {
        digitsOnly,
        digitsLength: digitsOnly.length,
        reason: '한국 전화번호 패턴 불일치',
      });
    }
    
    if (isValid) {
      // 원문에서의 정확한 위치 저장
      const startIndex = match.index;
      const endIndex = startIndex + matchedText.length;
      const originalMatch = text.substring(startIndex, endIndex).trim();
      
      console.debug('[refinePhone] STEP 4: 후보 생성 시도', {
        startIndex,
        endIndex,
        matchedText,
        originalMatch,
        originalMatchLength: originalMatch.length,
        isEmpty: !originalMatch,
      });
      
      if (originalMatch) {
        phoneCandidates.push({
          text: originalMatch,
          startIndex,
          endIndex,
          score: 900, // 유효한 전화번호 후보는 900점으로 생성
        });
        console.debug('[refinePhone] STEP 4: 후보 추가 완료', {
          text: originalMatch,
          startIndex,
          endIndex,
          score: 900,
        });
      } else {
        console.debug('[refinePhone] STEP 4: 탈락 - originalMatch가 빈 문자열', {
          matchedText,
          originalMatch,
        });
      }
    }
  }
  
  // 중복 제거 (같은 위치의 후보는 하나만)
  console.debug('[refinePhone] STEP 5: 중복 제거 전 phoneCandidates', {
    count: phoneCandidates.length,
    candidates: phoneCandidates.map(c => ({
      text: c.text,
      startIndex: c.startIndex,
      endIndex: c.endIndex,
      score: c.score,
    })),
  });
  
  const seen = new Set<string>();
  const uniqueCandidates: PhoneCandidate[] = [];
  for (const candidate of phoneCandidates) {
    const key = `${candidate.startIndex}-${candidate.endIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(candidate);
      console.debug('[refinePhone] STEP 5: 중복 제거 - 후보 유지', {
        key,
        text: candidate.text,
      });
    } else {
      console.debug('[refinePhone] STEP 5: 중복 제거 - 후보 탈락', {
        key,
        text: candidate.text,
        reason: '같은 위치의 후보가 이미 존재',
      });
    }
  }
  
  console.debug('[refinePhone] STEP 5: 중복 제거 후 uniqueCandidates', {
    count: uniqueCandidates.length,
    candidates: uniqueCandidates.map(c => ({
      text: c.text,
      startIndex: c.startIndex,
      endIndex: c.endIndex,
      score: c.score,
    })),
  });
  
  // 900점 후보들 중 가장 높은 점수를 가진 1개만 전화번호로 확정
  // 동일 점수일 경우 원문에서 가장 먼저 등장한 것을 선택
  let selectedPhone: PhoneCandidate | null = null;
  if (uniqueCandidates.length > 0) {
    // 점수가 가장 높은 것 선택 (동일한 점수일 경우 위치상 가장 앞에 있는 것 선택)
    selectedPhone = uniqueCandidates.reduce((best, current) => {
      if (current.score > best.score) return current;
      if (current.score === best.score && current.startIndex < best.startIndex) return current;
      return best;
    });
  }
  
  // 모든 후보를 candidates에 추가 (score 정보 포함)
  for (const candidate of uniqueCandidates) {
    candidates.push(candidate.text);
  }
  
  // candidates 중 score가 가장 높은 후보 1개를 무조건 selected로 설정
  let finalSelected: string | undefined = undefined;
  if (uniqueCandidates.length > 0) {
    console.debug('[refinePhone] STEP 6: finalSelected 결정 시작', {
      uniqueCandidatesCount: uniqueCandidates.length,
    });
    
    // score가 가장 높은 후보 선택 (동일한 점수일 경우 위치상 가장 앞에 있는 것 선택)
    const bestCandidate = uniqueCandidates.reduce((best, current) => {
      console.debug('[refinePhone] STEP 6: reduce 비교', {
        best: { text: best.text, score: best.score, startIndex: best.startIndex },
        current: { text: current.text, score: current.score, startIndex: current.startIndex },
      });
      if (current.score > best.score) {
        console.debug('[refinePhone] STEP 6: current가 best보다 점수 높음 -> current 선택');
        return current;
      }
      if (current.score === best.score && current.startIndex < best.startIndex) {
        console.debug('[refinePhone] STEP 6: 동일 점수, current가 앞에 있음 -> current 선택');
        return current;
      }
      console.debug('[refinePhone] STEP 6: best 유지');
      return best;
    });
    
    console.debug('[refinePhone] STEP 6: bestCandidate 결정됨', {
      text: bestCandidate.text,
      score: bestCandidate.score,
      startIndex: bestCandidate.startIndex,
      endIndex: bestCandidate.endIndex,
    });
    
    // bestCandidate는 reduce로 선택된 것이므로 배열에 반드시 존재함
    // 불필요한 find 검사를 제거하고 직접 할당
    finalSelected = bestCandidate.text;
    console.debug('[refinePhone] STEP 6: finalSelected 설정 완료', {
      finalSelected,
      uniqueCandidatesCount: uniqueCandidates.length,
      uniqueCandidatesTexts: uniqueCandidates.map(c => c.text),
    });
  } else {
    console.debug('[refinePhone] STEP 6: finalSelected 결정 스킵', {
      reason: 'uniqueCandidates.length === 0',
    });
  }
  
  // 암시 단어가 근접한지 확인 (확정된 전화번호 주변 20자 이내)
  let hasPhoneContext = false;
  if (finalSelected) {
    const selectedCandidate = uniqueCandidates.find(c => c.text === finalSelected);
    if (selectedCandidate !== undefined && selectedCandidate !== null) {
      const start = Math.max(0, selectedCandidate.startIndex - 20);
      const end = Math.min(text.length, selectedCandidate.endIndex + 20);
      const context = text.substring(start, end);
      
      // 암시 단어가 있는지 확인
      if (phoneContextWords.some(word => context.includes(word))) {
        hasPhoneContext = true;
      }
    }
  }
  
  // 확정된 전화번호의 range는 LOCK 처리하여 다른 파이프라인이나 엔티티 판단에 재사용하지 않음
  // Dead-State 처리: 엔티티 타입과 range 메타정보만 유지 (value·token·pattern·score 접근 차단)
  const phoneMaskRanges: Array<{ startIndex: number; endIndex: number; entityType: 'PHONE' }> = [];
  if (finalSelected) {
    const selectedCandidate = uniqueCandidates.find(c => c.text === finalSelected);
    if (selectedCandidate !== undefined && selectedCandidate !== null) {
      phoneMaskRanges.push({
        startIndex: selectedCandidate.startIndex,
        endIndex: selectedCandidate.endIndex,
        entityType: 'PHONE',
      });
    }
  }
  
  return {
    candidates,
    selected: finalSelected,
    confidence: 900,
    hints: {
      status: 'CONFIRMED',
      // 확정된 전화번호 범위: 이 범위에 포함된 요소들은 다른 파이프라인이나 엔티티 판단에 재사용하지 않음
      // 이후 단계에서는 점수 경쟁이나 확정 판단에 사용하지 않으며, 연락처 존재 여부 등의 힌트 정보로만 활용
      maskRanges: phoneMaskRanges.length > 0 ? phoneMaskRanges : undefined,
    } as EntityHint,
  };
}

