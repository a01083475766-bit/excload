/**
 * Address refinement function
 * Extracts address-like string candidates from input text
 */

import type { InputText } from '@/app/lib/refinement-engine/types/InputText';
import type { EntityResult } from '@/app/lib/refinement-engine/types/EntityResult';
import type { EntityHint } from '@/app/lib/refinement-engine/types/EntityHint';
import { resolveAddressScore, type AddressResolverInput } from './address-resolver';

/**
 * HOLD 플래그: 엔티티 결합 억제
 * - 주소 묶음처리 (START~END 묶음) 비활성화
 * - 주소/이름 기반 그룹핑 비활성화
 */
const HOLD_BATCH_PROCESSING = true;

/**
 * Refines addresses from input text
 * Extracts address-like string candidates and returns them as EntityResult<string>
 * 
 * 주소 파이프라인 처리 기준:
 * 1. START 후보(광역자치단체): 800점 중 가장 높은 점수를 가진 1개를 주소 시작으로 확정
 *    - 모든 START 후보는 800점이므로, 위치상 가장 앞에 있는 것을 선택
 * 2. END 후보(도로명번호·번지·건물·동·호 등): 규칙 기반 조립 방식으로 선택
 *    - END 후보는 기본점수 700을 유지하되 -600 페널티를 적용하여 단독 주소 확정은 금지
 *    - START 주소가 확정된 경우에만 START 뒤에 위치한 END를 조건(거리 제한 200자, 비주소 엔티티 없음) 충족 시 무조건 주소 블록 종료점으로 채택
 *    - 위치상 가장 앞에 있는 END를 선택 (점수 경쟁 방식이 아닌 규칙 기반)
 * 3. START부터 END까지의 범위를 하나의 주소 묶음으로 처리
 * 4. 이 묶음에 포함된 요소들은 다른 파이프라인이나 엔티티 판단에 재사용하지 않음 (maskRanges로 표시)
 * 5. START와 END 자체도 이후 단계에서는 점수 경쟁이 아닌 힌트 정보로만 작용
 * 
 * @param input - InputText containing the text to process
 * @param phoneResult - Phone refinement result (used only for phoneNearby hint calculation)
 * @param nameResult - Name refinement result (optional, used to filter overlapping address blocks)
 * @returns EntityResult<string> with address candidates
 */
