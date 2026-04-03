'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileSpreadsheet, Upload, CheckCircle, Download, ArrowRight, Loader2, MessageSquare, Sparkles, Copy, MousePointer2, ChevronLeft, ChevronRight, Check, Image as ImageIcon } from 'lucide-react';

type DemoStep = 
  | 'kakao-source' | 'copy-action' | 'paste-action' | 'text-pasted' | 'text-processing' | 'preview'
  | 'excel-source' | 'excel-upload' | 'excel-preview' | 'excel-processing' | 'excel-complete'
  | 'image-source' | 'image-upload' | 'image-preview'
  | 'text-input' | 'upload' | 'processing';

/** 데모: 왼쪽 입력 ↔ 오른쪽 필드 매칭을 보여 주는 공통 하이라이트 */
const DEMO_MATCH_HIGHLIGHT =
  'rounded px-0.5 bg-emerald-50 dark:bg-emerald-900/40 ring-1 ring-emerald-300/70 dark:ring-emerald-700/50';

function unifiedStepCaption(step: DemoStep): string {
  const labels: Record<string, string> = {
    'kakao-source': '① 카카오톡·상세 주문을 나란히 확인',
    'copy-action': '② 주문 내용 복사',
    'paste-action': '③ 엑클로드에 붙여넣기',
    'text-pasted': '④ 변환하기 실행',
    'text-processing': '처리 중…',
    preview: '⑤ 자동 변환 결과 미리보기',
    'excel-source': '엑셀에서 주문 불러오기',
    'excel-upload': '엑셀 파일 업로드',
    'excel-preview': '엑셀 변환 결과',
    'excel-processing': '엑셀 처리 중…',
    'excel-complete': '업로드 양식으로 정리 완료',
    'image-source': '이미지 주문 불러오기',
    'image-upload': '이미지 업로드',
    'image-preview': '이미지 변환 결과',
    'text-input': '텍스트 입력',
    upload: '업로드',
    processing: '처리 중',
  };
  return labels[step] ?? '데모 진행';
}

