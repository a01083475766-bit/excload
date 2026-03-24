'use client';

import { useState, useEffect } from 'react';
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

interface LogEntry {
  type: 'addressBlocks 미생성' | 'selectedStart 또는 selectedEnd 없음';
  data: any;
}

export default function AddressAnalysisReportPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [report, setReport] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 원본 console.log를 오버라이드하여 로그 수집
  useEffect(() => {
    const originalLog = console.log;
    const logEntries: LogEntry[] = [];

    console.log = (...args: any[]) => {
      originalLog(...args);
      
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[refineAddress]')) {
        const type = args[0].includes('addressBlocks 미생성') 
          ? 'addressBlocks 미생성' as const
          : 'selectedStart 또는 selectedEnd 없음' as const;
        
        if (args[1]) {
          logEntries.push({ type, data: args[1] });
          setLogs([...logEntries]);
        }
      }
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  const runAnalysis = () => {
    setIsAnalyzing(true);
    setLogs([]);
    setReport('');

    // 모든 테스트 케이스 실행
    testCases.forEach((text, index) => {
      const input: InputText = {
        text: text,
        source: 'test',
        receivedAt: new Date(),
      };

      refineAddress(input);
    });

    // 리포트 생성
    setTimeout(() => {
      const reportText = generateReport(logs);
      setReport(reportText);
      setIsAnalyzing(false);
    }, 1000);
  };

  const generateReport = (logEntries: LogEntry[]): string => {
    let report = '# Address Blocks 생성 실패 케이스 분석 리포트\n\n';
    report += `생성일시: ${new Date().toISOString()}\n\n`;
    report += `## 분석 개요\n\n`;
    report += `- 총 테스트 케이스: ${testCases.length}개\n`;
    report += `- addressBlocks 미생성 케이스: ${logEntries.filter(l => l.type === 'addressBlocks 미생성').length}개\n`;
    report += `- selectedStart/selectedEnd 없음 케이스: ${logEntries.filter(l => l.type === 'selectedStart 또는 selectedEnd 없음').length}개\n\n`;

    // addressBlocks 미생성 케이스 상세 분석
    const failedCases = logEntries.filter(l => l.type === 'addressBlocks 미생성');
    if (failedCases.length > 0) {
      report += `## addressBlocks 미생성 케이스 상세 분석\n\n`;
      
      failedCases.forEach((entry, index) => {
        const data = entry.data;
        report += `### 케이스 ${index + 1}: ${data.text}\n\n`;
        
        if (data.selectedStart) {
          report += `#### selectedStart 분석\n\n`;
          report += `| 항목 | 값 |\n`;
          report += `|------|-----|\n`;
          report += `| startIndex | ${data.selectedStart.startIndex} |\n`;
          report += `| endIndex | ${data.selectedStart.endIndex} |\n`;
          report += `| text | ${data.selectedStart.text} |\n`;
          report += `| matchedText | \`${data.selectedStart.matchedText}\` |\n`;
          report += `| nextChar | \`${data.selectedStart.nextChar}\` |\n`;
          report += `| nextChars | \`${data.selectedStart.nextChars}\` |\n\n`;
          
          // START endIndex 과도 확장 여부 확인
          const matchedLength = data.selectedStart.matchedText.length;
          const expectedEndIndex = data.selectedStart.startIndex + matchedLength;
          if (data.selectedStart.endIndex > expectedEndIndex) {
            report += `⚠️ **주의**: START의 endIndex가 매칭된 텍스트 길이보다 큼\n`;
            report += `- 예상 endIndex: ${expectedEndIndex} (startIndex + matchedText.length)\n`;
            report += `- 실제 endIndex: ${data.selectedStart.endIndex}\n`;
            report += `- 차이: ${data.selectedStart.endIndex - expectedEndIndex}자\n\n`;
          }
        }
        
        if (data.selectedEnd) {
          report += `#### selectedEnd 분석\n\n`;
          report += `| 항목 | 값 |\n`;
          report += `|------|-----|\n`;
          report += `| startIndex | ${data.selectedEnd.startIndex} |\n`;
          report += `| endIndex | ${data.selectedEnd.endIndex} |\n`;
          report += `| text | ${data.selectedEnd.text} |\n`;
          report += `| unit | ${data.selectedEnd.unit} |\n`;
          report += `| comparisonScore | ${data.selectedEnd.comparisonScore} |\n`;
          report += `| matchedText | \`${data.selectedEnd.matchedText}\` |\n`;
          report += `| prevChar | \`${data.selectedEnd.prevChar}\` |\n`;
          report += `| prevChars | \`${data.selectedEnd.prevChars}\` |\n\n`;
        }
        
        if (data.condition) {
          report += `#### 조건 분석\n\n`;
          report += `| 항목 | 값 |\n`;
          report += `|------|-----|\n`;
          report += `| selectedEnd.startIndex | ${data.condition.selectedEndStartIndex} |\n`;
          report += `| selectedStart.endIndex | ${data.condition.selectedStartEndIndex} |\n`;
          report += `| 조건 | \`${data.condition.comparison}\` |\n`;
          report += `| 결과 | ${data.condition.result ? '✅ 통과' : '❌ 실패'} |\n\n`;
          
          if (!data.condition.result) {
            const diff = data.condition.selectedStartEndIndex - data.condition.selectedEndStartIndex;
            report += `**문제점**: \`selectedEnd.startIndex (${data.condition.selectedEndStartIndex}) < selectedStart.endIndex (${data.condition.selectedStartEndIndex})\`\n\n`;
            report += `- START의 endIndex가 END의 startIndex보다 ${diff}자 큼\n`;
            report += `- START가 과도하게 확장되었거나, END가 START 앞에 위치함\n\n`;
            
            if (data.selectedStart) {
              report += `**START 확장 분석**:\n`;
              report += `- START matchedText: \`${data.selectedStart.matchedText}\`\n`;
              report += `- START nextChars: \`${data.selectedStart.nextChars}\`\n`;
              const includesParticle = ['은', '이', '의', '에', '로', '에서', ' ', '\t'].some(p => 
                data.selectedStart.nextChars.includes(p)
              );
              if (includesParticle) {
                report += `- ⚠️ START가 뒤 조사/공백까지 포함하는 것으로 보임\n\n`;
              }
            }
          }
        }
        
        if (data.allStartCandidates && data.allStartCandidates.length > 0) {
          report += `#### 모든 START 후보\n\n`;
          report += `| startIndex | endIndex | text | matchedText | nextChar | nextChars |\n`;
          report += `|------------|----------|------|--------------|----------|-----------|\n`;
          data.allStartCandidates.forEach((c: any) => {
            report += `| ${c.startIndex} | ${c.endIndex} | ${c.text} | \`${c.matchedText}\` | \`${c.nextChar}\` | \`${c.nextChars}\` |\n`;
          });
          report += `\n`;
        }
        
        if (data.allEndCandidates && data.allEndCandidates.length > 0) {
          report += `#### 모든 END 후보\n\n`;
          report += `| startIndex | endIndex | text | unit | comparisonScore | matchedText |\n`;
          report += `|------------|----------|------|------|-----------------|-------------|\n`;
          data.allEndCandidates.forEach((c: any) => {
            report += `| ${c.startIndex} | ${c.endIndex} | ${c.text} | ${c.unit} | ${c.comparisonScore} | \`${c.matchedText}\` |\n`;
          });
          report += `\n`;
        }
        
        report += `---\n\n`;
      });
    }

    // 서울특별시 START 분석
    const seoulFailedCases = failedCases.filter(e => e.data.text.includes('서울'));
    if (seoulFailedCases.length > 0) {
      report += `## 서울특별시 START 분석\n\n`;
      report += `### 서울 관련 실패 케이스 (${seoulFailedCases.length}개)\n\n`;
      
      report += `| 번호 | 텍스트 | START endIndex 확장 여부 | 조사/공백 포함 여부 |\n`;
      report += `|------|--------|-------------------------|---------------------|\n`;
      
      seoulFailedCases.forEach((entry, index) => {
        const data = entry.data;
        const expansion = data.selectedStart ? 
          (data.selectedStart.endIndex > data.selectedStart.startIndex + data.selectedStart.matchedText.length ? '⚠️ 확장됨' : '✅ 정상') :
          'N/A';
        const includesParticle = data.selectedStart && 
          ['은', '이', '의', '에', '로', '에서', ' ', '\t'].some(p => 
            data.selectedStart.nextChars.includes(p)
          );
        report += `| ${index + 1} | \`${data.text}\` | ${expansion} | ${includesParticle ? '⚠️ 포함' : '✅ 미포함'} |\n`;
      });
    }

    return report;
  };

  const downloadReport = () => {
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ADDRESS_BLOCKS_ANALYSIS_REPORT_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-8 bg-zinc-50 dark:bg-black">
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold text-black dark:text-zinc-50">
          Address Blocks 생성 실패 케이스 분석 리포트
        </h1>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-lg shadow">
          <button
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-400 text-white rounded-lg transition-colors"
          >
            {isAnalyzing ? '분석 중...' : '분석 실행'}
          </button>
          
          {report && (
            <button
              onClick={downloadReport}
              className="ml-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              리포트 다운로드
            </button>
          )}
        </div>

        {report && (
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-zinc-50">
              리포트 미리보기
            </h2>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg max-h-96 overflow-y-auto">
              <pre className="text-xs text-zinc-800 dark:text-zinc-200 font-mono whitespace-pre-wrap">
                {report}
              </pre>
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-zinc-50">
              수집된 로그 ({logs.length}개)
            </h2>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg max-h-96 overflow-y-auto">
              <pre className="text-xs text-zinc-800 dark:text-zinc-200 font-mono">
                {JSON.stringify(logs, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



