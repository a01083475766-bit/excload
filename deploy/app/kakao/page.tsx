'use client';

import { FileSpreadsheet, Truck, Search, ArrowDown, X, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useUploadedFilesStore } from '@/app/lib/stores/uploadedFilesStore';
import { useHistoryStore } from '@/app/store/historyStore';
import { getCourierMapper } from '@/app/lib/courier-mappers';
import type { NormalizationResult } from '@/app/lib/refinement-engine/hint-engine/e-prime-ai';
import type { CJRow } from '@/app/lib/courier-mappers';

interface SenderInfo {
  name: string;
  phone: string;
  address: string;
}

interface CourierUploadHeader {
  name: string;
  index: number;
  isEmpty: boolean;
  isFixed?: boolean; // 고정 컬럼 여부
  fixedType?: 'sender_name' | 'sender_phone' | 'sender_address'; // 고정 타입
}

interface CourierUploadTemplate {
  courierType: string | null;
  headers: CourierUploadHeader[];
  requiresSender?: boolean; // 보내는사람 정보가 필요한지 여부
}

export default function ExcelPage() {
  const [kakaoOrderText, setKakaoOrderText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [senderInfo, setSenderInfo] = useState<SenderInfo | null>(null);
  const [tempSenderInfo, setTempSenderInfo] = useState<SenderInfo>({
    name: '',
    phone: '',
    address: '',
  });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isCourierModalOpen, setIsCourierModalOpen] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [tempSelectedCourier, setTempSelectedCourier] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  // 변환된 엑셀 데이터: 첫 번째 행은 헤더, 나머지는 데이터 행
  const [excelData, setExcelData] = useState<string[][]>([]);
  // 택배사 업로드 파일 템플릿 (헤더 정보 저장)
  const [courierUploadTemplate, setCourierUploadTemplate] = useState<CourierUploadTemplate | null>(null);
  // 선택된 파일 목록 - Zustand 스토어 사용 (kakao만 사용)
  const { files, metadata, addFiles, removeFile, loadMetadata } = useUploadedFilesStore();
  // 실제 파일이 있으면 사용하고, 없으면 메타데이터 사용 (새로고침 후 복원용)
  const selectedFiles = files.kakao.length > 0 ? files.kakao : 
    metadata.kakao.map(m => new File([], m.name, { type: m.type, lastModified: m.lastModified }));
  const { addSession } = useHistoryStore();

  // localStorage에서 택배 양식 정보(courierUploadTemplate) 로드
  const loadCourierUploadTemplate = (): CourierUploadTemplate | null => {
    try {
      const stored = localStorage.getItem('onc_courier_template_v1');
      if (stored) {
        const parsed = JSON.parse(stored) as CourierUploadTemplate;
        return parsed;
      }
    } catch (error) {
      console.error('localStorage에서 택배 양식 정보를 불러오는 중 오류 발생:', error);
      // 로드 실패는 조용히 처리 (템플릿이 없으면 새로 설정하면 되므로)
    }
    return null;
  };

  // 페이지 최초 로드 및 전환 시 localStorage에서 보내는사람 정보, 택배사 정보, 파일 메타데이터 복원
  useEffect(() => {
    // 파일 메타데이터 로드
    loadMetadata();
    
    // localStorage에서 보내는사람 정보 로드
    try {
      const savedSenderInfo = localStorage.getItem('senderInfo');
      if (savedSenderInfo) {
        try {
          const parsedInfo = JSON.parse(savedSenderInfo) as SenderInfo;
          setSenderInfo(parsedInfo);
        } catch (error) {
          console.error('localStorage에서 보내는사람 정보를 불러오는 중 오류 발생:', error);
          alert('보내는사람 정보를 불러오는 중 오류가 발생했습니다.');
        }
      } else {
        setSenderInfo(null);
      }
    } catch (error) {
      console.error('localStorage 접근 중 오류 발생 (보내는사람 정보):', error);
      alert('저장된 보내는사람 정보를 불러올 수 없습니다. 브라우저의 저장 공간을 확인해주세요.');
    }

    // localStorage에서 택배사 정보 로드
    try {
      const savedCourier = localStorage.getItem('selectedCourier');
      if (savedCourier) {
        try {
          setSelectedCourier(savedCourier);
        } catch (error) {
          console.error('localStorage에서 택배사 정보를 불러오는 중 오류 발생:', error);
          alert('택배사 정보를 불러오는 중 오류가 발생했습니다.');
        }
      } else {
        setSelectedCourier(null);
      }
    } catch (error) {
      console.error('localStorage 접근 중 오류 발생 (택배사 정보):', error);
      alert('저장된 택배사 정보를 불러올 수 없습니다. 브라우저의 저장 공간을 확인해주세요.');
    }

    // localStorage에서 택배 양식 정보 로드
    const loadedTemplate = loadCourierUploadTemplate();
    setCourierUploadTemplate(loadedTemplate);
  }, [loadMetadata]);


  const handleOpenModal = () => {
    // 이미 입력된 정보가 있으면 임시 상태에 복사
    if (senderInfo) {
      setTempSenderInfo(senderInfo);
    } else {
      setTempSenderInfo({ name: '', phone: '', address: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleConfirmModal = () => {
    setSenderInfo(tempSenderInfo);
    // localStorage에 저장
    try {
      localStorage.setItem('senderInfo', JSON.stringify(tempSenderInfo));
      setIsModalOpen(false);
      setShowSuccessMessage(true);
      // 3초 후 안내 문구 숨기기
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
    } catch (error) {
      console.error('localStorage에 보내는사람 정보를 저장하는 중 오류 발생:', error);
      alert('보내는사람 정보를 저장하는 중 오류가 발생했습니다. 브라우저의 저장 공간을 확인해주세요.');
    }
  };

  const handleInputChange = (field: keyof SenderInfo, value: string) => {
    setTempSenderInfo((prev) => ({ ...prev, [field]: value }));
  };

  const handleOpenCourierModal = () => {
    setTempSelectedCourier(selectedCourier);
    setIsCourierModalOpen(true);
  };

  const handleCloseCourierModal = () => {
    setIsCourierModalOpen(false);
  };

  const handleConfirmCourierModal = () => {
    setSelectedCourier(tempSelectedCourier);
    // localStorage에 저장
    try {
      if (tempSelectedCourier) {
        localStorage.setItem('selectedCourier', tempSelectedCourier);
      }
      setIsCourierModalOpen(false);
    } catch (error) {
      console.error('localStorage에 택배사 정보를 저장하는 중 오류 발생:', error);
      alert('택배사 정보를 저장하는 중 오류가 발생했습니다. 브라우저의 저장 공간을 확인해주세요.');
    }
  };

  const handleOpenPreviewModal = () => {
    // 현재 세션 정보를 historyStore에 저장
    const fileMetadata = selectedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    }));

    addSession({
      sourceType: 'kakao',
      files: fileMetadata,
      senderInfo: senderInfo,
      courier: selectedCourier,
    });

    setIsPreviewModalOpen(true);
  };

  const handleClosePreviewModal = () => {
    setIsPreviewModalOpen(false);
  };

  /**
   * excelData의 헤더에서 컬럼 인덱스를 찾는 함수
   */
  const findColumnIndex = (headerRow: string[], columnNames: string[]): number | null => {
    for (const name of columnNames) {
      const index = headerRow.findIndex((h) => 
        h && h.toLowerCase().includes(name.toLowerCase())
      );
      if (index !== -1) return index;
    }
    return null;
  };

  /**
   * excelData (string[][])를 NormalizationResult[]로 변환하는 함수
   */
  const convertExcelDataToNormalizedBatch = (data: string[][]): NormalizationResult[] => {
    if (data.length < 2) return []; // 헤더와 최소 1개 행 필요

    const headerRow = data[0];
    const dataRows = data.slice(1);

    // 헤더에서 각 컬럼의 인덱스 찾기
    const nameIndex = findColumnIndex(headerRow, ['이름', '받는사람', '받는사람명', 'name', '수신자']);
    const phoneIndex = findColumnIndex(headerRow, ['전화', '전화번호', '받는사람전화', 'phone', '연락처']);
    const addressIndex = findColumnIndex(headerRow, ['주소', '받는사람주소', 'address', '배송지']);
    const productIndex = findColumnIndex(headerRow, ['상품', '상품명', 'product', '품목']);
    const quantityIndex = findColumnIndex(headerRow, ['수량', 'quantity', '개수']);
    const requestIndex = findColumnIndex(headerRow, ['배송메시지', '요청사항', 'request', '메시지', '배송요청']);

    // 데이터 행을 NormalizationResult로 변환
    return dataRows.map((row) => {
      const result: NormalizationResult = {
        status: 'OK',
      };

      if (nameIndex !== null && row[nameIndex]) {
        result.name = row[nameIndex].trim();
      }
      if (phoneIndex !== null && row[phoneIndex]) {
        result.phone = row[phoneIndex].trim();
      }
      if (addressIndex !== null && row[addressIndex]) {
        result.address = row[addressIndex].trim();
      }
      // product is now optional in NormalizationResult, safe to assign
      if (productIndex !== null && row[productIndex]) {
        result.product = row[productIndex].trim();
      }
      if (quantityIndex !== null && row[quantityIndex]) {
        const quantityStr = row[quantityIndex].trim();
        const quantityNum = parseInt(quantityStr, 10);
        result.quantity = isNaN(quantityNum) ? null : quantityNum;
      }
      if (requestIndex !== null && row[requestIndex]) {
        result.request = row[requestIndex].trim();
      }

      return result;
    });
  };

  // textarea 값 변경 처리
  const handleKakaoOrderTextChange = (text: string) => {
    setKakaoOrderText(text);
  };

  // 붙여넣기 이벤트 처리: 파일 생성 및 스토어에 추가
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // 클립보드에서 붙여넣은 텍스트 가져오기
    const pastedText = e.clipboardData.getData('text');
    
    if (pastedText.trim()) {
      const timestamp = Date.now();
      const fileName = `kakao-order-${timestamp}.txt`;
      const blob = new Blob([pastedText], { type: 'text/plain' });
      
      // Blob을 File 객체로 변환
      const file = new File([blob], fileName, { type: 'text/plain' });
      
      // 스토어에 추가 (중복 체크는 스토어 내부에서 처리)
      addFiles('kakao', [file]);
      
      // 파일 생성 후 textarea 값 즉시 초기화
      setKakaoOrderText('');
      
      // 기본 붙여넣기 동작 방지 (textarea에 텍스트가 추가되지 않도록)
      e.preventDefault();
    }
  };

  // 드롭존에서 파일 제거
  const handleRemoveFile = (index: number) => {
    removeFile('kakao', index);
  };

  const handleDownloadUploadFile = () => {
    // 택배 업로드 양식 등록 여부 확인
    if (!courierUploadTemplate || !Array.isArray(courierUploadTemplate.headers) || courierUploadTemplate.headers.length === 0) {
      alert('내 업로드 파일 등록하기');
      return;
    }

    // 엑셀 데이터 확인
    if (!excelData || excelData.length === 0) {
      alert('다운로드할 데이터가 없습니다. 먼저 엑셀 파일을 업로드하고 미리보기를 확인해주세요.');
      return;
    }

    // 현재 세션 정보를 historyStore에 저장하기 위한 원본 파일 정보
    const fileMetadata = selectedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    }));

    try {
      let fileName: string;
      
      // CJ 택배사인 경우 특별 처리
      if (courierUploadTemplate?.courierType === 'CJ') {
        // excelData를 NormalizationResult[]로 변환
        const normalizedBatch = convertExcelDataToNormalizedBatch(excelData);
        
        if (normalizedBatch.length === 0) {
          alert('변환할 데이터가 없습니다.');
          return;
        }

        // 렌더(엑셀 생성) 단계 직전 result.products 상태 로깅
        const emptyProductsCount = normalizedBatch.filter(row => !row.products || row.products.length === 0).length;
        console.log('[ONC][PRODUCTS_STATE][RENDER_PHASE_BEFORE_CJ]', {
          totalRows: normalizedBatch.length,
          emptyProductsCount,
          sampleEmptyRows: normalizedBatch
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => !row.products || row.products.length === 0)
            .slice(0, 5),
        });

        // getCourierMapper로 mapCJ 함수 가져오기
        const mapCJ = getCourierMapper('CJ');
        
        // CJRow[] 생성
        const cjRows: CJRow[] = mapCJ(normalizedBatch);

        // 워크북 생성
        const wb = XLSX.utils.book_new();
        
        // CJ 헤더 추가
        const cjHeader: CJRow = ['받는사람명', '받는사람전화', '받는사람주소', '상품명', '수량', '배송메시지'];
        const cjDataWithHeader = [cjHeader, ...cjRows];
        
        // 워크시트로 변환
        const ws = XLSX.utils.aoa_to_sheet(cjDataWithHeader);
        
        // 워크시트를 워크북에 추가
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        
        // 파일명 생성: 주문정리_CJ_YYYYMMDD.xlsx
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        fileName = `주문정리_CJ_${year}${month}${day}.xlsx`;
        
        // 엑셀 파일 다운로드
        XLSX.writeFile(wb, fileName);
      } else {
        // 다른 택배사인 경우: courierUploadTemplate.headers를 사용하여 원본 헤더 순서 유지
        // 중요: 원본 엑셀의 header row를 그대로, 순서 변경 없이 사용
        const reconstructedExcelData: string[][] = [];
        
        // 원본 헤더를 그대로 사용 (courierUploadTemplate.headers는 원본 업로드 엑셀의 헤더 순서와 이름을 그대로 보존)
        const originalHeaders = courierUploadTemplate.headers;
        const outputHeaders = originalHeaders.map(header => header.name);
        reconstructedExcelData.push(outputHeaders);
        
        // excelData의 헤더와 데이터 추출
        const excelDataHeaders = excelData[0] || [];
        const excelDataRows = excelData.slice(1);
        
        // excelData의 헤더명 -> 인덱스 매핑 생성
        const excelHeaderIndexMap = new Map<string, number>();
        excelDataHeaders.forEach((header, index) => {
          if (header && header.trim()) {
            excelHeaderIndexMap.set(header.trim(), index);
          }
        });
        
        // 각 데이터 행을 원본 헤더 순서에 맞게 재구성
        excelDataRows.forEach((excelRow) => {
          const row = originalHeaders.map(templateHeader => {
            // isEmpty인 경우 빈 문자열 반환
            if (templateHeader.isEmpty === true) {
              return '';
            }
            
            const templateHeaderName = templateHeader.name.trim();
            
            // excelData에서 해당 헤더명의 인덱스 찾기
            const excelIndex = excelHeaderIndexMap.get(templateHeaderName);
            if (excelIndex !== undefined && excelRow[excelIndex] !== undefined) {
              return String(excelRow[excelIndex]);
            }
            
            return '';
          });
          reconstructedExcelData.push(row);
        });
        
        // 워크북 생성
        const wb = XLSX.utils.book_new();
        
        // 재구성된 excelData를 워크시트로 변환 (첫 번째 행은 헤더, 나머지는 데이터)
        const ws = XLSX.utils.aoa_to_sheet(reconstructedExcelData);
        
        // 워크시트를 워크북에 추가
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        
        // 파일명 생성: 주문정리_택배사명_YYYYMMDD.xlsx
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const courierName = courierUploadTemplate?.courierType || '택배사';
        fileName = `주문정리_${courierName}_${year}${month}${day}.xlsx`;
        
        // 엑셀 파일 다운로드
        XLSX.writeFile(wb, fileName);
      }
      
      // 다운로드 완료 후 히스토리에 기록
      addSession({
        sourceType: 'kakao',
        files: fileMetadata,
        senderInfo: senderInfo,
        courier: courierUploadTemplate?.courierType || null,
        downloadedFileName: fileName,
      });
    } catch (error) {
      console.error('엑셀 파일 생성 오류:', error);
      alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
  };

  const courierOptions = [
    '우체국택배',
    'CJ대한통운',
    '로젠택배',
    '롯데택배',
    '한진택배',
    '경동택배',
    '대신택배',
    '일양로지스',
    '합동택배',
    '천일택배',
  ];

  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black">
      <main className="max-w-5xl mx-auto px-6">
        {/* Hero 섹션 - 세로 흐름 구조 */}
        <section className="pt-7 pb-[0.875rem]">
          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 서비스 설명 텍스트 영역 */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Excel Order Conversion
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                엑셀 주문을 자동으로 변환합니다
              </h1>
              <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                복잡한 엑셀 파일의 주문 정보를 AI가 자동으로 읽고 구조화된 데이터로 변환합니다.
                <br />
                수작업 없이 정확한 주문 데이터를 바로 확인하세요.
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
        <section className="pt-2 pb-8 lg:pt-3 lg:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 lg:gap-3">
            {/* 카드 1 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-pointer transition-colors"
              onClick={handleOpenModal}
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <FileSpreadsheet className="w-5 h-5 text-gray-500" />
                </div>
                {senderInfo?.name ? (
                  <h3 className="text-sm font-semibold text-gray-900 whitespace-pre-line">
                    보내는사람{'\n'}{senderInfo.name}
                  </h3>
                ) : (
                  <h3 className="text-sm font-semibold text-gray-900 whitespace-pre-line">
                    보내는사람{'\n'}정보 입력
                  </h3>
                )}
              </div>
              {showSuccessMessage && (
                <p className="text-xs text-gray-500 mt-1">
                  보내는사람 정보가 정상적으로 입력되었습니다.
                </p>
              )}
            </div>

            {/* 카드 2 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-pointer transition-colors"
              onClick={handleOpenCourierModal}
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Truck className="w-5 h-5 text-gray-500" />
                </div>
                {selectedCourier ? (
                  <h3 className="text-sm font-semibold text-gray-900 whitespace-pre-line">
                    택배사{'\n'}{selectedCourier}
                  </h3>
                ) : (
                  <h3 className="text-sm font-semibold text-gray-900 whitespace-pre-line">
                    택배사{'\n'}선택
                  </h3>
                )}
              </div>
            </div>

            {/* 카드 3 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-pointer transition-colors"
              onClick={handleOpenPreviewModal}
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Search className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 whitespace-pre-line">
                  미리보기{'\n'}확인하기
                </h3>
              </div>
            </div>

            {/* 카드 4 */}
            <div 
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center cursor-pointer transition-colors"
              onClick={handleDownloadUploadFile}
            >
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <ArrowDown className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 whitespace-pre-line">
                  택배사 업로드용{'\n'}파일 다운받기
                </h3>
              </div>
            </div>
          </div>
        </section>

        {/* CTA 섹션 - 최상단 */}
        <section className="pt-3 pb-6 lg:pt-4 lg:pb-8">
          <div className="flex flex-col items-center text-center gap-4">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100">
              지금 바로 엑셀 주문 변환을 시작하세요
            </h2>
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400">
              엑셀 주문을 몇 초 만에 변환해보세요
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mt-2">
              <button className="px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                무료로 시작하기
              </button>
              <button className="bg-white border border-gray-300 text-gray-900 h-11 rounded-lg font-medium">
                데모 보기
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* 모달 */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                보내는사람 정보 입력
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 입력 필드 */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  이름
                </label>
                <input
                  type="text"
                  value={tempSenderInfo.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  placeholder="이름을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  전화번호
                </label>
                <input
                  type="text"
                  value={tempSenderInfo.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  placeholder="전화번호를 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  주소
                </label>
                <textarea
                  value={tempSenderInfo.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                  placeholder="주소를 입력하세요"
                  rows={3}
                />
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={handleCloseModal}
                className="flex-1 bg-white border border-gray-300 text-gray-900 h-11 rounded-lg font-medium"
              >
                취소
              </button>
              <button
                onClick={handleConfirmModal}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-lg font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 택배사 선택 모달 */}
      {isCourierModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseCourierModal}
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                택배사 선택
              </h2>
              <button
                onClick={handleCloseCourierModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 택배사 목록 */}
            <div className="space-y-2 mb-6">
              {courierOptions.map((courier, index) => (
                <button
                  key={`${courier}-${index}`}
                  onClick={() => setTempSelectedCourier(courier)}
                  className={`w-full px-4 py-3 rounded-lg border text-left transition-colors ${
                    tempSelectedCourier === courier
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                      : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  {courier}
                </button>
              ))}
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={handleCloseCourierModal}
                className="flex-1 bg-white border border-gray-300 text-gray-900 h-11 rounded-lg font-medium"
              >
                취소
              </button>
              <button
                onClick={handleConfirmCourierModal}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-lg font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 미리보기 모달 */}
      {isPreviewModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleClosePreviewModal}
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                엑셀 미리보기
              </h2>
              <button
                onClick={handleClosePreviewModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-hidden flex flex-col p-6">
              {excelData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-zinc-600 dark:text-zinc-400 text-base">
                    아직 변환된 데이터가 없습니다.
                  </p>
                </div>
              ) : (
                <div className="overflow-auto flex-1 border border-zinc-200 dark:border-zinc-800 rounded-lg min-h-0">
                  <table className="w-full border-collapse">
                    <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0 z-10">
                      {excelData.length > 0 && (
                        <tr>
                          {excelData[0].map((header, index) => (
                            <th
                              key={`${header ?? 'header'}-${index}`}
                              className="px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                            >
                              {header || `컬럼 ${index + 1}`}
                            </th>
                          ))}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {excelData.slice(1).map((row, rowIndex) => (
                        <tr
                          key={`row-${rowIndex}`}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          {row.map((cell, cellIndex) => (
                            <td
                              key={`cell-${rowIndex}-${cellIndex}`}
                              className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800"
                            >
                              {cell || ''}
                            </td>
                          ))}
                          {/* 헤더보다 적은 컬럼 수인 경우 빈 셀 추가 */}
                          {row.length < excelData[0].length &&
                            Array.from({ length: excelData[0].length - row.length }).map((_, index) => (
                              <td
                                key={`empty-${rowIndex}-${index}`}
                                className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800"
                              >
                                {' '}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 모달 하단 버튼 */}
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={handleClosePreviewModal}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-lg font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
