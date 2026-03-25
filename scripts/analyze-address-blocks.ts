/**
 * Address Blocks 생성 실패 케이스 분석 스크립트
 * END 후보가 존재함에도 addressBlocks가 생성되지 않는 케이스를 분석
 */

import { refineAddress } from '@/app/lib/refinement-engine/hint-engine/address';
import type { InputText } from '@/app/lib/refinement-engine/types/InputText';

// 테스트 케이스: END 후보가 존재하지만 addressBlocks가 생성되지 않을 수 있는 케이스
const testCases = [
  // 서울 관련 케이스
  '서울 강남구 테헤란로 123',
  '서울시 강남구 테헤란로 123',
  '서울특별시 강남구 테헤란로 123',
  '서울 강남구 테헤란로 123번지',
  '서울 강남구 테헤란로 123호',
  '서울 강남구 역삼동 123',
  '서울 강남구 역삼동 123번지',
  '서울 강남구 역삼동 123호',
  
  // 공백/조사 포함 케이스
  '서울은 강남구 테헤란로 123',
  '서울이 강남구 테헤란로 123',
  '서울의 강남구 테헤란로 123',
  '서울에 강남구 테헤란로 123',
  '서울로 강남구 테헤란로 123',
  '서울에서 강남구 테헤란로 123',
  
  // 복잡한 케이스
  '홍길동님께서 서울시 강남구 테헤란로 123에 사는 010-1234-5678로 연락주세요',
  '서울 강남구 테헤란로 123번지 456호',
  '서울 강남구 테헤란로 123번지 456호 7층',
  
  // 다른 광역시 케이스
  '부산 해운대구 해운대해변로 456',
  '인천광역시 연수구 송도동 100번지',
  '경기도 성남시 분당구 정자동 789번지',
];

interface AnalysisResult {
  text: string;
  hasStart: boolean;
  hasEnd: boolean;
  addressBlocksCreated: boolean;
  selectedStart?: {
    startIndex: number;
    endIndex: number;
    text: string;
    matchedText: string;
    nextChar: string;
    nextChars: string;
  };
  selectedEnd?: {
    startIndex: number;
    endIndex: number;
    text: string;
    unit: string;
    matchedText: string;
    prevChar: string;
    prevChars: string;
  };
  condition?: {
    selectedEndStartIndex: number;
    selectedStartEndIndex: number;
    comparison: string;
    result: boolean;
  };
  issue?: string;
}

function analyzeTestCase(text: string): AnalysisResult {
  const input: InputText = {
    text: text,
    source: 'test',
    receivedAt: new Date(),
  };

  const result = refineAddress(input);
  
  // 로그에서 정보를 추출하기 위해 간단한 분석
  // 실제로는 로그를 파싱하거나 refineAddress 함수를 수정해서 정보를 반환해야 함
  const hasStart = result.candidates.length > 0 || (result.hints as any)?.addressHints !== undefined;
  const hasEnd = result.candidates.length > 0;
  const addressBlocksCreated = result.candidates.length > 0;

  return {
    text: text,
    hasStart,
    hasEnd,
    addressBlocksCreated,
    issue: !addressBlocksCreated && (hasStart || hasEnd) ? 'addressBlocks 미생성' : undefined,
  };
}