export default function DemoAnimation() {
  const [currentStep, setCurrentStep] = useState<DemoStep>('kakao-source');
  const [isAnimating, setIsAnimating] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [showPasteHighlight, setShowPasteHighlight] = useState(false);
  const [showCopyHighlight, setShowCopyHighlight] = useState(false);
  const [copiedText, setCopiedText] = useState('');
  const [lastFlowType, setLastFlowType] = useState<'kakao' | 'excel'>('kakao'); // 이전 흐름 추적
  const [showConvertHighlight, setShowConvertHighlight] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true); // 자동 재생 상태

  const kakaoText = `안녕하세요
제품주문입니다
홍길동
010-1234-5766
서울 강남구 테헤란로123
키보드 10개 주문합니다
빠른배송해주세요`;

  const sampleText = `받는 사람: 홍길동
전화번호: 010-1234-5766
주소: 서울시 강남구 테헤란로 123
상품명: 무선 블랙 마우스 / 수량: 2개
요청사항: 부재 시 문 앞에 놓아주세요`;

  // 단계 순서 정의 - 통합 흐름으로 변경
  const unifiedFlow: DemoStep[] = [
    'kakao-source', 'copy-action', 'paste-action', 'text-pasted', 'preview',
    'excel-source', 'excel-upload', 'excel-preview',
    'image-source', 'image-upload', 'image-preview',
    'excel-complete'
  ];
  
  // 하위 호환을 위한 별도 흐름 (사용 안 함)
  const kakaoFlow: DemoStep[] = ['kakao-source', 'copy-action', 'paste-action', 'text-pasted', 'preview'];
  const excelFlow: DemoStep[] = ['excel-source', 'excel-upload', 'preview', 'excel-complete'];
  
  // 현재 단계의 다음/이전 단계 찾기 (통합 흐름 사용)
  const getNextStep = (): DemoStep | null => {
    const currentIndex = unifiedFlow.indexOf(currentStep);
    
    if (currentIndex === -1) return null;
    
    // 마지막 단계인 경우 - 처음으로 돌아가기
    if (currentIndex === unifiedFlow.length - 1) {
      return 'kakao-source';
    }
    
    return unifiedFlow[currentIndex + 1];
  };
  
  const getPrevStep = (): DemoStep | null => {
    const currentIndex = unifiedFlow.indexOf(currentStep);
    
    if (currentIndex === -1) return null;
    
    // 첫 번째 단계인 경우 - 마지막으로 돌아가기
    if (currentIndex === 0) {
      return 'excel-complete';
    }
    
    return unifiedFlow[currentIndex - 1];
  };
  
  // 버튼 활성화 여부 계산 (useMemo로 최적화)
  const canGoNext = getNextStep() !== null;
  const canGoPrev = getPrevStep() !== null;
  
  // 버튼 클릭 핸들러
  const handleNext = () => {
    const next = getNextStep();
    if (next) {
      setIsAnimating(true);
      setTimeout(() => {
        // 엑셀 흐름 시작 시 lastFlowType 업데이트 (하위 호환)
        if (next === 'excel-source' || next === 'excel-upload') {
          setLastFlowType('excel');
        }
        // 카카오 흐름 시작 시 lastFlowType 업데이트 (하위 호환)
        else if (next === 'kakao-source' || next === 'copy-action') {
          setLastFlowType('kakao');
        }
        setCurrentStep(next);
        setIsAnimating(false);
      }, 300);
    }
  };
  
  const handlePrev = () => {
    const prev = getPrevStep();
    if (prev) {
      setIsAnimating(true);
      setIsAutoPlaying(false); // 수동 클릭 시 자동 재생 일시 정지
      setTimeout(() => {
        // 첫 단계에서 이전 흐름으로 전환할 때 lastFlowType 업데이트
        if (currentStep === 'excel-source') {
          setLastFlowType('kakao');
        } else if (currentStep === 'kakao-source') {
          setLastFlowType('excel');
        }
        setCurrentStep(prev);
        setIsAnimating(false);
        // 3초 후 자동 재생 재개
        setTimeout(() => {
          setIsAutoPlaying(true);
        }, 3000);
      }, 300);
    }
  };

  // 카톡 화면에서 우클릭 메뉴 효과
  useEffect(() => {
    if (currentStep === 'kakao-source') {
      setShowContextMenu(false);
      setShowCopyHighlight(false);
      
      // 약간의 딜레이 후 우클릭 메뉴 표시
      const showMenuDelay = setTimeout(() => {
        setShowContextMenu(true);
      }, 1500);
      
      return () => {
        clearTimeout(showMenuDelay);
        setShowContextMenu(false);
        setShowCopyHighlight(false);
      };
    }
  }, [currentStep]);

  // 카톡 화면에서 복사하기 효과
  useEffect(() => {
    if (currentStep === 'copy-action') {
      setShowCopyHighlight(false);
      // 1번 화면에서 이미 메뉴가 나타났으므로 바로 복사하기 하이라이트
      setShowContextMenu(true);
      
      // 복사하기 하이라이트 (약간의 딜레이 후)
      const highlightDelay = setTimeout(() => {
        setShowCopyHighlight(true);
        setTimeout(() => {
          setCopiedText(kakaoText);
        }, 500);
      }, 1000);
      
      return () => {
        clearTimeout(highlightDelay);
        setShowCopyHighlight(false);
      };
    }
  }, [currentStep]);

  // 붙여넣기 효과
  useEffect(() => {
    if (currentStep === 'paste-action') {
      setPastedText('');
      setShowPasteHighlight(false);
      // 붙여넣을 공간에 우클릭 메뉴 표시
      setShowContextMenu(true);
      
      // 붙여넣기 하이라이트 및 텍스트 붙여넣기
      const clickPasteDelay = setTimeout(() => {
        setShowPasteHighlight(true);
        setTimeout(() => {
          setPastedText(kakaoText);
          setShowContextMenu(false);
        }, 400);
      }, 1000);

      return () => {
        clearTimeout(clickPasteDelay);
        setShowContextMenu(false);
        setShowPasteHighlight(false);
      };
    }
  }, [currentStep]);

  // 변환하기 버튼 강조 효과
  useEffect(() => {
    if (currentStep === 'text-pasted') {
      setShowConvertHighlight(false);
      // 약간의 딜레이 후 변환하기 버튼 강조
      const highlightDelay = setTimeout(() => {
        setShowConvertHighlight(true);
      }, 800);

      return () => {
        clearTimeout(highlightDelay);
        setShowConvertHighlight(false);
      };
    }
  }, [currentStep]);

  // 자동 반복 재생 효과
  useEffect(() => {
    if (!isAutoPlaying || isAnimating) return;

    // 각 단계별 표시 시간 설정 (밀리초)
    const stepDurations: Record<DemoStep, number> = {
      'kakao-source': 3000,
      'copy-action': 2500,
      'paste-action': 2500,
      'text-pasted': 3000,
      'preview': 3000,
      'excel-source': 3000,
      'excel-upload': 3000,
      'excel-preview': 3000,
      'image-source': 3000,
      'image-upload': 3000,
      'image-preview': 3000,
      'excel-complete': 6000, // 마지막 화면은 조금 더 길게
      'text-processing': 2000,
      'excel-processing': 2000,
      'text-input': 2000,
      'upload': 2000,
      'processing': 2000,
    };

    const duration = stepDurations[currentStep] || 3000;
    
    const timer = setTimeout(() => {
      const next = getNextStep();
      if (next) {
        setIsAnimating(true);
        setTimeout(() => {
          // 엑셀 흐름 시작 시 lastFlowType 업데이트
          if (next === 'excel-source' || next === 'excel-upload') {
            setLastFlowType('excel');
          }
          // 카카오 흐름 시작 시 lastFlowType 업데이트
          else if (next === 'kakao-source' || next === 'copy-action') {
            setLastFlowType('kakao');
          }
          setCurrentStep(next);
          setIsAnimating(false);
        }, 300);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [currentStep, isAutoPlaying, isAnimating]);

  // 기존 텍스트 입력 단계 (하위 호환)
  useEffect(() => {
    if (currentStep === 'text-input') {
      setPastedText('');
      setShowContextMenu(false);
      setShowPasteHighlight(false);
      
      const showMenuDelay = setTimeout(() => {
        setShowContextMenu(true);
      }, 1000);
      
      const clickPasteDelay = setTimeout(() => {
        setShowPasteHighlight(true);
        setTimeout(() => {
          setPastedText(sampleText);
          setShowContextMenu(false);
        }, 300);
      }, 2500);

      return () => {
        clearTimeout(showMenuDelay);
        clearTimeout(clickPasteDelay);
        setShowContextMenu(false);
        setShowPasteHighlight(false);
      };
    }
  }, [currentStep]);

  return (
    <div className="w-full max-w-5xl mx-auto min-h-[400px] h-[min(500px,78vh)] max-h-[560px] rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 shadow-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-zinc-900 dark:to-zinc-800 overflow-hidden relative">
      {/* 배경 그리드 패턴 */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }} />
      </div>

      {/* 좌우 네비게이션 버튼 */}
      <button
        onClick={handlePrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/90 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 shadow-lg hover:bg-white dark:hover:bg-zinc-800 transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!canGoPrev}
      >
        <ChevronLeft className="w-6 h-6 text-zinc-700 dark:text-zinc-300" />
      </button>
      
      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/90 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 shadow-lg hover:bg-white dark:hover:bg-zinc-800 transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!canGoNext}
      >
        <ChevronRight className="w-6 h-6 text-zinc-700 dark:text-zinc-300" />
      </button>

      <div className="relative z-10 h-full flex items-center justify-center px-4 pt-4 pb-14 sm:px-6 sm:pt-5 sm:pb-[3.75rem]">
        {/* 한 화면에서 부드럽게 변환되는 통합 화면 */}
        {(['kakao-source', 'copy-action', 'paste-action', 'text-pasted', 'preview', 'excel-source', 'excel-upload', 'excel-preview', 'image-source', 'image-upload', 'image-preview', 'excel-complete'].includes(currentStep)) && (
          <motion.div
            key="unified-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-5xl"
          >
            {/* 제목 - 단계에 따라 변경 */}
            <motion.h3 
              key={`title-${currentStep}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 sm:mb-3 text-center"
            >
              {currentStep === 'kakao-source' && '카카오톡 주문과 주문 상세 페이지'}
              {currentStep === 'copy-action' && '복사하기'}
              {currentStep === 'paste-action' && '붙여넣기'}
              {currentStep === 'text-pasted' && '변환하기'}
              {currentStep === 'preview' && '변환 완료'}
              {currentStep === 'excel-source' && '엑셀 파일 주문 화면'}
              {currentStep === 'excel-upload' && '엑셀 파일 업로드'}
              {currentStep === 'excel-preview' && '변환 완료'}
              {currentStep === 'image-source' && '이미지 파일 주문 화면'}
              {currentStep === 'image-upload' && '이미지 파일 업로드'}
              {currentStep === 'image-preview' && '변환 완료'}
              {currentStep === 'excel-complete' && '자동 변환 완료'}
            </motion.h3>
            
            {/* 콘텐츠 영역 - 고정 높이로 통일 */}
            <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-3 min-h-0 w-full h-[min(340px,46vh)] sm:h-[360px] md:h-[392px]">
              {/* 왼쪽: 카톡 메시지 영역 - 항상 표시 (1-3단계) */}
              {!['preview', 'excel-source', 'excel-upload', 'excel-preview', 'image-source', 'image-upload', 'image-preview', 'excel-complete'].includes(currentStep) && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="w-full md:w-[40%] md:shrink-0 md:max-w-none bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border-2 border-yellow-300 dark:border-yellow-700 p-4 md:p-5 relative h-full min-h-0 flex flex-col"
                >
                  {/* 우클릭 컨텍스트 메뉴 - 1-2단계에서 표시 */}
                  {(['kakao-source', 'copy-action'].includes(currentStep) && showContextMenu) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-4 right-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px] z-20"
                    >
                      <button className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                        보내기
                      </button>
                      <div className="h-px bg-zinc-200 dark:border-zinc-700 my-1"></div>
                      <button className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                        잘라내기
                      </button>
                      <motion.button
                        className={`w-full text-left px-4 py-2 text-sm transition-colors relative overflow-hidden ${
                          (currentStep === 'copy-action' && showCopyHighlight)
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                        animate={(currentStep === 'copy-action' && showCopyHighlight) ? {
                          backgroundColor: ['rgba(59, 130, 246, 0.1)', 'rgba(59, 130, 246, 0.3)', 'rgba(59, 130, 246, 0.1)'],
                          scale: [1, 1.05, 1],
                          boxShadow: [
                            '0 0 0px rgba(59, 130, 246, 0)',
                            '0 0 20px rgba(59, 130, 246, 0.5)',
                            '0 0 0px rgba(59, 130, 246, 0)'
                          ],
                        } : {}}
                        transition={{ 
                          duration: 0.6,
                          ease: "easeInOut"
                        }}
                      >
                        <span className="flex items-center justify-between">
                          <span>복사하기</span>
                          {(currentStep === 'copy-action' && showCopyHighlight) && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 1] }}
                              transition={{ 
                                duration: 0.5,
                                delay: 0.2,
                                ease: "easeOut"
                              }}
                              className="ml-2"
                            >
                              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </motion.span>
                          )}
                        </span>
                        {/* 글로우 효과 */}
                        {(currentStep === 'copy-action' && showCopyHighlight) && (
                          <motion.div
                            className="absolute inset-0 rounded-lg"
                            animate={{
                              boxShadow: [
                                '0 0 0px rgba(59, 130, 246, 0)',
                                '0 0 15px rgba(59, 130, 246, 0.6)',
                                '0 0 0px rgba(59, 130, 246, 0)'
                              ],
                            }}
                            transition={{
                              duration: 1,
                              repeat: 2,
                              ease: "easeInOut"
                            }}
                          />
                        )}
                      </motion.button>
                      <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1"></div>
                      <button className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                        붙여넣기
                      </button>
                    </motion.div>
                  )}
                  
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                    카카오톡 주문
                  </p>
                  <div className="space-y-1.5 flex-1 flex flex-col justify-center min-h-0 overflow-y-auto">
                    {kakaoText.split('\n').map((line, index) => {
                      const matchLine = [2, 3, 4, 5, 6].includes(index);
                      return (
                        <motion.p
                          key={index}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className="text-sm leading-snug text-zinc-900 dark:text-zinc-100"
                        >
                          {matchLine ? (
                            <span className={`${DEMO_MATCH_HIGHLIGHT} inline`}>{line}</span>
                          ) : (
                            line
                          )}
                        </motion.p>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* 입력 → 변환 흐름 화살표 (카톡 데모 구간만) */}
              {['kakao-source', 'copy-action', 'paste-action', 'text-pasted'].includes(currentStep) && (
                <>
                  <div className="hidden md:flex flex-col items-center justify-center shrink-0 w-11 self-stretch text-emerald-600 dark:text-emerald-400">
                    <motion.div
                      animate={{ x: [0, 5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                      aria-hidden
                    >
                      <ArrowRight className="w-7 h-7" strokeWidth={2.25} />
                    </motion.div>
                    <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 mt-1 text-center leading-tight">
                      변환
                    </span>
                  </div>
                  <div className="flex md:hidden justify-center py-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
                    <motion.div
                      animate={{ y: [0, 4, 0] }}
                      transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                    >
                      <ArrowRight className="w-6 h-6 rotate-90" strokeWidth={2.25} />
                    </motion.div>
                  </div>
                </>
              )}

              {/* 오른쪽: 단계에 따라 변화 (엑셀/이미지는 이 안에서 좌우 2열) */}
              <div className="flex-1 min-h-0 min-w-0 flex flex-col md:flex-row md:items-stretch gap-2 md:gap-3 w-full">
              <AnimatePresence mode="wait">
                {/* 1단계: 주문 상세 페이지 */}
                {currentStep === 'kakao-source' && (
                  <motion.div
                    key="right-kakao-source"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 bg-white dark:bg-zinc-800 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 p-0 overflow-hidden h-full flex flex-col"
                  >
                  {/* 브라우저 상단 바 */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      쇼핑몰 · 기타 주문 상세 페이지
                    </p>
                    <div className="w-8" />
                  </div>

                  {/* 주문 상세 페이지 본문 */}
                  <div className="p-4 space-y-4 flex-1 flex flex-col justify-center overflow-y-auto">
                    {/* 상단 헤더 영역 (예: 주문번호, 상태 등) */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          주문번호
                        </p>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          2024-03-01-0001
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
                          결제완료
                        </span>
                      </div>
                    </div>

                    {/* 주문자/받는사람 정보 영역 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-1">
                        <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                          주문 정보
                        </p>
                        <p className="text-zinc-600 dark:text-zinc-300">
                          주문자:{' '}
                          <span className={DEMO_MATCH_HIGHLIGHT}>홍길동</span>
                        </p>
                        <p className="text-zinc-600 dark:text-zinc-300">
                          연락처:{' '}
                          <span className={DEMO_MATCH_HIGHLIGHT}>010-1234-5766</span>
                        </p>
                      </div>
                      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-1">
                        <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                          배송지 정보
                        </p>
                        <p className="text-zinc-600 dark:text-zinc-300">
                          받는사람:{' '}
                          <span className={DEMO_MATCH_HIGHLIGHT}>홍길동</span>
                        </p>
                        <p className="text-zinc-600 dark:text-zinc-300">
                          주소:{' '}
                          <span className={DEMO_MATCH_HIGHLIGHT}>서울 강남구 테헤란로 123</span>
                        </p>
                      </div>
                    </div>

                    {/* 상품 정보 테이블 */}
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                      <div className="grid grid-cols-4 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                        <div>상품명</div>
                        <div>옵션</div>
                        <div className="text-right">수량</div>
                        <div className="text-right">금액</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-[11px] text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>
                          <span className={DEMO_MATCH_HIGHLIGHT}>키보드</span>
                        </div>
                        <div>블랙</div>
                        <div className="text-right">
                          <span className={DEMO_MATCH_HIGHLIGHT}>10개</span>
                        </div>
                        <div className="text-right">150,000원</div>
                      </div>
                    </div>

                    {/* 하단 메모 영역 */}
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-1">
                        배송 요청사항
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300">
                        <span className={DEMO_MATCH_HIGHLIGHT}>빠른배송해주세요</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
                )}

                {/* 2단계: 복사하기 - 빈 공간 */}
                {currentStep === 'copy-action' && (
                  <motion.div
                    key="right-copy-action"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 bg-white dark:bg-zinc-800 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-5 md:p-6 flex items-center justify-center h-full"
                  >
                  </motion.div>
                )}

                {/* 3단계: 붙여넣기 - 텍스트 입력 영역 */}
                {currentStep === 'paste-action' && (
                  <motion.div
                    key="right-paste-action"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 bg-white dark:bg-zinc-800 rounded-xl border-2 border-zinc-300 dark:border-zinc-700 p-4 md:p-5 relative h-full flex flex-col"
                  >
                    {showContextMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-4 right-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px] z-20"
                      >
                        <button className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                          보내기
                        </button>
                        <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1"></div>
                        <button className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                          잘라내기
                        </button>
                        <button className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                          복사하기
                        </button>
                        <motion.button
                          className={`w-full text-left px-4 py-2 text-sm transition-colors relative overflow-hidden ${
                            showPasteHighlight 
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                          }`}
                          animate={showPasteHighlight ? {
                            backgroundColor: ['rgba(59, 130, 246, 0.1)', 'rgba(59, 130, 246, 0.3)', 'rgba(59, 130, 246, 0.1)'],
                            scale: [1, 1.05, 1],
                            boxShadow: [
                              '0 0 0px rgba(59, 130, 246, 0)',
                              '0 0 20px rgba(59, 130, 246, 0.5)',
                              '0 0 0px rgba(59, 130, 246, 0)'
                            ],
                          } : {}}
                          transition={{ 
                            duration: 1.0,
                            repeat: 1,
                            ease: "easeInOut"
                          }}
                        >
                          <span className="flex items-center justify-between">
                            <span>붙여넣기</span>
                            {showPasteHighlight && (
                              <motion.span
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 1] }}
                                transition={{ 
                                  duration: 0.5,
                                  delay: 0.2,
                                  ease: "easeOut"
                                }}
                                className="ml-2"
                              >
                                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              </motion.span>
                            )}
                          </span>
                          {/* 글로우 효과 */}
                          {showPasteHighlight && (
                            <motion.div
                              className="absolute inset-0 rounded-lg"
                              animate={{
                                boxShadow: [
                                  '0 0 0px rgba(59, 130, 246, 0)',
                                  '0 0 15px rgba(59, 130, 246, 0.6)',
                                  '0 0 0px rgba(59, 130, 246, 0)'
                                ],
                              }}
                              transition={{
                                duration: 1.2,
                                repeat: 3,
                                ease: "easeInOut"
                              }}
                            />
                          )}
                        </motion.button>
                      </motion.div>
                    )}
                    <motion.textarea
                      readOnly
                      value={pastedText}
                      initial={{ opacity: 0.5 }}
                      animate={{ 
                        opacity: pastedText ? 1 : 0.5,
                        scale: pastedText ? [0.98, 1] : 1
                      }}
                      transition={{ 
                        opacity: { duration: 0.3, delay: pastedText ? 0.1 : 0 },
                        scale: { duration: 0.2, delay: pastedText ? 0.1 : 0 }
                      }}
                      className="w-full flex-1 min-h-[11rem] md:min-h-0 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 md:p-4 text-sm text-zinc-900 dark:text-zinc-100 font-mono resize-none"
                      placeholder="주문 내용을 붙여넣으세요..."
                    />
                  </motion.div>
                )}

                {/* 4단계: 텍스트 입력 완료 */}
                {currentStep === 'text-pasted' && (
                  <motion.div
                    key="right-text-pasted"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 bg-white dark:bg-zinc-800 rounded-xl border-2 border-emerald-500 shadow-lg p-4 md:p-5 h-full flex flex-col"
                  >
                    <div className="flex items-center mb-4">
                      <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mr-2" />
                      <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        변환하기
                      </h4>
                    </div>
                    <textarea
                      readOnly
                      value={pastedText}
                      className="w-full flex-1 min-h-[11rem] md:min-h-0 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 md:p-4 text-sm text-zinc-900 dark:text-zinc-100 font-mono resize-none"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mt-4 flex justify-end"
                    >
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm flex items-center gap-2 relative overflow-hidden"
                        animate={showConvertHighlight ? {
                          scale: [1, 1.08, 1],
                          boxShadow: [
                            '0 0 0px rgba(16, 185, 129, 0)',
                            '0 0 25px rgba(16, 185, 129, 0.6)',
                            '0 0 0px rgba(16, 185, 129, 0)'
                          ],
                        } : {}}
                        transition={{ 
                          duration: 0.8,
                          ease: "easeInOut"
                        }}
                      >
                        <span className="flex items-center gap-2 relative z-10">
                          <Sparkles className="w-4 h-4" />
                          변환하기
                          {showConvertHighlight && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 1] }}
                              transition={{ 
                                duration: 0.5,
                                delay: 0.3,
                                ease: "easeOut"
                              }}
                            >
                              <Check className="w-4 h-4" />
                            </motion.span>
                          )}
                        </span>
                        {/* 글로우 효과 */}
                        {showConvertHighlight && (
                          <motion.div
                            className="absolute inset-0 rounded-lg"
                            animate={{
                              boxShadow: [
                                '0 0 0px rgba(16, 185, 129, 0)',
                                '0 0 20px rgba(16, 185, 129, 0.7)',
                                '0 0 0px rgba(16, 185, 129, 0)'
                              ],
                            }}
                            transition={{
                              duration: 1.2,
                              repeat: 2,
                              ease: "easeInOut"
                            }}
                          />
                        )}
                      </motion.button>
                    </motion.div>
                  </motion.div>
                )}

                {/* 5단계: 미리보기 */}
                {currentStep === 'preview' && (
                  <motion.div
                    key="right-preview"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 bg-white dark:bg-zinc-800 rounded-xl border-2 border-emerald-500 shadow-lg p-4 md:p-5 h-full flex flex-col"
                  >
                    <div className="flex items-center mb-3 shrink-0">
                      <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mr-2" />
                      <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        변환 완료
                      </h4>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 shrink-0">
                      미리보기에서 변환된 데이터를 확인하세요
                    </p>
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden flex-1 min-h-0 overflow-y-auto">
                      <div className="grid grid-cols-4 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        <div>받는사람</div>
                        <div>전화번호</div>
                        <div>주소</div>
                        <div>상품명</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>
                          <span className={DEMO_MATCH_HIGHLIGHT}>홍길동</span>
                        </div>
                        <div>
                          <span className={DEMO_MATCH_HIGHLIGHT}>010-1234-5766</span>
                        </div>
                        <div>
                          <span className={DEMO_MATCH_HIGHLIGHT}>서울 강남구 테헤란로 123</span>
                        </div>
                        <div>
                          <span className={DEMO_MATCH_HIGHLIGHT}>키보드 10개</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>김철수</div>
                        <div>010-2345-6789</div>
                        <div>서울시 서초구...</div>
                        <div>키보드</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>이영희</div>
                        <div>010-3456-7890</div>
                        <div>서울시 송파구...</div>
                        <div>모니터</div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 엑셀 미리보기 단계 */}
                {currentStep === 'excel-preview' && (
                  <motion.div
                    key="right-excel-preview"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 bg-white dark:bg-zinc-800 rounded-xl border-2 border-emerald-500 shadow-lg p-4 md:p-5 h-full flex flex-col"
                  >
                    <div className="flex items-center mb-3 shrink-0">
                      <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mr-2" />
                      <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        변환 완료
                      </h4>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 shrink-0">
                      미리보기에서 변환된 데이터를 확인하세요
                    </p>
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden flex-1 min-h-0 overflow-y-auto">
                      <div className="grid grid-cols-4 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        <div>받는사람</div>
                        <div>전화번호</div>
                        <div>주소</div>
                        <div>상품명</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>홍길동</div>
                        <div>010-1234-5678</div>
                        <div>서울시 강남구...</div>
                        <div>마우스</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>김철수</div>
                        <div>010-2345-6789</div>
                        <div>서울시 서초구...</div>
                        <div>키보드</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>이영희</div>
                        <div>010-3456-7890</div>
                        <div>서울시 송파구...</div>
                        <div>모니터</div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 이미지 파일 단계들 */}
                {/* 1단계: 이미지 파일 소스 - 왼쪽에 이미지 파일, 오른쪽에 드롭 영역 */}
                {currentStep === 'image-source' && (
                  <>
                    {/* 왼쪽: 이미지 파일 영역 */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full md:w-[40%] md:shrink-0 min-h-0 h-full bg-purple-50 dark:bg-purple-900/20 rounded-xl border-2 border-purple-300 dark:border-purple-700 p-4 md:p-5 flex flex-col"
                    >
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3">
                        이미지 파일 (주문 이미지)
                      </p>
                      <div className="bg-white dark:bg-zinc-800 rounded-lg p-3 mb-3 space-y-3 flex-1 overflow-y-auto">
                        {/* 이미지 파일들 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">주문 이미지 1.jpg</span>
                          </div>
                          <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-2 text-[9px] text-zinc-600 dark:text-zinc-400">
                            홍길동<br />
                            010-1234-5678<br />
                            서울시 강남구...
                          </div>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">주문 이미지 2.png</span>
                          </div>
                          <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-2 text-[9px] text-zinc-600 dark:text-zinc-400">
                            김철수<br />
                            010-2345-6789<br />
                            서울시 서초구...
                          </div>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">주문 이미지 3.jpg</span>
                          </div>
                          <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-2 text-[9px] text-zinc-600 dark:text-zinc-400">
                            이영희<br />
                            010-3456-7890<br />
                            서울시 송파구...
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                        <ImageIcon className="w-4 h-4" />
                        <span>주문 이미지 파일들</span>
                      </div>
                    </motion.div>

                    {/* 오른쪽: 드롭 영역 */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full md:flex-1 md:min-w-0 min-h-0 h-full bg-white dark:bg-zinc-800 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-5 md:p-6 flex items-center justify-center"
                    >
                      <p className="text-zinc-400 dark:text-zinc-500 text-sm text-center">
                        이미지 파일을 드래그하여 여기로 이동하세요
                      </p>
                    </motion.div>
                  </>
                )}

                {/* 2단계: 이미지 파일 드래그 앤 드롭 */}
                {currentStep === 'image-upload' && (
                  <>
                    {/* 왼쪽: 이미지 파일 영역 */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="w-full md:w-[40%] md:shrink-0 min-h-0 h-full bg-purple-50 dark:bg-purple-900/20 rounded-xl border-2 border-purple-300 dark:border-purple-700 p-4 md:p-5 flex flex-col"
                    >
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3">
                        이미지 파일 (주문 이미지)
                      </p>
                      <div className="bg-white dark:bg-zinc-800 rounded-lg p-3 mb-3 space-y-3 flex-1 overflow-y-auto">
                        {/* 이미지 파일들 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">주문 이미지 1.jpg</span>
                          </div>
                          <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-2 text-[9px] text-zinc-600 dark:text-zinc-400">
                            홍길동<br />
                            010-1234-5678<br />
                            서울시 강남구...
                          </div>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">주문 이미지 2.png</span>
                          </div>
                          <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-2 text-[9px] text-zinc-600 dark:text-zinc-400">
                            김철수<br />
                            010-2345-6789<br />
                            서울시 서초구...
                          </div>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">주문 이미지 3.jpg</span>
                          </div>
                          <div className="bg-zinc-100 dark:bg-zinc-900 rounded p-2 text-[9px] text-zinc-600 dark:text-zinc-400">
                            이영희<br />
                            010-3456-7890<br />
                            서울시 송파구...
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                        <ImageIcon className="w-4 h-4" />
                        <span>주문 이미지 파일들</span>
                      </div>
                    </motion.div>

                    {/* 오른쪽: 업로드 영역 */}
                    <motion.div
                      initial={{ opacity: 0, x: 20, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="w-full md:flex-1 md:min-w-0 min-h-0 h-full bg-white dark:bg-zinc-800 rounded-xl border-2 border-purple-500 shadow-lg p-4 md:p-5 flex flex-col gap-3"
                    >
                      <motion.div
                        initial={{ x: -24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="shrink-0 flex justify-center"
                      >
                        <motion.div
                          animate={{
                            scale: [1, 1.06, 1],
                            rotate: [0, 4, -4, 0],
                          }}
                          transition={{
                            duration: 0.7,
                            ease: "easeInOut",
                            repeat: Infinity,
                            repeatDelay: 0.4,
                          }}
                          className="bg-purple-50 dark:bg-purple-900/20 rounded-lg px-4 py-3 border-2 border-purple-300 dark:border-purple-700"
                        >
                          <div className="flex items-center gap-3">
                            <ImageIcon className="w-7 h-7 text-purple-600 dark:text-purple-400 shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                주문 이미지.jpg
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                업로드 중...
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                      <div className="flex-1 min-h-[9rem] flex flex-col">
                        <motion.div
                          animate={{
                            borderColor: ['rgb(168, 85, 247)', 'rgb(147, 51, 234)', 'rgb(168, 85, 247)'],
                          }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                          className="flex-1 min-h-[9rem] rounded-lg border-2 border-dashed border-purple-500 bg-purple-50/50 dark:bg-purple-900/20 flex flex-col items-center justify-center py-8 px-4"
                        >
                          <Upload className="w-9 h-9 mb-2 text-purple-600 dark:text-purple-400" />
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                            파일 업로드 중...
                          </p>
                        </motion.div>
                      </div>
                    </motion.div>
                  </>
                )}

                {/* 이미지 미리보기 단계 */}
                {currentStep === 'image-preview' && (
                  <motion.div
                    key="right-image-preview"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 bg-white dark:bg-zinc-800 rounded-xl border-2 border-emerald-500 shadow-lg p-4 md:p-5 h-full flex flex-col"
                  >
                    <div className="flex items-center mb-3 shrink-0">
                      <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mr-2" />
                      <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        변환 완료
                      </h4>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 shrink-0">
                      미리보기에서 변환된 데이터를 확인하세요
                    </p>
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden flex-1 min-h-0 overflow-y-auto">
                      <div className="grid grid-cols-4 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        <div>받는사람</div>
                        <div>전화번호</div>
                        <div>주소</div>
                        <div>상품명</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>홍길동</div>
                        <div>010-1234-5678</div>
                        <div>서울시 강남구...</div>
                        <div>마우스</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>김철수</div>
                        <div>010-2345-6789</div>
                        <div>서울시 서초구...</div>
                        <div>키보드</div>
                      </div>
                      <div className="grid grid-cols-4 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 border-t border-zinc-200 dark:border-zinc-700">
                        <div>이영희</div>
                        <div>010-3456-7890</div>
                        <div>서울시 송파구...</div>
                        <div>모니터</div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 엑셀 완료 단계 */}
                {currentStep === 'excel-complete' && (
                  <motion.div
                    key="right-excel-complete"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="w-full min-h-0 flex-1 max-w-3xl mx-auto bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 rounded-xl border-2 border-emerald-500 shadow-lg p-6 md:p-8 h-full flex flex-col items-center justify-center overflow-y-auto"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ 
                        type: "spring",
                        stiffness: 200,
                        damping: 15,
                        delay: 0.2
                      }}
                      className="mb-6"
                    >
                      <CheckCircle className="w-16 h-16 text-emerald-600 dark:text-emerald-400" />
                    </motion.div>
                    <motion.h4
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4 text-center"
                    >
                      자동 변환 완료
                    </motion.h4>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-base text-zinc-700 dark:text-zinc-300 text-center max-w-2xl leading-relaxed"
                    >
                      카카오톡 텍스트 주문이나 주문페이지의 텍스트를<br />
                      복사해서 붙여넣기만 하면 쉽게 변환할 수 있고,<br />
                      엑셀 파일의 양식이 달라도 택배사 업로드 양식으로<br />
                      자동으로 변환하여 편리하게 관리할 수 있습니다
                    </motion.p>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="mt-8 flex justify-center gap-3"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-zinc-800/80 rounded-lg border border-emerald-200 dark:border-emerald-700 whitespace-nowrap">
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">텍스트주문 변환</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-zinc-800/80 rounded-lg border border-emerald-200 dark:border-emerald-700 whitespace-nowrap">
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">다양한 헤더 형식 지원</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-zinc-800/80 rounded-lg border border-emerald-200 dark:border-emerald-700 whitespace-nowrap">
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">자동 변환 처리</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-zinc-800/80 rounded-lg border border-emerald-200 dark:border-emerald-700 whitespace-nowrap">
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">택배사 양식 통일</span>
                      </div>
                    </motion.div>
                  </motion.div>
                )}

                {/* 엑셀 파일 단계들 */}
                {/* 1단계: 엑셀 파일 소스 - 왼쪽에 엑셀 파일, 오른쪽에 드롭 영역 */}
                {currentStep === 'excel-source' && (
                  <>
                    {/* 왼쪽: 엑셀 파일 영역 */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full md:w-[40%] md:shrink-0 min-h-0 h-full bg-blue-50 dark:bg-blue-900/20 rounded-xl border-2 border-blue-300 dark:border-blue-700 p-4 md:p-5 flex flex-col"
                    >
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3">
                        엑셀 파일 (다양한 헤더 형식)
                      </p>
                      <div className="bg-white dark:bg-zinc-800 rounded-lg p-3 mb-3 space-y-3 flex-1 overflow-y-auto">
                        {/* 첫 번째 테이블: 보내는사람 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">보내는사람</div>
                            <div className="font-semibold">전화</div>
                            <div className="font-semibold">주소</div>
                            <div className="font-semibold">상품</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>김철구</div>
                            <div>010-9876-5432</div>
                            <div>서울시 강서구...</div>
                            <div>키보드</div>
                          </div>
                        </div>

                        {/* 두 번째 테이블: 이름 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">이름</div>
                            <div className="font-semibold">주소</div>
                            <div className="font-semibold">전화번호</div>
                            <div className="font-semibold">주문상품</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>홍길동</div>
                            <div>인천시 남동구...</div>
                            <div>010-1111-2222</div>
                            <div>사과</div>
                          </div>
                        </div>

                        {/* 세 번째 테이블: 받는분 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">받는분주소</div>
                            <div className="font-semibold">받는분전화</div>
                            <div className="font-semibold">상품</div>
                            <div className="font-semibold">이름</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>부산시 해운대구...</div>
                            <div>010-3333-4444</div>
                            <div>책가방</div>
                            <div>김영희</div>
                          </div>
                        </div>

                        {/* 네 번째 테이블: 받는사람 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">받는사람</div>
                            <div className="font-semibold">전화번호</div>
                            <div className="font-semibold">주소</div>
                            <div className="font-semibold">상품명</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>이민수</div>
                            <div>010-5555-6666</div>
                            <div>대전시 유성구...</div>
                            <div>노트북</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>주문 파일.xlsx</span>
                      </div>
                    </motion.div>

                    {/* 오른쪽: 드롭 영역 */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full md:flex-1 md:min-w-0 min-h-0 h-full bg-white dark:bg-zinc-800 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-5 md:p-6 flex items-center justify-center"
                    >
                      <p className="text-zinc-400 dark:text-zinc-500 text-sm text-center">
                        엑셀 파일을 드래그하여 여기로 이동하세요
                      </p>
                    </motion.div>
                  </>
                )}

                {/* 2단계: 엑셀 파일 드래그 앤 드롭 */}
                {currentStep === 'excel-upload' && (
                  <>
                    {/* 왼쪽: 엑셀 파일 영역 */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="w-full md:w-[40%] md:shrink-0 min-h-0 h-full bg-blue-50 dark:bg-blue-900/20 rounded-xl border-2 border-blue-300 dark:border-blue-700 p-4 md:p-5 flex flex-col"
                    >
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3">
                        엑셀 파일 (다양한 헤더 형식)
                      </p>
                      <div className="bg-white dark:bg-zinc-800 rounded-lg p-3 mb-3 space-y-3 flex-1 overflow-y-auto">
                        {/* 첫 번째 테이블: 보내는사람 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">보내는사람</div>
                            <div className="font-semibold">전화</div>
                            <div className="font-semibold">주소</div>
                            <div className="font-semibold">상품</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>김철구</div>
                            <div>010-9876-5432</div>
                            <div>서울시 강서구...</div>
                            <div>키보드</div>
                          </div>
                        </div>

                        {/* 두 번째 테이블: 이름 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">이름</div>
                            <div className="font-semibold">주소</div>
                            <div className="font-semibold">전화번호</div>
                            <div className="font-semibold">주문상품</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>홍길동</div>
                            <div>인천시 남동구...</div>
                            <div>010-1111-2222</div>
                            <div>사과</div>
                          </div>
                        </div>

                        {/* 세 번째 테이블: 받는분 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">받는분주소</div>
                            <div className="font-semibold">받는분전화</div>
                            <div className="font-semibold">상품</div>
                            <div className="font-semibold">이름</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>부산시 해운대구...</div>
                            <div>010-3333-4444</div>
                            <div>책가방</div>
                            <div>김영희</div>
                          </div>
                        </div>

                        {/* 네 번째 테이블: 받는사람 형식 */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded">
                          <div className="grid grid-cols-4 gap-1 text-[10px] bg-zinc-50 dark:bg-zinc-900 px-2 py-1 border-b border-zinc-200 dark:border-zinc-700">
                            <div className="font-semibold">받는사람</div>
                            <div className="font-semibold">전화번호</div>
                            <div className="font-semibold">주소</div>
                            <div className="font-semibold">상품명</div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] px-2 py-1">
                            <div>이민수</div>
                            <div>010-5555-6666</div>
                            <div>대전시 유성구...</div>
                            <div>노트북</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>주문 파일.xlsx</span>
                      </div>
                    </motion.div>

                    {/* 오른쪽: 업로드 영역 (절대 위치 오버레이 제거 → 높이 붕괴 방지) */}
                    <motion.div
                      initial={{ opacity: 0, x: 20, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="w-full md:flex-1 md:min-w-0 min-h-0 h-full bg-white dark:bg-zinc-800 rounded-xl border-2 border-blue-500 shadow-lg p-4 md:p-5 flex flex-col gap-3"
                    >
                      <motion.div
                        initial={{ x: -24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="shrink-0 flex justify-center"
                      >
                        <motion.div
                          animate={{
                            scale: [1, 1.06, 1],
                            rotate: [0, 4, -4, 0],
                          }}
                          transition={{
                            duration: 0.7,
                            ease: "easeInOut",
                            repeat: Infinity,
                            repeatDelay: 0.4,
                          }}
                          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-3 border-2 border-blue-300 dark:border-blue-700"
                        >
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-7 h-7 text-blue-600 dark:text-blue-400 shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                주문 파일.xlsx
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                업로드 중...
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                      <div className="flex-1 min-h-[9rem] flex flex-col">
                        <motion.div
                          animate={{
                            borderColor: ['rgb(59, 130, 246)', 'rgb(37, 99, 235)', 'rgb(59, 130, 246)'],
                          }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                          className="flex-1 min-h-[9rem] rounded-lg border-2 border-dashed border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 flex flex-col items-center justify-center py-8 px-4"
                        >
                          <Upload className="w-9 h-9 mb-2 text-blue-600 dark:text-blue-400" />
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                            파일 업로드 중...
                          </p>
                        </motion.div>
                      </div>
                    </motion.div>
                  </>
                )}

              </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

          {/* 텍스트 입력 단계 (기존 - 하위 호환) */}
          {currentStep === 'text-input' && (
            <motion.div
              key="text-input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-2xl"
            >
              <motion.div
                animate={{
                  scale: [1, 1.05, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-600 flex items-center justify-center shadow-lg"
              >
                <MessageSquare className="w-10 h-10 text-white" />
              </motion.div>
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 text-center">
                텍스트 주문 입력
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-center">
                카카오톡, 문자 등으로 받은 주문을 붙여넣기
              </p>
              
              <div className="flex flex-col md:flex-row gap-4 items-start">
                {/* 텍스트 입력 영역 */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white dark:bg-zinc-800 rounded-xl border-2 border-amber-500 shadow-lg p-6 relative flex-1"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600"></div>
                    <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600"></div>
                  </div>
                  
                  <motion.textarea
                    readOnly
                    value={pastedText}
                    initial={{ opacity: 0.5 }}
                    animate={{ 
                      opacity: pastedText ? 1 : 0.5,
                      scale: pastedText ? [0.98, 1] : 1
                    }}
                    transition={{ 
                      opacity: { duration: 0.3, delay: pastedText ? 0.1 : 0 },
                      scale: { duration: 0.2, delay: pastedText ? 0.1 : 0 }
                    }}
                    className="w-full h-48 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 text-sm text-zinc-900 dark:text-zinc-100 font-mono resize-none focus:outline-none transition-all"
                    placeholder="주문 내용을 붙여넣으세요..."
                  />
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: pastedText ? 1 : 0, y: pastedText ? 0 : 10 }}
                    transition={{ delay: pastedText ? 0.5 : 0 }}
                    className="mt-4 flex justify-end"
                  >
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      변환하기
                    </motion.button>
                  </motion.div>
                </motion.div>

                {/* 우클릭 컨텍스트 메뉴 (오른쪽에 배치) */}
                {showContextMenu && (
                  <motion.div
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] z-20"
                  >
                    <button
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between ${
                        showPasteHighlight ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <span>실행 취소</span>
                      <span className="text-xs text-zinc-400">Ctrl+Z</span>
                    </button>
                    <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1"></div>
                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between text-zinc-700 dark:text-zinc-300"
                    >
                      <span>복사</span>
                      <span className="text-xs text-zinc-400">Ctrl+C</span>
                    </button>
                    <motion.button
                      className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                        showPasteHighlight 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                      animate={showPasteHighlight ? {
                        backgroundColor: ['rgba(59, 130, 246, 0.1)', 'rgba(59, 130, 246, 0.2)', 'rgba(59, 130, 246, 0.1)'],
                      } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      <span>붙여넣기</span>
                      <span className="text-xs text-zinc-400">Ctrl+V</span>
                    </motion.button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 텍스트 처리 중 단계 - 통합 화면에 포함되므로 별도 렌더링 제거 */}

          {/* 업로드 단계 */}
          {currentStep === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="text-center w-full"
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg"
              >
                <Upload className="w-12 h-12 text-white" />
              </motion.div>
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                파일 업로드
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                엑셀 파일을 드래그 앤 드롭하거나 클릭하여 업로드
              </p>
              <motion.div
                animate={{
                  borderColor: ['rgb(59, 130, 246)', 'rgb(147, 51, 234)', 'rgb(59, 130, 246)'],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="mx-auto w-64 h-32 rounded-xl border-2 border-dashed border-blue-500 bg-white/50 dark:bg-zinc-800/50 flex items-center justify-center"
              >
                <div className="text-center">
                  <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">주문 파일.xlsx</p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* 처리 중 단계 */}
          {currentStep === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.5 }}
              className="text-center w-full"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear"
                }}
                className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg"
              >
                <Loader2 className="w-12 h-12 text-white" />
              </motion.div>
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                데이터 처리 중
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                AI가 주문 정보를 분석하고 정제하는 중...
              </p>
              <div className="flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeInOut"
                    }}
                    className="w-3 h-3 rounded-full bg-blue-600"
                  />
                ))}
              </div>
            </motion.div>
          )}


      </div>

      {/* 진행 표시기: 라벨과 점 사이 여백으로 겹침 방지 */}
      <div className="absolute bottom-2 sm:bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 w-full max-w-[min(100%,28rem)] px-3 pointer-events-none">
        <p
          key={currentStep}
          className="text-[10px] sm:text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 text-center leading-snug line-clamp-2 w-full"
        >
          {unifiedStepCaption(currentStep)}
        </p>
        <div className="flex gap-2 items-center justify-center flex-wrap pointer-events-auto">
          {(() => {
            const stepsToShow: DemoStep[] = unifiedFlow;

            return stepsToShow.map((step) => (
              <motion.div
                key={step}
                className={`h-2.5 rounded-full ${
                  currentStep === step
                    ? 'bg-emerald-600 dark:bg-emerald-500 w-9'
                    : 'bg-zinc-300 dark:bg-zinc-600 w-2.5'
                }`}
                animate={{
                  width: currentStep === step ? 36 : 10,
                }}
                transition={{ duration: 0.3 }}
              />
            ));
          })()}
        </div>
      </div>
    </div>
  );
}
