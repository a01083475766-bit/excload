'use client';

import { useState, useRef, useEffect } from 'react';
import { FileSpreadsheet, Truck, Search, ArrowDown, X, FileText } from 'lucide-react';
import { useUploadedFilesStore } from '@/app/lib/stores/uploadedFilesStore';

export default function MessageOrderPage() {
  const [kakaoOrderText, setKakaoOrderText] = useState('');
  // 모달 상태 관리
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalText, setModalText] = useState('');
  // 선택된 파일 목록 - Zustand 스토어 사용 (kakao만 사용)
  const { files, metadata, addFiles, removeFile, loadMetadata } = useUploadedFilesStore();
  // 실제 파일이 있으면 사용하고, 없으면 메타데이터 사용 (새로고침 후 복원용)
  const selectedFiles = files.kakao.length > 0 ? files.kakao : 
    metadata.kakao.map(m => new File([], m.name, { type: m.type, lastModified: m.lastModified }));

  // 페이지 최초 로드 및 전환 시 파일 메타데이터 복원
  useEffect(() => {
    // 파일 메타데이터 로드
    loadMetadata();
  }, [loadMetadata]);

  // textarea 값 변경 처리
  const handleKakaoOrderTextChange = (text: string) => {
    setKakaoOrderText(text);
  };

  // 붙여넣기 이벤트 처리: 모달 열기
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // 클립보드에서 붙여넣은 텍스트 가져오기
    const pastedText = e.clipboardData.getData('text');
    
    if (pastedText.trim()) {
      // 모달에 텍스트 설정하고 모달 열기
      setModalText(pastedText);
      setIsModalOpen(true);
      
      // 기본 붙여넣기 동작 방지 (textarea에 텍스트가 추가되지 않도록)
      e.preventDefault();
    }
  };

  // 드롭존에서 파일 제거
  const handleRemoveFile = (index: number) => {
    removeFile('kakao', index);
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalText('');
  };

  // 변환 파일로 변환하기 버튼 클릭: 텍스트를 파일로 생성하고 스토어에 추가
  const handleConvertToFile = () => {
    // textarea에 있는 텍스트 사용
    const textToConvert = modalText.trim();
    
    if (!textToConvert) {
      return; // 빈 텍스트면 파일 생성하지 않음
    }
    
    // 텍스트로 txt 파일 생성
    const now = new Date();
    const Y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, '0');
    const D = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const fileName = `message-order-${Y}${M}${D}-${h}${m}${s}.txt`;
    const blob = new Blob([textToConvert], { type: 'text/plain' });
    
    // Blob을 File 객체로 변환
    const file = new File([blob], fileName, { type: 'text/plain' });
    
    // 스토어에 추가 (중복 체크는 스토어 내부에서 처리)
    addFiles('kakao', [file]);
    
    // 파일 생성 후 모달 닫기
    setIsModalOpen(false);
    setModalText('');
  };

  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black">
      <main className="max-w-[1200px] mx-auto px-8">
        {/* Hero 섹션 - 세로 흐름 구조 */}
        <section className="py-6">
          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 서비스 설명 텍스트 영역 */}
            <div className="flex flex-col gap-2 text-left">
              <h1 className="text-lg font-semibold text-gray-900">
                메시지 주문을 자동으로 변환합니다
              </h1>
              <p className="text-sm text-gray-500 leading-tight">
                메시지로 받은 주문 내용을 복사 후 붙여넣기로
                <br />
                택배 발송용 주문 데이터로 자동 변환합니다.
              </p>
            </div>

            {/* 드롭존 제목 및 설명 */}
            <div className="flex flex-col gap-1 mb-3">
              <h2 className="text-sm font-medium text-gray-900">
                텍스트 주문 입력
              </h2>
              <p className="text-xs text-gray-500">
                지원 형식: 복사한 텍스트를 붙여넣기
              </p>
            </div>

            {/* 카카오톡 주문 내용 입력 영역 - Dropzone */}
            <div className="w-full h-[192px] bg-gray-200 border border-gray-300 rounded-xl p-6 transition-colors overflow-y-auto">
              {selectedFiles.length === 0 ? (
                <textarea
                  value={kakaoOrderText}
                  onChange={(e) => handleKakaoOrderTextChange(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="카카오톡 주문 내용을 여기에 붙여넣어 주세요"
                  className="w-full h-full text-base text-gray-600 focus:outline-none resize-none bg-transparent"
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    {selectedFiles.slice(0, 3).map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="w-5 h-5 text-zinc-500 dark:text-zinc-500 flex-shrink-0" />
                          <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                            {file.name}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveFile(index)}
                          className="ml-2 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
                          aria-label="파일 제거"
                        >
                          <X className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {selectedFiles.length > 3 && (
                    <div className="flex items-center p-2">
                      <span className="text-sm text-gray-600">
                        + 외 {selectedFiles.length - 3}개
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 기능 설명 섹션 */}
        <section className="pt-10 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 lg:gap-3">
            {/* 카드 1 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-pointer transition-colors"
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Truck className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  택배 양식 등록하기
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                택배사 업로드용 파일 양식을 등록합니다
              </p>
            </div>

            {/* 카드 2 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-pointer transition-colors"
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Search className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  고정입력 등록하기
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                보내는 분 전화·주소 등을 입력합니다
              </p>
            </div>

            {/* 카드 3 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-pointer transition-colors"
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Search className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  미리보기 확인하기
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                변환된 데이터를 미리 확인하고 검증합니다
              </p>
            </div>

            {/* 카드 4 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-not-allowed transition-colors"
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2 opacity-50">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <ArrowDown className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  택배업로드용 다운받기
                </h3>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-600 font-semibold mt-1">
                이 페이지에서는 실제 다운로드 기능이 제공되지 않습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 시스템 안내 섹션 */}
        <section className="pt-10 pb-6">
          <div className="flex flex-col items-center text-center gap-2">
            <p className="text-sm text-gray-400 mt-6">
              카톡, 메시지, 텍스트 주문 데이터를 변환할 수 있습니다.
            </p>
          </div>
        </section>
      </main>

      {/* 텍스트 수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-2xl mx-4 flex flex-col gap-4">
            {/* 상단 안내 문구 */}
            <p className="text-base font-medium text-gray-900 dark:text-gray-100">
              주요 정보만 남기면 더 높은 정확도로 변환됩니다.
              <br />
              이 기능은 주문 1건 기준으로 변환됩니다.
            </p>

            {/* 중앙 textarea */}
            <textarea
              value={modalText}
              onChange={(e) => setModalText(e.target.value)}
              className="w-full h-64 p-4 border border-gray-300 dark:border-zinc-600 rounded-lg resize-none text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="텍스트를 수정해주세요"
            />

            {/* 하단 설명 */}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              받는 분의 이름, 전화번호, 주소, 상품 정보 위주로 남겨주세요.
            </p>

            {/* 하단 버튼 */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-zinc-700 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleConvertToFile}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                변환 파일로 변환하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