// 리포트 생성
function generateReport(results: AnalysisResult[]): string {
  let report = '# Address Blocks 생성 실패 케이스 분석 리포트\n\n';
  report += `생성일시: ${new Date().toISOString()}\n\n`;
  report += `## 분석 개요\n\n`;
  report += `- 총 테스트 케이스: ${results.length}개\n`;
  report += `- addressBlocks 생성 성공: ${results.filter(r => r.addressBlocksCreated).length}개\n`;
  report += `- addressBlocks 생성 실패: ${results.filter(r => !r.addressBlocksCreated).length}개\n\n`;

  // 실패 케이스 상세 분석
  const failedCases = results.filter(r => !r.addressBlocksCreated);
  if (failedCases.length > 0) {
    report += `## 실패 케이스 상세 분석\n\n`;
    
    failedCases.forEach((result, index) => {
      report += `### 케이스 ${index + 1}: ${result.text}\n\n`;
      report += `- **텍스트**: \`${result.text}\`\n`;
      report += `- **START 후보 존재**: ${result.hasStart ? '✅' : '❌'}\n`;
      report += `- **END 후보 존재**: ${result.hasEnd ? '✅' : '❌'}\n`;
      report += `- **addressBlocks 생성**: ❌\n\n`;
      
      if (result.selectedStart) {
        report += `#### selectedStart 분석\n\n`;
        report += `| 항목 | 값 |\n`;
        report += `|------|-----|\n`;
        report += `| startIndex | ${result.selectedStart.startIndex} |\n`;
        report += `| endIndex | ${result.selectedStart.endIndex} |\n`;
        report += `| text | ${result.selectedStart.text} |\n`;
        report += `| matchedText | ${result.selectedStart.matchedText} |\n`;
        report += `| nextChar | \`${result.selectedStart.nextChar}\` |\n`;
        report += `| nextChars | \`${result.selectedStart.nextChars}\` |\n\n`;
      }
      
      if (result.selectedEnd) {
        report += `#### selectedEnd 분석\n\n`;
        report += `| 항목 | 값 |\n`;
        report += `|------|-----|\n`;
        report += `| startIndex | ${result.selectedEnd.startIndex} |\n`;
        report += `| endIndex | ${result.selectedEnd.endIndex} |\n`;
        report += `| text | ${result.selectedEnd.text} |\n`;
        report += `| unit | ${result.selectedEnd.unit} |\n`;
        report += `| matchedText | ${result.selectedEnd.matchedText} |\n`;
        report += `| prevChar | \`${result.selectedEnd.prevChar}\` |\n`;
        report += `| prevChars | \`${result.selectedEnd.prevChars}\` |\n\n`;
      }
      
      if (result.condition) {
        report += `#### 조건 분석\n\n`;
        report += `| 항목 | 값 |\n`;
        report += `|------|-----|\n`;
        report += `| selectedEnd.startIndex | ${result.condition.selectedEndStartIndex} |\n`;
        report += `| selectedStart.endIndex | ${result.condition.selectedStartEndIndex} |\n`;
        report += `| 조건 | \`${result.condition.comparison}\` |\n`;
        report += `| 결과 | ${result.condition.result ? '✅ 통과' : '❌ 실패'} |\n\n`;
        
        if (!result.condition.result) {
          report += `**문제점**: \`selectedEnd.startIndex (${result.condition.selectedEndStartIndex}) < selectedStart.endIndex (${result.condition.selectedStartEndIndex})\`\n\n`;
          report += `- START의 endIndex가 END의 startIndex보다 큼\n`;
          report += `- START가 과도하게 확장되었거나, END가 START 앞에 위치함\n\n`;
        }
      }
      
      report += `---\n\n`;
    });
  }

  // 서울특별시 START 분석
  report += `## 서울특별시 START 분석\n\n`;
  const seoulCases = results.filter(r => r.text.includes('서울'));
  report += `### 서울 관련 케이스 (${seoulCases.length}개)\n\n`;
  
  seoulCases.forEach((result, index) => {
    report += `${index + 1}. \`${result.text}\` - ${result.addressBlocksCreated ? '✅ 생성' : '❌ 미생성'}\n`;
  });
  
  report += `\n### 서울특별시 START 조사/공백 포함 여부\n\n`;
  report += `다음 케이스들을 확인하여 START가 뒤 조사/공백까지 포함하는지 점검:\n\n`;
  
  const seoulWithParticles = [
    '서울은 강남구',
    '서울이 강남구',
    '서울의 강남구',
    '서울에 강남구',
    '서울로 강남구',
    '서울에서 강남구',
  ];
  
  seoulWithParticles.forEach(text => {
    const caseResult = results.find(r => r.text === text);
    if (caseResult && caseResult.selectedStart) {
      const nextChar = caseResult.selectedStart.nextChar;
      const nextChars = caseResult.selectedStart.nextChars;
      const includesParticle = ['은', '이', '의', '에', '로', '에서'].some(p => nextChars.includes(p));
      report += `- \`${text}\`: nextChar=\`${nextChar}\`, nextChars=\`${nextChars}\` - ${includesParticle ? '⚠️ 조사 포함 가능' : '✅ 조사 미포함'}\n`;
    }
  });

  return report;
}

// 실행
console.log('Address Blocks 생성 실패 케이스 분석 시작...\n');

const results = testCases.map(analyzeTestCase);
const report = generateReport(results);

console.log(report);

// 리포트 파일로 저장
import { writeFileSync } from 'fs';
import { join } from 'path';

const reportPath = join(process.cwd(), 'ADDRESS_BLOCKS_ANALYSIS_REPORT.md');
writeFileSync(reportPath, report, 'utf-8');

console.log(`\n리포트가 ${reportPath}에 저장되었습니다.`);