export function refineAddress(input: InputText, phoneResult?: EntityResult<string>, nameResult?: EntityResult<string>): EntityResult<string> {
  const text = input.text;
  const candidates: string[] = [];

  // 광역자치단체 표현을 대표 행정구역으로 매핑
  // 같은 광역단위의 다양한 표현을 통합하여 대표 행정구역으로 매핑
  const metropolitanMapping: Array<{
    patterns: RegExp[];
    representative: string; // 대표 행정구역명
  }> = [
    { patterns: [/서울특별시/g, /서울시/g, /서울/g], representative: '서울특별시' },
    { patterns: [/부산광역시/g, /부산시/g, /부산/g], representative: '부산광역시' },
    { patterns: [/대구광역시/g, /대구시/g, /대구/g], representative: '대구광역시' },
    { patterns: [/인천광역시/g, /인천시/g, /인천/g], representative: '인천광역시' },
    { patterns: [/광주광역시/g, /광주시/g, /광주/g], representative: '광주광역시' },
    { patterns: [/대전광역시/g, /대전시/g, /대전/g], representative: '대전광역시' },
    { patterns: [/울산광역시/g, /울산시/g, /울산/g], representative: '울산광역시' },
    { patterns: [/세종특별자치시/g, /세종특별시/g, /세종시/g, /세종/g], representative: '세종특별자치시' },
    { patterns: [/경기도/g, /경기/g], representative: '경기도' },
    { patterns: [/강원도/g, /강원/g], representative: '강원도' },
    { patterns: [/충청북도/g, /충북/g], representative: '충청북도' },
    { patterns: [/충청남도/g, /충남/g], representative: '충청남도' },
    { patterns: [/전라북도/g, /전북/g], representative: '전라북도' },
    { patterns: [/전라남도/g, /전남/g], representative: '전라남도' },
    { patterns: [/경상북도/g, /경북/g], representative: '경상북도' },
    { patterns: [/경상남도/g, /경남/g], representative: '경상남도' },
    { patterns: [/제주특별자치도/g, /제주특별시/g, /제주도/g, /제주/g], representative: '제주특별자치도' },
  ];

  // 시군구 패턴 (중간 요소 - 점수 계산에 사용하지 않음, 힌트 정보만 기록)
  const cityDistrictPattern = /([가-힣]+(?:시|군|구))/g;
  
  // 중간 요소 인터페이스 (점수 없음, 위치 정보만 저장)
  interface MiddleElement {
    startIndex: number;
    endIndex: number;
    text: string;
    // 주의: 중간 요소는 기본 점수나 비교 점수를 부여하지 않으며, 점수 계산에 전혀 관여하지 않음
  }

  // END 후보 패턴 (호/층/번지/도로명/도로명번지/건물명)
  // 주의: END 후보는 반드시 숫자(번지/호/층/도로번호)를 포함한 경우에만 생성
  // '동/읍/면/구' 단독 텍스트는 END 후보로 생성되지 않음
  // 우선순위: 호(3) > 번지(2) > 층(1) > 건물명(0) > 도로명번지(4) > 도로명(5)
  // 숫자가 클수록 우선순위가 높음
  const endPatterns = [
    { pattern: /([A-Za-z]?\d+호)/g, unit: '호', priority: 3 }, // 영문+숫자+호 또는 숫자+호 (예: 207호, B102호)
    { pattern: /(B(?:0[1-9]|[1-9]))/g, unit: '호', priority: 3 }, // B01, B1~B9 (예: B01, B1, B9)
    { pattern: /([1-9]\d{2,3}호)/g, unit: '호', priority: 3 }, // 101호~9999호 (예: 101호, 9999호)
    { pattern: /(\d+(?:-\d+)?번지)/g, unit: '번지', priority: 2 }, // 숫자+하이픈+숫자+번지 또는 숫자+번지 (예: 600번지, 12-3번지)
    { pattern: /((?:지상|지하)?\d+층)/g, unit: '층', priority: 1 }, // 지상/지하+숫자+층 또는 숫자+층 (예: 2층, 지하1층)
    { pattern: /(지하(?:층)?)/g, unit: '층', priority: 1 }, // 지하, 지하층 (예: 지하, 지하층)
    { pattern: /([가-힣]+(?:빌딩|타워|센터|아파트|오피스텔|맨션|빌라|주택|건물))/g, unit: '건물명', priority: 0 }, // 건물명 (예: ○○빌딩, △△타워, ◇◇센터)
    { pattern: /([가-힣]+로\s*\d+\s*번지|[가-힣]+길\s*\d+\s*번지|[가-힣]+대로\s*\d+\s*번지)/g, unit: '도로명번지', priority: 4 },
    { pattern: /([가-힣]+로\s*\d+|[가-힣]+길\s*\d+|[가-힣]+대로\s*\d+)/g, unit: '도로명', priority: 5 },
  ];

  // START 후보 추출
  interface StartCandidate {
    startIndex: number;
    endIndex: number;
    text: string;
    score: number;
  }

  const startCandidates: StartCandidate[] = [];

  // 광역단위 START 후보 추출 (800점 고정)
  // 광역단위를 찾아서 대표 행정구역명으로 매핑하여 최상단 행정구역을 먼저 확정
  for (const metroGroup of metropolitanMapping) {
    // 같은 광역단위 그룹 내에서 중복을 제거하기 위해 위치별로 가장 긴 매칭만 선택
    const groupMatches: Array<{ start: number; end: number; text: string }> = [];
    
    for (const metroPattern of metroGroup.patterns) {
      // 정규표현식 인스턴스 재생성하여 lastIndex 초기화
      const pattern = new RegExp(metroPattern.source, metroPattern.flags);
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const metroStart = match.index;
        const metroEnd = metroStart + match[0].length;
        groupMatches.push({
          start: metroStart,
          end: metroEnd,
          text: match[0],
        });
      }
    }
    
    // 같은 위치 범위에서 가장 긴 매칭만 선택 (겹치는 매칭 중 가장 긴 것)
    const uniqueGroupMatches: Array<{ start: number; end: number }> = [];
    groupMatches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.end - a.end; // 같은 시작 위치면 더 긴 것 우선
    });
    
    for (const match of groupMatches) {
      // 겹치는 기존 매칭이 있는지 확인
      const overlaps = uniqueGroupMatches.some(
        existing => !(match.end <= existing.start || match.start >= existing.end)
      );
      if (!overlaps) {
        uniqueGroupMatches.push({ start: match.start, end: match.end });
        // 대표 행정구역명으로 START 후보 추가 (800점 고정)
        const candidate = {
          startIndex: match.start,
          endIndex: match.end,
          text: metroGroup.representative, // 대표 행정구역명으로 통합
          score: 800, // 광역단위 START 후보 고정 점수
        };
        startCandidates.push(candidate);
        console.debug('[refineAddress] START candidate 생성:', {
          value: candidate.text,
          score: candidate.score,
          breakdown: {
            startIndex: candidate.startIndex,
            endIndex: candidate.endIndex,
            type: 'START',
            representative: metroGroup.representative,
          },
        });
      }
    }
  }
  
  // START 후보를 위치순으로 정렬 (동일한 광역단위 그룹 내 중복은 이미 제거됨)
  startCandidates.sort((a, b) => a.startIndex - b.startIndex);

  // 주의: 광역단위 없이 시/군만 존재하는 주소는 START 미확정 상태
  // (시/군만 있는 경우는 startCandidates에 포함되지 않음)

  // 중간 요소 추출 (시군구 등) - 점수 계산에 사용하지 않음
  const middleElements: MiddleElement[] = [];
  const pattern = new RegExp(cityDistrictPattern.source, cityDistrictPattern.flags);
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    // 중간 요소는 점수 없이 위치 정보만 저장
    middleElements.push({
      startIndex,
      endIndex,
      text: match[0],
    });
  }

  // END 후보 추출
  interface EndCandidate {
    startIndex: number;
    endIndex: number;
    text: string;
    score: number; // 기본 점수 (700점 유지)
    comparisonScore: number; // END 판별용 비교 점수
    unit: string;
    priority: number; // 우선순위 (호:3, 번지:2, 층:1, 건물명:0, 도로명번지:4, 도로명:5)
    isAuxiliary: boolean; // 보조 END 여부 (더 강한 END가 뒤에 있으면 true)
  }

  const endCandidates: EndCandidate[] = [];

  for (const endPattern of endPatterns) {
    // 정규표현식 인스턴스 재생성하여 lastIndex 초기화
    const pattern = new RegExp(endPattern.pattern.source, endPattern.pattern.flags);
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;
      const matchedText = match[0];
      
      const candidate = {
        startIndex,
        endIndex,
        text: matchedText,
        score: 700, // 기본 점수 (변경하지 않음)
        comparisonScore: 700, // END 판별용 비교 점수 (초기값은 기본 점수와 동일)
        unit: endPattern.unit,
        priority: endPattern.priority,
        isAuxiliary: false, // 초기값: 보조 END 아님
      };
      endCandidates.push(candidate);
      console.debug('[refineAddress] END candidate 생성:', {
        value: candidate.text,
        score: candidate.score,
        breakdown: {
          startIndex: candidate.startIndex,
          endIndex: candidate.endIndex,
          type: 'END',
          unit: candidate.unit,
          priority: candidate.priority,
          comparisonScore: candidate.comparisonScore,
        },
      });
    }
  }

  // END 후보를 startIndex 기준 오름차순으로 정렬
  endCandidates.sort((a, b) => a.startIndex - b.startIndex);

  // 모든 END 후보 뒤에 연속되는 (숫자+층|숫자+호|숫자+동)을 모두 동일 address 범위(endIndex)로 확장
  // 점수 계산 로직은 변경하지 않고 END 범위 확장만 적용
  for (const endCandidate of endCandidates) {
    const originalEndIndex = endCandidate.endIndex;
    
    // 연속되는 패턴: 숫자+층, 숫자+호, 숫자+동, B01/B1~B9, 지하/지하층, 101호~9999호
    const consecutivePatterns = [
      { pattern: /(\d+층)/g, name: '숫자+층' },
      { pattern: /(\d+호)/g, name: '숫자+호' },
      { pattern: /(\d+동)/g, name: '숫자+동' },
      { pattern: /(B(?:0[1-9]|[1-9]))/g, name: 'B01/B1~B9' },
      { pattern: /(지하(?:층)?)/g, name: '지하/지하층' },
      { pattern: /([1-9]\d{2,3}호)/g, name: '101호~9999호' },
    ];
    
    // END 후보 뒤 50자 이내에서 연속되는 패턴 찾기
    const MAX_EXTENSION_DISTANCE = 50;
    const searchStartIndex = originalEndIndex;
    const searchEndIndex = Math.min(text.length, originalEndIndex + MAX_EXTENSION_DISTANCE);
    const searchText = text.substring(searchStartIndex, searchEndIndex);
    
    // 모든 연속 패턴 후보 수집
    interface ConsecutiveMatch {
      startIndex: number; // 절대 위치
      endIndex: number; // 절대 위치
      text: string;
      patternName: string;
    }
    
    const consecutiveMatches: ConsecutiveMatch[] = [];
    
    for (const consecutivePattern of consecutivePatterns) {
      const pattern = new RegExp(consecutivePattern.pattern.source, consecutivePattern.pattern.flags);
      let match;
      while ((match = pattern.exec(searchText)) !== null) {
        const relativeStartIndex = match.index;
        const relativeEndIndex = relativeStartIndex + match[0].length;
        const absoluteStartIndex = searchStartIndex + relativeStartIndex;
        const absoluteEndIndex = searchStartIndex + relativeEndIndex;
        
        consecutiveMatches.push({
          startIndex: absoluteStartIndex,
          endIndex: absoluteEndIndex,
          text: match[0],
          patternName: consecutivePattern.name,
        });
      }
    }
    
    // startIndex 기준으로 정렬
    consecutiveMatches.sort((a, b) => a.startIndex - b.startIndex);
    
    // 연속되는 패턴 찾기 (각 패턴 사이의 거리가 10자 이내면 연속으로 간주)
    const MAX_GAP_FOR_CONSECUTIVE = 10;
    let currentEndIndex = originalEndIndex;
    
    for (const match of consecutiveMatches) {
      // 현재 확장 위치와의 거리 확인
      const gap = match.startIndex - currentEndIndex;
      if (gap <= MAX_GAP_FOR_CONSECUTIVE) {
        // 연속되는 패턴이면 endIndex 확장
        currentEndIndex = match.endIndex;
        
        console.debug('[refineAddress] END 범위 확장:', {
          originalEndIndex: originalEndIndex,
          extendedEndIndex: currentEndIndex,
          matchedPattern: match.patternName,
          matchedText: match.text,
          gap,
        });
      } else {
        // 연속이 끊어지면 중단
        break;
      }
    }
    
    // endIndex 확장 적용 (점수는 변경하지 않음)
    if (currentEndIndex > originalEndIndex) {
      endCandidate.endIndex = currentEndIndex;
      endCandidate.text = text.substring(endCandidate.startIndex, endCandidate.endIndex);
      
      console.debug('[refineAddress] END 최종 확장 완료:', {
        startIndex: endCandidate.startIndex,
        originalEndIndex: originalEndIndex,
        finalEndIndex: endCandidate.endIndex,
        extendedText: endCandidate.text,
        score: endCandidate.score, // 점수는 변경하지 않음
      });
    }
  }

  // END 후보 뒤 15자 이내에 위치한 건물명 토큰 확장
  // name/phone maskRanges와 겹치지 않는 경우에만 endIndex에 포함
  // 먼저 name/phone maskRanges 수집
  const namePhoneMaskRangesForExtension: Array<{ startIndex: number; endIndex: number }> = [];
  
  // nameResult에서 NAME maskRange 수집
  if (nameResult?.hints?.maskRanges) {
    for (const maskRange of nameResult.hints.maskRanges) {
      if (maskRange.entityType === 'NAME') {
        namePhoneMaskRangesForExtension.push({
          startIndex: maskRange.startIndex,
          endIndex: maskRange.endIndex,
        });
      }
    }
  }
  
  // phoneResult에서 PHONE maskRange 수집
  if (phoneResult?.hints?.maskRanges) {
    for (const maskRange of phoneResult.hints.maskRanges) {
      if (maskRange.entityType === 'PHONE') {
        namePhoneMaskRangesForExtension.push({
          startIndex: maskRange.startIndex,
          endIndex: maskRange.endIndex,
        });
      }
    }
  }
  
  // 각 END 후보에 대해 건물명 토큰 확장 적용
  for (const endCandidate of endCandidates) {
    const currentEndIndex = endCandidate.endIndex;
    
    // 건물명 토큰 패턴: 타워|빌딩|센터|플라자|아파트|오피스텔|상가
    const buildingNamePattern = /([가-힣]+(?:타워|빌딩|센터|플라자|아파트|오피스텔|상가))/g;
    
    // END 후보 뒤 15자 이내에서 건물명 토큰 찾기
    const MAX_BUILDING_EXTENSION_DISTANCE = 15;
    const searchStartIndex = currentEndIndex;
    const searchEndIndex = Math.min(text.length, currentEndIndex + MAX_BUILDING_EXTENSION_DISTANCE);
    const searchText = text.substring(searchStartIndex, searchEndIndex);
    
    // 건물명 토큰 매칭
    const pattern = new RegExp(buildingNamePattern.source, buildingNamePattern.flags);
    let match;
    let buildingMatch: { startIndex: number; endIndex: number; text: string } | null = null;
    
    while ((match = pattern.exec(searchText)) !== null) {
      const relativeStartIndex = match.index;
      const relativeEndIndex = relativeStartIndex + match[0].length;
      const absoluteStartIndex = searchStartIndex + relativeStartIndex;
      const absoluteEndIndex = searchStartIndex + relativeEndIndex;
      
      // name/phone maskRanges와 겹치는지 확인
      const isOverlapping = namePhoneMaskRangesForExtension.some(maskRange => {
        // 겹침 조건: 두 범위가 완전히 분리되어 있지 않으면 겹침
        return !(
          absoluteEndIndex <= maskRange.startIndex || 
          absoluteStartIndex >= maskRange.endIndex
        );
      });
      
      if (!isOverlapping) {
        // 겹치지 않으면 건물명 토큰을 확장 대상으로 선택
        buildingMatch = {
          startIndex: absoluteStartIndex,
          endIndex: absoluteEndIndex,
          text: match[0],
        };
        break; // 첫 번째 겹치지 않는 건물명 토큰만 선택
      }
    }
    
    // 건물명 토큰이 발견되고 겹치지 않으면 endIndex 확장
    if (buildingMatch) {
      endCandidate.endIndex = buildingMatch.endIndex;
      endCandidate.text = text.substring(endCandidate.startIndex, endCandidate.endIndex);
      
      console.debug('[refineAddress] END 건물명 토큰 확장:', {
        startIndex: endCandidate.startIndex,
        originalEndIndex: currentEndIndex,
        extendedEndIndex: endCandidate.endIndex,
        buildingName: buildingMatch.text,
        buildingStartIndex: buildingMatch.startIndex,
        buildingEndIndex: buildingMatch.endIndex,
        score: endCandidate.score, // 점수는 변경하지 않음
      });
    }
  }

  // 우선순위 기반 END 감점 처리: 더 강한 END가 뒤에 있으면 앞 END는 감점 또는 보조 END로 처리
  // 우선순위: 호(3) > 번지(2) > 층(1) > 건물명(0) > 도로명번지(4) > 도로명(5)
  // 숫자가 클수록 우선순위가 높음
  for (let i = 0; i < endCandidates.length; i++) {
    const currentEnd = endCandidates[i];
    
    // 현재 END 뒤에 더 강한 우선순위의 END가 있는지 확인
    // 거리 제한: 200자 이내에 있는 END만 고려
    const MAX_DISTANCE_FOR_PRIORITY_CHECK = 200;
    for (let j = i + 1; j < endCandidates.length; j++) {
      const laterEnd = endCandidates[j];
      const distance = laterEnd.startIndex - currentEnd.endIndex;
      
      // 거리 제한 내에 있고, 우선순위가 더 높은 END가 있으면
      if (distance <= MAX_DISTANCE_FOR_PRIORITY_CHECK && laterEnd.priority > currentEnd.priority) {
        // 앞 END를 보조 END로 표시하고 감점 처리
        currentEnd.isAuxiliary = true;
        // 감점: 우선순위 차이만큼 감점 (최대 -200점)
        const priorityDiff = laterEnd.priority - currentEnd.priority;
        const penalty = Math.min(priorityDiff * 50, 200);
        currentEnd.comparisonScore = currentEnd.score - 600 - penalty; // 기본 -600 페널티 + 우선순위 감점
        console.debug('[refineAddress] END 우선순위 감점 적용:', {
          currentEnd: {
            text: currentEnd.text,
            unit: currentEnd.unit,
            priority: currentEnd.priority,
            originalScore: currentEnd.score,
            comparisonScore: currentEnd.comparisonScore,
          },
          laterEnd: {
            text: laterEnd.text,
            unit: laterEnd.unit,
            priority: laterEnd.priority,
          },
          penalty,
        });
        break; // 첫 번째 더 강한 END만 고려
      }
    }
    
    // 보조 END가 아닌 경우 기본 -600 페널티만 적용
    if (!currentEnd.isAuxiliary) {
      currentEnd.comparisonScore = currentEnd.score - 600; // 700 - 600 = 100
    }
  }

  // START와 END가 모두 존재할 경우 address block으로 묶기
  const addressBlocks: Array<{ startIndex: number; endIndex: number; text: string }> = [];

  // START 후보 중 800점 중 가장 높은 점수를 가진 1개만 주소 시작으로 확정
  // (모든 START 후보는 800점이므로, 위치상 가장 앞에 있는 것을 선택)
  let selectedStart: StartCandidate | null = null;
  if (startCandidates.length > 0) {
    // 점수가 가장 높은 것 선택 (동일한 점수일 경우 위치상 가장 앞에 있는 것 선택)
    selectedStart = startCandidates.reduce((best, current) => {
      if (current.score > best.score) return current;
      if (current.score === best.score && current.startIndex < best.startIndex) return current;
      return best;
    });
  }

  // 규칙 기반 END 선택: START가 확정된 경우에만 START 뒤에 위치한 END를 조건 충족 시 무조건 채택
  // 우선순위: 호(3) > 번지(2) > 층(1) > 건물명(0) > 도로명번지(4) > 도로명(5)
  let selectedEnd: EndCandidate | null = null;
  
  if (selectedStart && endCandidates.length > 0) {
    // START 뒤에 위치한 END 후보들만 필터링 (START.endIndex 이후에 있는 것들)
    const endCandidatesAfterStart = endCandidates.filter(
      end => end.startIndex >= selectedStart!.endIndex
    );
    
    // 조건 1: 거리 제한 - START 이후 200자 이내에 있는 END 후보만 고려
    const MAX_DISTANCE_FROM_START = 200;
    const nearbyEndCandidates = endCandidatesAfterStart.filter(
      end => (end.startIndex - selectedStart!.endIndex) <= MAX_DISTANCE_FROM_START
    );
    
    // 조건 2: 비주소 엔티티 없음 - START~END 구간에 전화번호, 이름, 상품 등 비주소 엔티티가 없어야 함
    // 주의: 현재는 phoneResult만 사용 가능하며, 다른 엔티티 정보는 refineAddress에서 받지 않음
    // 향후 필요시 함수 시그니처를 확장하여 다른 엔티티 정보를 받아 체크할 수 있음
    
    // 조건 충족 시 우선순위를 고려하여 END 선택 (규칙 기반 조립 방식)
    if (nearbyEndCandidates.length > 0) {
      // 보조 END가 아닌 것들만 고려 (더 강한 END가 뒤에 있는 경우 제외)
      const nonAuxiliaryCandidates = nearbyEndCandidates.filter(end => !end.isAuxiliary);
      
      if (nonAuxiliaryCandidates.length > 0) {
        // 우선순위가 높은 것 우선, 동일 우선순위면 위치상 앞에 있는 것 선택
        selectedEnd = nonAuxiliaryCandidates.reduce((best, current) => {
          if (current.priority > best.priority) return current;
          if (current.priority === best.priority && current.startIndex < best.startIndex) return current;
          return best;
        });
      } else {
        // 모든 후보가 보조 END인 경우, 우선순위를 고려하여 선택
        selectedEnd = nearbyEndCandidates.reduce((best, current) => {
          if (current.priority > best.priority) return current;
          if (current.priority === best.priority && current.startIndex < best.startIndex) return current;
          return best;
        });
      }
      
      console.debug('[refineAddress] END 선택 (우선순위 고려):', {
        selectedEnd: selectedEnd ? {
          text: selectedEnd.text,
          unit: selectedEnd.unit,
          priority: selectedEnd.priority,
          isAuxiliary: selectedEnd.isAuxiliary,
          startIndex: selectedEnd.startIndex,
        } : null,
        totalCandidates: nearbyEndCandidates.length,
        nonAuxiliaryCount: nonAuxiliaryCandidates.length,
      });
    }
  }
  
  // END 확정 이후 조사/어미 패턴 절단 처리
  // 주소 END 이후에 붙는 조사·어미 때문에 END가 흐트러지는 문제를 해결
  if (selectedEnd) {
    const endIndex = selectedEnd.endIndex;
    const remainingText = text.substring(endIndex);
    
    // 조사/어미 패턴 목록 (정규식으로 매칭)
    // 긴 패턴부터 먼저 체크 (예: "입니다만요"가 "입니다"보다 우선 매칭되어야 함)
    const postfixPatterns = [
      /^입니다만요/,
      /^입니다요/,
      /^입니다만/,
      /^입니다\./,
      /^입니다,/,
      /^이구요/,
      /^이에요/,
      /^에요\./,
      /^입니다/,
      /^에요/,
    ];
    
    // endIndex 바로 뒤의 substring이 패턴 중 하나로 시작하는지 확인
    for (const pattern of postfixPatterns) {
      const match = remainingText.match(pattern);
      if (match) {
        // 패턴이 발견되면 endIndex를 패턴 시작 직전으로 고정
        // 패턴부터 이후 텍스트는 주소 파이프라인에서 제외됨 (address block 생성 시 제외)
        // 주의: ^로 시작하는 정규식이므로 match.index는 항상 0이며, 
        //      현재 endIndex가 이미 패턴 시작 직전 위치이므로 그대로 유지
        const patternStartOffset = match.index || 0;
        selectedEnd.endIndex = endIndex + patternStartOffset;
        
        console.debug('[refineAddress] END 조사/어미 패턴 절단:', {
          originalEndIndex: endIndex,
          adjustedEndIndex: selectedEnd.endIndex,
          matchedPattern: match[0],
          remainingText: remainingText.substring(0, 50), // 디버깅용 처음 50자만
        });
        break; // 첫 번째 매칭되는 패턴만 처리
      }
    }
  }
  
  // END는 다른 엔티티 후보로 재사용되지 않도록 mask 처리됨 (addressMaskRanges로 처리)

  // ============================================================================
  // 명시적 규칙: HOLD_BATCH_PROCESSING 분기 (status 결정 단계 전용)
  // ============================================================================
  // 규칙 1: HOLD_BATCH_PROCESSING은 점수 계산 단계에 영향을 주지 않음
  // 규칙 2: HOLD_BATCH_PROCESSING은 후보 생성 단계에 영향을 주지 않음
  // 규칙 3: HOLD_BATCH_PROCESSING은 오직 status 결정 단계에서만 적용됨
  // 규칙 4: selectedStart와 selectedEnd는 HOLD 여부와 관계없이 동일하게 계산됨
  // ============================================================================
  
  // HOLD: 엔티티 결합 억제
  // START부터 END까지의 범위를 하나의 주소 묶음으로 처리
  // START와 END가 모두 확정된 경우에만 address block 생성
  // 주의: HOLD는 점수 계산이나 후보 생성 단계에는 영향을 주지 않고, 최종 확정 여부(status 결정) 단계에서만 적용됨
  if (HOLD_BATCH_PROCESSING) {
    // HOLD 플래그 활성화 시: selectedStart && selectedEnd가 존재하면 address block 생성 허용
    if (selectedStart && selectedEnd) {
      // address block 생성 (START~END 구간을 하나의 addressBlock으로 묶음)
      const blockText = text.substring(selectedStart.startIndex, selectedEnd.endIndex);
      addressBlocks.push({
        startIndex: selectedStart.startIndex,
        endIndex: selectedEnd.endIndex,
        text: blockText,
      });
    }
  } else {
    // 기존 로직: 주소 묶음처리 수행
    if (selectedStart && selectedEnd) {
      // address block 생성 (START~END 구간을 하나의 addressBlock으로 묶음)
      const blockText = text.substring(selectedStart.startIndex, selectedEnd.endIndex);
      addressBlocks.push({
        startIndex: selectedStart.startIndex,
        endIndex: selectedEnd.endIndex,
        text: blockText,
      });
    } else {
      // 디버깅: selectedStart 또는 selectedEnd가 없는 케이스 로깅
      console.log('[refineAddress] selectedStart 또는 selectedEnd 없음:', {
        text: text,
        selectedStart: selectedStart ? {
          startIndex: selectedStart.startIndex,
          endIndex: selectedStart.endIndex,
          text: selectedStart.text,
          matchedText: text.substring(selectedStart.startIndex, selectedStart.endIndex),
        } : null,
        selectedEnd: selectedEnd ? {
          startIndex: selectedEnd.startIndex,
          endIndex: selectedEnd.endIndex,
          text: selectedEnd.text,
          unit: selectedEnd.unit,
        } : null,
        startCandidatesCount: startCandidates.length,
        endCandidatesCount: endCandidates.length,
      });
    }
  }
  // 주의: 광역단위 없이 시/군만 존재하는 주소는 startCandidates가 비어있어
  // address block이 생성되지 않으며, 이는 START 미확정 상태를 의미함

  // nameResult와 겹치는 address blocks 필터링
  if (nameResult && nameResult.selected) {
    // nameResult.selected.range 또는 hints.maskRanges에서 이름 범위 찾기
    let nameRange: { startIndex: number; endIndex: number } | null = null;
    
    // 우선 hints.maskRanges에서 NAME 타입의 범위 찾기
    if (nameResult.hints?.maskRanges && nameResult.hints.maskRanges.length > 0) {
      const nameMaskRange = nameResult.hints.maskRanges.find(r => r.entityType === 'NAME');
      if (nameMaskRange) {
        nameRange = {
          startIndex: nameMaskRange.startIndex,
          endIndex: nameMaskRange.endIndex,
        };
      }
    }
    
    // hints.maskRanges에 없으면 원문에서 selected 문자열의 위치 찾기
    if (!nameRange && nameResult.selected) {
      const selectedName = nameResult.selected;
      const nameIndex = text.indexOf(selectedName);
      if (nameIndex !== -1) {
        nameRange = {
          startIndex: nameIndex,
          endIndex: nameIndex + selectedName.length,
        };
      }
    }
    
    // nameRange가 있으면 겹치는 address blocks 제거
    if (nameRange) {
      const filteredAddressBlocks = addressBlocks.filter(block => {
        // START~END 범위와 nameRange가 겹치는지 확인
        // 겹침 조건: 두 범위가 완전히 분리되어 있지 않으면 겹침
        const isOverlapping = !(
          block.endIndex <= nameRange!.startIndex || 
          block.startIndex >= nameRange!.endIndex
        );
        
        if (isOverlapping) {
          console.debug('[refineAddress] nameResult와 겹치는 address block 제거:', {
            addressBlock: {
              startIndex: block.startIndex,
              endIndex: block.endIndex,
              text: block.text,
            },
            nameRange: {
              startIndex: nameRange.startIndex,
              endIndex: nameRange.endIndex,
            },
          });
        }
        
        return !isOverlapping;
      });
      
      addressBlocks.length = 0;
      addressBlocks.push(...filteredAddressBlocks);
    }
  }

  // address blocks를 candidates에 추가
  for (const block of addressBlocks) {
    candidates.push(block.text);
    console.debug('[refineAddress] address block candidate 생성:', {
      value: block.text,
      score: undefined, // address block은 점수 없음
      breakdown: {
        startIndex: block.startIndex,
        endIndex: block.endIndex,
        type: 'ADDRESS_BLOCK',
      },
    });
  }

  // 주소 후보(candidates) 생성이 모두 끝난 직후 디버그 출력
  console.debug('[refineAddress] 1) candidates 배열 전체:', candidates);
  
  // 각 candidate의 value, score, breakdown 출력
  const candidateDetails = addressBlocks.map((block, index) => ({
    value: block.text,
    score: undefined, // address block은 점수 없음
    breakdown: {
      startIndex: block.startIndex,
      endIndex: block.endIndex,
      type: 'ADDRESS_BLOCK',
    },
  }));
  console.debug('[refineAddress] 2) 각 candidate의 value, score, breakdown:', candidateDetails);
  
  // address-resolver를 사용한 점수 계산 및 status 결정
  // ① 최고행정구역(anchor) 존재 필수
  // ② anchor 뒤에 시/군/구·동/읍/면·로/길·번지 중 하나라도 이어지는 주소 흐름이 있으면 주소 후보 유지
  // ③ END(번지/도로명 숫자) 존재 시 score=100, 없으면 score=0
  // ④ anchor 존재 + score>=100인 경우만 CONFIRMED, 그 외는 WARNING로 유지하며 가산점은 점수 계산에 절대 반영하지 말 것
  
  // anchor 뒤에 주소 흐름(시/군/구·동/읍/면·로/길·번지) 존재 여부 확인
  let hasAddressFlow = false;
  if (selectedStart) {
    const anchorEndIndex = selectedStart.endIndex;
    const textAfterAnchor = text.substring(anchorEndIndex);
    
    // 시/군/구 패턴 (이미 middleElements에 있음)
    const hasCityDistrict = middleElements.some(m => m.startIndex >= anchorEndIndex);
    
    // 동/읍/면 패턴
    const dongEupMyeonPattern = /([가-힣]+(?:동|읍|면))/g;
    const dongEupMyeonMatches = Array.from(textAfterAnchor.matchAll(dongEupMyeonPattern));
    const hasDongEupMyeon = dongEupMyeonMatches.length > 0;
    
    // 로/길 패턴
    const roadPattern = /([가-힣]+(?:로|길|대로))/g;
    const roadMatches = Array.from(textAfterAnchor.matchAll(roadPattern));
    const hasRoad = roadMatches.length > 0;
    
    // 번지 패턴 (END 후보에 포함되지만, 주소 흐름 확인용으로도 체크)
    const beonjiPattern = /(\d+번지)/g;
    const beonjiMatches = Array.from(textAfterAnchor.matchAll(beonjiPattern));
    const hasBeonji = beonjiMatches.length > 0;
    
    // 시/군/구·동/읍/면·로/길·번지 중 하나라도 있으면 주소 흐름 존재
    hasAddressFlow = hasCityDistrict || hasDongEupMyeon || hasRoad || hasBeonji;
  }
  
  // address resolver 입력 준비
  const resolverInput: AddressResolverInput = {
    hasAnchor: !!selectedStart, // 최고 행정구역(anchor) 존재 여부
    hasAddressFlow, // anchor 뒤에 주소 흐름(시/군/구·동/읍/면·로/길·번지) 존재 여부
    hasEnd: !!selectedEnd, // END(번지/도로명 숫자) 존재 여부
  };
  
  // 점수 계산 및 status 결정
  const resolverResult = resolveAddressScore(resolverInput);
  
  // ============================================================================
  // address.selected 생성 로직 (단일 관문)
  // ============================================================================
  // 조건:
  // (1) NAME/PHONE maskRange와 겹치지 않는 candidate만 대상
  // (2) START+FLOW+END 총점이 기준점수 이상이고 END 포함
  // (3) 최고점 candidate 1개만 selected로 승격
  // 조건 미충족 시 selected는 null로 유지하고 candidates는 그대로 둠
  // ============================================================================
  
  // NAME/PHONE maskRange 수집
  const namePhoneMaskRanges: Array<{ startIndex: number; endIndex: number }> = [];
  
  // nameResult에서 NAME maskRange 수집
  if (nameResult?.hints?.maskRanges) {
    for (const maskRange of nameResult.hints.maskRanges) {
      if (maskRange.entityType === 'NAME') {
        namePhoneMaskRanges.push({
          startIndex: maskRange.startIndex,
          endIndex: maskRange.endIndex,
        });
      }
    }
  }
  
  // phoneResult에서 PHONE maskRange 수집
  if (phoneResult?.hints?.maskRanges) {
    for (const maskRange of phoneResult.hints.maskRanges) {
      if (maskRange.entityType === 'PHONE') {
        namePhoneMaskRanges.push({
          startIndex: maskRange.startIndex,
          endIndex: maskRange.endIndex,
        });
      }
    }
  }
  
  // 각 addressBlock에 대해 점수 계산 및 조건 검증
  interface ScoredCandidate {
    block: { startIndex: number; endIndex: number; text: string };
    startScore: number; // START 점수 (800점)
    flowScore: number; // FLOW 점수 (hasAddressFlow가 true면 1점, 아니면 0점)
    endScore: number; // END 점수 (100점)
    totalScore: number; // START+FLOW+END 총점
    hasEnd: boolean; // END 포함 여부
    isOverlappingMaskRange: boolean; // maskRange 겹침 여부
  }
  
  const scoredCandidates: ScoredCandidate[] = [];
  const candidateDebugInfo: Array<{
    candidate: string;
    startScore: number;
    flowScore: number;
    endScore: number;
    totalScore: number;
    hasEnd: boolean;
    isOverlappingMaskRange: boolean;
  }> = [];
  
  for (const block of addressBlocks) {
    // 조건 (1): NAME/PHONE maskRange와 겹치지 않는지 확인
    const isOverlapping = namePhoneMaskRanges.some(maskRange => {
      // 겹침 조건: 두 범위가 완전히 분리되어 있지 않으면 겹침
      return !(
        block.endIndex <= maskRange.startIndex || 
        block.startIndex >= maskRange.endIndex
      );
    });
    
    // 점수 계산 (겹침 여부와 관계없이 모든 candidate에 대해 계산)
    const startScore = selectedStart ? 800 : 0;
    const flowScore = hasAddressFlow ? 1 : 0;
    const endScore = selectedEnd ? 100 : 0;
    const totalScore = startScore + flowScore + endScore;
    const hasEnd = !!selectedEnd;
    
    // 모든 candidate에 대한 debug 정보 수집
    candidateDebugInfo.push({
      candidate: block.text,
      startScore,
      flowScore,
      endScore,
      totalScore,
      hasEnd,
      isOverlappingMaskRange: isOverlapping,
    });
    
    if (isOverlapping) {
      // NAME/PHONE maskRange와 겹치는 candidate는 제외
      continue;
    }
    
    scoredCandidates.push({
      block,
      startScore,
      flowScore,
      endScore,
      totalScore,
      hasEnd,
      isOverlappingMaskRange: isOverlapping,
    });
  }
  
  // 조건 (2): START+FLOW+END 총점이 기준점수 이상이고 END 포함
  // 기준점수: 100점 (address-resolver에서 CONFIRMED가 되려면 finalScore >= 100이어야 함)
  const THRESHOLD_SCORE = 100;
  const validCandidates = scoredCandidates.filter(
    candidate => candidate.totalScore >= THRESHOLD_SCORE && candidate.hasEnd
  );
  
  // 조건 (3): 최고점 candidate 1개만 selected로 승격
  let finalSelectedAddress: string | undefined = undefined;
  if (validCandidates.length > 0) {
    // 최고점 candidate 찾기 (동일 점수일 경우 첫 번째 것 선택)
    const bestCandidate = validCandidates.reduce((best, current) => {
      if (current.totalScore > best.totalScore) return current;
      return best;
    });
    finalSelectedAddress = bestCandidate.block.text;
  }
  
  console.debug('[refineAddress] 3) 최종 selected(또는 resolved) address 값:', finalSelectedAddress);
  console.debug('[refineAddress] address-resolver 결과:', {
    finalScore: resolverResult.finalScore,
    status: resolverResult.status,
    failureReason: resolverResult.failureReason,
  });
  console.debug('[refineAddress] address.selected 생성 로직 결과:', {
    scoredCandidatesCount: scoredCandidates.length,
    validCandidatesCount: validCandidates.length,
    selected: finalSelectedAddress,
  });

  // ============================================================================
  // 명시적 규칙: Phone 엔티티 참조 (힌트 전용)
  // ============================================================================
  // 규칙 1: phoneResult는 오직 힌트(hint) 계산에만 사용됨
  // 규칙 2: phoneResult.selected/value/candidates를 주소 확정 판단에 직접 사용하지 않음
  // 규칙 3: phoneNearby 힌트는 주소 점수 계산이나 후보 생성에 영향을 주지 않음
  // 규칙 4: phoneNearby 힌트는 최종 status 결정 단계에서만 참고 가능
  // ============================================================================
  
  // phoneNearby 힌트 계산: 확정된 START/END의 startIndex~endIndex 범위 ±20자 내에 확정된 전화번호가 존재하는지 확인
  // 주의: START와 END는 이후 단계에서 점수 경쟁이 아닌 힌트 정보로만 작용
  // 주의: 전화번호는 확정된 것(selected)만 사용하며, 점수 경쟁이나 확정 판단에 사용하지 않고 힌트 정보로만 활용
  let phoneNearby = false;
  if (phoneResult && phoneResult.selected) {
    // 명시적 guard: phoneResult.selected는 힌트 계산에만 사용, 주소 확정 판단에는 사용하지 않음
    const representativePhone = phoneResult.selected; // 확정된 전화번호만 사용 (힌트 전용)
    
    // 확정된 START에 대해 확인
    if (selectedStart) {
      const rangeStart = Math.max(0, selectedStart.startIndex - 20);
      const rangeEnd = Math.min(text.length, selectedStart.endIndex + 20);
      const rangeText = text.substring(rangeStart, rangeEnd);
      
      if (rangeText.includes(representativePhone)) {
        phoneNearby = true;
      }
    }
    
    // 확정된 END에 대해 확인
    if (!phoneNearby && selectedEnd) {
      const rangeStart = Math.max(0, selectedEnd.startIndex - 20);
      const rangeEnd = Math.min(text.length, selectedEnd.endIndex + 20);
      const rangeText = text.substring(rangeStart, rangeEnd);
      
      if (rangeText.includes(representativePhone)) {
        phoneNearby = true;
      }
    }
  }

  // 주소 힌트 계산 (각 항목당 +30점 가중치)
  // 주의: START와 END는 이후 단계에서 점수 경쟁이 아닌 힌트 정보로만 작용
  // 1. START 연계: 확정된 START와 중간 요소가 연계되어 있는지 확인 (START 이후 50자 이내에 중간 요소 존재)
  let startLinkage = false;
  if (selectedStart && middleElements.length > 0) {
    for (const middleElement of middleElements) {
      // START 이후 50자 이내에 중간 요소가 있으면 연계됨
      if (middleElement.startIndex >= selectedStart.endIndex && 
          middleElement.startIndex <= selectedStart.endIndex + 50) {
        startLinkage = true;
        break;
      }
    }
  }

  // 2. END 근접: 확정된 END와 중간 요소가 근접해 있는지 확인 (END 이전 50자 이내에 중간 요소 존재)
  let endProximity = false;
  if (selectedEnd && middleElements.length > 0) {
    for (const middleElement of middleElements) {
      // END 이전 50자 이내에 중간 요소가 있으면 근접함
      if (middleElement.endIndex <= selectedEnd.startIndex && 
          middleElement.endIndex >= selectedEnd.startIndex - 50) {
        endProximity = true;
        break;
      }
    }
  }

  // 3. 도로명→건물 연결: 도로명과 건물명이 연결되어 있는지 확인
  // 주의: 주소 묶음에 포함된 END 후보만 확인 (확정된 END가 도로명이거나 건물명인 경우)
  let roadToBuilding = false;
  if (selectedEnd) {
    const roadEnd = endCandidates.find(e => e.unit === '도로명' && e === selectedEnd);
    const buildingEnd = endCandidates.find(e => e.unit === '건물명' && e === selectedEnd);
    
    // 확정된 END가 도로명인 경우, 그 이후 30자 이내에 건물명 END 후보가 있는지 확인
    if (roadEnd) {
      const nearbyBuilding = endCandidates.find(e => 
        e.unit === '건물명' && 
        e.startIndex >= roadEnd.endIndex && 
        e.startIndex <= roadEnd.endIndex + 30
      );
      if (nearbyBuilding) {
        roadToBuilding = true;
      }
    }
  }

  // 4. 행정 순서 정상 여부: 행정구역 순서가 정상인지 확인 (광역단위 → 시군구 → 동 순서)
  let adminOrder = false;
  if (selectedStart && middleElements.length > 0) {
    // 확정된 START(광역단위) 이후에 중간 요소(시군구)가 순서대로 있는지 확인
    const sortedMiddleElements = middleElements
      .filter(m => m.startIndex >= selectedStart.endIndex)
      .sort((a, b) => a.startIndex - b.startIndex);
    
    if (sortedMiddleElements.length > 0) {
      // 첫 번째 중간 요소가 START 이후에 있고, 순서가 올바르면 정상
      const firstMiddle = sortedMiddleElements[0];
      if (firstMiddle.startIndex >= selectedStart.endIndex && 
          firstMiddle.startIndex <= selectedStart.endIndex + 100) {
        adminOrder = true;
      }
    }
  }

  // status 결정: address-resolver에서 계산된 결과 사용
  // 최고 행정구역(anchor) 존재 + 최종 점수 >=100 조건을 만족할 때만 CONFIRMED로 판정
  const status = resolverResult.status;
  const failureReason = resolverResult.failureReason;

  // ============================================================================
  // END 확장 로직: CONFIRMED된 주소의 START 이후를 대상으로 END 확장
  // ============================================================================
  // 규칙:
  // - START 이후 20자 이내에서 다음 패턴을 END 후보로 탐색:
  //   숫자+호, 숫자+층, 지하+숫자+층, B숫자, 숫자+동, 상가+숫자+층, 오피스텔+숫자+호
  // - END 후보가 연속될 경우 마지막 END까지 range 확장
  // - END 확장은 score에 영향 주지 말고 range(startIndex~endIndex)만 확장
  // - 상품/옵션 키워드가 END 탐색 중 나오면 즉시 중단
  // - 기존 START/score/CONFIRMED 판정 로직은 절대 수정하지 않음
  // ============================================================================
  if (status === 'CONFIRMED' && selectedStart && selectedEnd && addressBlocks.length > 0) {
    // 상품/옵션 키워드 목록
    const productOptionKeywords = [
      '색상', '색', '크기', '사이즈', '옵션', '종류', '타입', '모델', '버전', 
      '스펙', '사양', '규격', '형태', '디자인', '스타일', '상품'
    ];
    
    // END 확장 패턴 정의
    const endExtensionPatterns = [
      { pattern: /(\d+호)/g, name: '숫자+호' },
      { pattern: /(\d+층)/g, name: '숫자+층' },
      { pattern: /(지하\d+층)/g, name: '지하+숫자+층' },
      { pattern: /(B\d+)/g, name: 'B숫자' },
      { pattern: /(B(?:0[1-9]|[1-9]))/g, name: 'B01/B1~B9' },
      { pattern: /(\d+동)/g, name: '숫자+동' },
      { pattern: /(상가\d+층)/g, name: '상가+숫자+층' },
      { pattern: /(오피스텔\d+호)/g, name: '오피스텔+숫자+호' },
      { pattern: /(지하(?:층)?)/g, name: '지하/지하층' },
      { pattern: /([1-9]\d{2,3}호)/g, name: '101호~9999호' },
    ];
    
    // START 이후 20자 이내 텍스트 추출
    const startAfterIndex = selectedStart.endIndex;
    const searchEndIndex = Math.min(text.length, startAfterIndex + 20);
    const searchText = text.substring(startAfterIndex, searchEndIndex);
    
    // 상품/옵션 키워드 체크: 탐색 범위 내에 키워드가 있으면 중단
    const hasProductOptionKeyword = productOptionKeywords.some(keyword => 
      searchText.includes(keyword)
    );
    
    if (!hasProductOptionKeyword) {
      // END 확장 후보 수집
      interface EndExtensionCandidate {
        startIndex: number;
        endIndex: number;
        text: string;
        patternName: string;
      }
      
      const extensionCandidates: EndExtensionCandidate[] = [];
      
      for (const endPattern of endExtensionPatterns) {
        const pattern = new RegExp(endPattern.pattern.source, endPattern.pattern.flags);
        let match;
        while ((match = pattern.exec(searchText)) !== null) {
          const relativeStartIndex = match.index;
          const relativeEndIndex = relativeStartIndex + match[0].length;
          const absoluteStartIndex = startAfterIndex + relativeStartIndex;
          const absoluteEndIndex = startAfterIndex + relativeEndIndex;
          
          // 기존 selectedEnd 이후에 있는 것만 후보로 추가
          if (absoluteStartIndex >= selectedEnd.endIndex) {
            extensionCandidates.push({
              startIndex: absoluteStartIndex,
              endIndex: absoluteEndIndex,
              text: match[0],
              patternName: endPattern.name,
            });
          }
        }
      }
      
      // END 후보가 연속될 경우 마지막 END까지 range 확장
      if (extensionCandidates.length > 0) {
        // startIndex 기준으로 정렬
        extensionCandidates.sort((a, b) => a.startIndex - b.startIndex);
        
        // 연속된 END 후보 찾기 (각 후보 사이의 거리가 10자 이내면 연속으로 간주)
        const MAX_GAP_FOR_CONTINUOUS = 10;
        let lastContinuousEndIndex = selectedEnd.endIndex;
        
        for (let i = 0; i < extensionCandidates.length; i++) {
          const candidate = extensionCandidates[i];
          
          // 첫 번째 후보는 기존 END와의 거리 체크
          if (i === 0) {
            const gap = candidate.startIndex - lastContinuousEndIndex;
            if (gap <= MAX_GAP_FOR_CONTINUOUS) {
              lastContinuousEndIndex = candidate.endIndex;
            } else {
              break; // 연속이 끊어지면 중단
            }
          } else {
            // 이전 후보와의 거리 체크
            const prevCandidate = extensionCandidates[i - 1];
            const gap = candidate.startIndex - prevCandidate.endIndex;
            if (gap <= MAX_GAP_FOR_CONTINUOUS) {
              lastContinuousEndIndex = candidate.endIndex;
            } else {
              break; // 연속이 끊어지면 중단
            }
          }
        }
        
        // END 확장 적용: addressBlocks의 endIndex 업데이트
        if (lastContinuousEndIndex > selectedEnd.endIndex) {
          for (const block of addressBlocks) {
            if (block.endIndex === selectedEnd.endIndex) {
              block.endIndex = lastContinuousEndIndex;
              block.text = text.substring(block.startIndex, block.endIndex);
              
              console.debug('[refineAddress] END 확장 적용:', {
                originalEndIndex: selectedEnd.endIndex,
                extendedEndIndex: lastContinuousEndIndex,
                extensionCandidates: extensionCandidates.map(c => ({
                  text: c.text,
                  patternName: c.patternName,
                  startIndex: c.startIndex,
                  endIndex: c.endIndex,
                })),
                extendedText: text.substring(selectedEnd.endIndex, lastContinuousEndIndex),
              });
            }
          }
        }
      }
    } else {
      console.debug('[refineAddress] END 확장 중단: 상품/옵션 키워드 발견', {
        searchText,
        foundKeywords: productOptionKeywords.filter(kw => searchText.includes(kw)),
      });
    }
  }

  // 주소 묶음 범위 정보: 이 범위에 포함된 요소들은 다른 파이프라인이나 엔티티 판단에 재사용하지 않음
  // Dead-State 처리: 엔티티 타입과 range 메타정보만 유지 (value·token·pattern·score 접근 차단)
  const addressMaskRanges: Array<{ startIndex: number; endIndex: number; entityType: 'ADDRESS' }> = [];
  for (const block of addressBlocks) {
    addressMaskRanges.push({
      startIndex: block.startIndex,
      endIndex: block.endIndex,
      entityType: 'ADDRESS',
    });
  }

  return {
    candidates,
    selected: finalSelectedAddress,
    confidence: resolverResult.finalScore,
    hints: {
      status,
      failureReason,
      phoneNearby,
      addressHints: {
        startLinkage,
        endProximity,
        roadToBuilding,
        adminOrder,
      },
      // 주소 묶음 범위: 이 범위에 포함된 요소들은 다른 파이프라인이나 엔티티 판단에 재사용하지 않음
      maskRanges: addressMaskRanges.length > 0 ? addressMaskRanges : undefined,
      // 각 candidate별 점수 및 판단 근거 디버그 정보
      addressCandidateDebug: candidateDebugInfo.length > 0 ? candidateDebugInfo : undefined,
    } as EntityHint,
  };
}

