/**
 * ⚠️ EXCLOAD CONSTITUTION v4.0 적용 파일
 * 송장파일변환 (/invoice-file-convert) — order-convert/page.tsx 복제 기반
 * 입력: 주문 엑셀 + 택배 송장 엑셀 → 기준헤더 조인 후 쇼핑몰 송장 양식으로 Stage3
 * localStorage 키는 주문변환과 분리(invoiceFileConvert_*)
 * 모든 수정 전 CONSTITUTION.md 필독
 * 3단계 분리 파이프라인 유지 필수
 * 기준헤더 내부 전용, UI 노출 금지
 */

'use client';

import { useEffect, useRef, useState, useMemo, useCallback, type UIEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Search, ArrowDown, X, Check, Upload } from 'lucide-react';
import { runTemplatePipeline } from '@/app/pipeline/template/template-pipeline';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { ExcelPreprocessPipeline } from '@/app/pipeline/preprocess/excel-preprocess-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';
import { runMergePipeline } from '@/app/pipeline/merge/merge-pipeline';
import type { PreviewRow } from '@/app/pipeline/merge/types';
import type { OrderStandardFile } from '@/app/pipeline/order/order-pipeline';
import { fetchOrderPipelineStage2 } from '@/app/lib/fetch-order-pipeline-stage2';
import * as XLSX from 'xlsx';
import {
  alignRowsFromHeader,
  detectHeaderRowIndex,
  filterNonEmptyRows,
  readFirstSheetMatrixFromArrayBuffer,
} from '@/app/lib/excel/sheet-header';
import { formatPhoneDisplay } from '@/app/utils/format-phone';
import { useWorkerSortedRows } from '@/app/hooks/useWorkerSortedRows';
import { useHistoryStore } from '@/app/store/historyStore';
import type { SourceType, FileMetadata, SenderInfo } from '@/app/store/historyStore';
import { useUserStore } from '@/app/store/userStore';
import { Coins } from 'lucide-react';
type PreviewRowWithId = {
  rowId: string;
  data: PreviewRow;
};

interface CourierUploadHeader {
  name: string;
  index: number;
  isEmpty: boolean;
  isFixed?: boolean;
  fixedType?: 'sender_name' | 'sender_phone' | 'sender_address';
}

interface CourierUploadTemplate {
  courierType: string | null;
  headers: CourierUploadHeader[];
  requiresSender?: boolean;
}

interface RecentExcelFormat {
  id: string;
  createdAt: string;
  columnOrder: string[];
  displayName?: string;
  bridgeFile?: TemplateBridgeFile;
}

const isSenderColumn = (headerName: string): boolean => {
  const normalized = headerName.toLowerCase().trim();
  const senderKeywords = ['보내는사람', '송화인', '발송인', '출고자'];
  return senderKeywords.some((keyword) => normalized.includes(keyword));
};

function isDummyTemplateCell(cellValue: string | undefined): boolean {
  if (!cellValue || cellValue.trim() === '') {
    return false; // 빈 값은 더미가 아님
  }
  
  const value = cellValue.trim();
  const lowerValue = value.toLowerCase();
  
  // 문구 안내 패턴
  const examplePatterns = [
    /^예시[:\s]/i,           // "예시:", "예시 "
    /^예[:\s]/i,              // "예:", "예 "
    /^예\s*[:\-]/i,           // "예:", "예-"
    /^sample[:\s]/i,          // "Sample:", "Sample "
    /^example[:\s]/i,         // "Example:", "Example "
    /^\(예시\)/i,             // "(예시)"
    /^\(예\)/i,               // "(예)"
    /예시로\s/i,              // "예시로 "
    /예를\s*들면/i,           // "예를 들면"
  ];
  
  // 형식 예시 패턴
  const formatPatterns = [
    /^[0-9]{4}[-\/][0-9]{2}[-\/][0-9]{2}$/,  // YYYY-MM-DD, YYYY/MM/DD
    /^[0-9]{2,3}[-\s]?[0-9]{3,4}[-\s]?[0-9]{4}$/,  // 전화번호 형식 (010-1234-5678, 010 1234 5678)
    /^[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}$/,      // 전화번호 형식 (010-0000-0000)
    /^[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}$/,            // 전화번호 형식 (하이픈 포함)
    /^[가-힣]{2,4}시\s*[가-힣]{2,4}구/i,            // 주소 형식 예시
    /^[가-힣]+로\s*[0-9]+번지/i,                    // 주소 형식 예시
    /^[가-힣]+시\s*[가-힣]+구\s*[가-힣]+동/i,        // 주소 형식 예시
  ];
  
  // Placeholder 텍스트 패턴
  const placeholderPatterns = [
    /입력하세요/i,            // "입력하세요"
    /입력해주세요/i,          // "입력해주세요"
    /입력/i,                  // "입력"
    /여기에\s*입력/i,         // "여기에 입력"
    /이곳에\s*입력/i,         // "이곳에 입력"
    /^[-_]{2,}$/,             // "---", "___" 등
    /^\.{3,}$/,               // "..." 등
    /^\(.*\)$/,               // "( )" 형태의 안내 문구
    /^\[.*\]$/,               // "[ ]" 형태의 안내 문구
  ];
  
  // 일반적인 더미 텍스트 패턴
  const commonDummyPatterns = [
    /^홍길동/i,               // "홍길동", "홍길동님" 등
    /^김철수/i,               // "김철수" 등
    /^이영희/i,               // "이영희" 등
    /^010-0000-0000/i,        // 전화번호 더미
    /^010\s*0000\s*0000/i,     // 전화번호 더미 (공백 포함)
    /^상품명을\s*입력/i,      // "상품명을 입력"
    /^받는사람명을\s*입력/i,   // "받는사람명을 입력"
    /^주소를\s*입력/i,        // "주소를 입력"
    /^전화번호를\s*입력/i,     // "전화번호를 입력"
    /^수량을\s*입력/i,        // "수량을 입력"
    /^배송메시지를\s*입력/i,   // "배송메시지를 입력"
    /^요청사항을\s*입력/i,     // "요청사항을 입력"
  ];
  
  // 모든 패턴 확인
  const allPatterns = [
    ...examplePatterns,
    ...formatPatterns,
    ...placeholderPatterns,
    ...commonDummyPatterns,
  ];
  
  return allPatterns.some(pattern => pattern.test(value));
}

const isValidCourierTemplate = (template: CourierUploadTemplate | null): boolean => {
  if (template === null) return false;
  if (!Array.isArray(template.headers)) return false;
  if (template.headers.length === 0) return false;
  // name이 비어있지 않은 header가 1개 이상 있을 때만 true
  const nonEmptyHeaders = template.headers.filter(header => header.name && header.name.trim() !== '');
  return nonEmptyHeaders.length > 0;
};

const loadCourierUploadTemplate = (): CourierUploadTemplate | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('invoiceFileConvert_courier_template_v1');
    if (stored) {
      const parsed = JSON.parse(stored) as CourierUploadTemplate;
      // headers가 없거나 빈 배열이면 null 반환
      if (!isValidCourierTemplate(parsed)) {
        return null;
      }
      return parsed;
    }
  } catch (error) {
    console.error('localStorage에서 택배 양식 정보를 불러오는 중 오류 발생:', error);
  }
  return null;
};

const saveCourierUploadTemplate = (template: CourierUploadTemplate | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (template) {
      localStorage.setItem('invoiceFileConvert_courier_template_v1', JSON.stringify(template));
    } else {
      localStorage.removeItem('invoiceFileConvert_courier_template_v1');
    }
  } catch (error) {
    console.error('localStorage에 택배 양식 정보를 저장하는 중 오류 발생:', error);
  }
};

const loadRecentExcelFormats = (): RecentExcelFormat[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('invoiceFileConvert_recent_excel_formats_v1');
    if (stored) {
      const parsed = JSON.parse(stored) as RecentExcelFormat[];
      return parsed;
    }
  } catch (error) {
    console.error('localStorage에서 최근 사용 엑셀 양식을 불러오는 중 오류 발생:', error);
  }
  return [];
};

const saveRecentExcelFormat = (
  template: CourierUploadTemplate,
  setRecentExcelFormats: (formats: RecentExcelFormat[]) => void,
  bridgeFile?: TemplateBridgeFile,
) => {
  try {
    const formats = loadRecentExcelFormats();
    const columnOrder = Array.isArray(template.headers) ? template.headers.map((header) => header.name) : [];

    const newFormat: RecentExcelFormat = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      columnOrder,
      bridgeFile,
    };

    const updatedFormats = [newFormat, ...formats];
    localStorage.setItem('invoiceFileConvert_recent_excel_formats_v1', JSON.stringify(updatedFormats));
    setRecentExcelFormats(updatedFormats);
    return newFormat.id;
  } catch (error) {
    console.error('localStorage에 최근 사용 엑셀 양식을 저장하는 중 오류 발생:', error);
    return null;
  }
};

export default function InvoiceFileConvertPage() {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const updatePoints = useUserStore((state) => state.updatePoints);
  
  const [courierUploadTemplate, setCourierUploadTemplate] = useState<CourierUploadTemplate | null>(null);
  const [isCourierTemplateModalOpen, setIsCourierTemplateModalOpen] = useState(false);
  const [templateFileSessionId, setTemplateFileSessionId] = useState<string | null>(null);
  const [orderFileSessionId, setOrderFileSessionId] = useState<string | null>(null);

  const [recentExcelFormats, setRecentExcelFormats] = useState<RecentExcelFormat[]>([]);
  const [showRecentTemplate, setShowRecentTemplate] = useState(false);
  const [tempSelectedFormatId, setTempSelectedFormatId] = useState<string | null>(null);
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [registrationSuccessMessage, setRegistrationSuccessMessage] = useState<string | null>(null);
  const [isEmptyDataModalOpen, setIsEmptyDataModalOpen] = useState(false);
  const [isSenderModalOpen, setIsSenderModalOpen] = useState(false);
  const [isNoTemplateModalOpen, setIsNoTemplateModalOpen] = useState(false);
  const [uploadedExcelFile, setUploadedExcelFile] = useState<File | null>(null);
  // 고정 입력 정보 설정 모달: 입력 모드 상태 (버튼 인덱스)
  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number | null>(null);
  // 고정 입력 정보 설정 모달: 각 버튼의 입력값 (인덱스 -> 입력값)
  const [headerInputValues, setHeaderInputValues] = useState<Record<number, string>>({});
  // 고정 헤더 값: 택배사 업로드 파일의 헤더명(key)에 고정값(value) 바인딩
  // ※ 데이터 적용 원칙: 주문 데이터에 보내는 사람 정보가 있으면 → 그 값 우선, 고정 입력 값은 fallback 용도, 주문 원본 데이터는 절대 수정하지 않음
  const [fixedHeaderValues, setFixedHeaderValues] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('invoiceFileConvert_fixed_header_values_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [currentFilePreviewData, setCurrentFilePreviewData] = useState<any[]>([]);
  const [orderStandardFile, setOrderStandardFile] = useState<any | null>(null);
  const [templateBridgeFile, setTemplateBridgeFile] = useState<TemplateBridgeFile | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRowWithId[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPreviewResetModalOpen, setIsPreviewResetModalOpen] = useState(false);
  const [courierHeaders, setCourierHeaders] = useState<string[]>([]);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    header: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [uploadedFileMeta, setUploadedFileMeta] = useState<
    { name: string; size: number }[]
  >([]);
  const [userOverrides, setUserOverrides] = useState<
    Record<string, Record<string, string>>
  >({});
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    header: string;
  } | null>(null);
  const [activeCell, setActiveCell] = useState<{
    rowId: string;
    header: string;
  } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [newRows, setNewRows] = useState<Set<string>>(new Set());
  const [isDraggingOrder, setIsDraggingOrder] = useState(false);
  const [isDraggingCourier, setIsDraggingCourier] = useState(false);
  /** 택배사에서 받은 송장번호 엑셀 (후속 병합 단계에서 사용) */
  const [courierInvoiceFile, setCourierInvoiceFile] = useState<File | null>(null);
  const [downloadModalFileName, setDownloadModalFileName] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "processing" | "done">("idle");
  const [unknownHeadersWarning, setUnknownHeadersWarning] = useState<string[]>([]);
  const [fileProcessingStatus, setFileProcessingStatus] = useState<"idle" | "processing" | "done">("idle");
  const [previewReady, setPreviewReady] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [processingDots, setProcessingDots] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [inputSourceType, setInputSourceType] = useState<'excel' | null>(null);

  const courierFileInputRef = useRef<HTMLInputElement | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const courierInvoiceFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const previewRevealTimeoutRef = useRef<number | null>(null);
  // 미리보기 테이블 위로 마우스가 올라가면(스크롤 시도 포함)
  // 청크 렌더링으로 인한 추가 리렌더가 발생해 버벅임/깜빡임이 생길 수 있어 일시 정지합니다.
  const previewHoverPausedRef = useRef(false);

  /** parseExcelFile·useEffect에서 최신 파일/양식 참조 (비동기 시점 클로저 오류 방지) */
  const uploadedExcelFileRef = useRef<File | null>(null);
  const courierInvoiceFileRef = useRef<File | null>(null);
  const templateBridgeFileRef = useRef<TemplateBridgeFile | null>(null);
  const courierUploadTemplateRef = useRef<CourierUploadTemplate | null>(null);
  uploadedExcelFileRef.current = uploadedExcelFile;
  courierInvoiceFileRef.current = courierInvoiceFile;
  templateBridgeFileRef.current = templateBridgeFile;
  courierUploadTemplateRef.current = courierUploadTemplate;

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // 고정 헤더 순서 배열 (courierUploadTemplate.headers 기준)
  const FIXED_HEADER_ORDER = useMemo(() => {
    if (courierUploadTemplate && Array.isArray(courierUploadTemplate.headers) && courierUploadTemplate.headers.length > 0) {
      return courierUploadTemplate.headers.map(header => header.name);
    }
    return [];
  }, [courierUploadTemplate]);

  // 정렬은 대용량일 때 Worker로 오프로드
  const sortedRows = useWorkerSortedRows(previewRows, sortConfig, userOverrides);

  // 미리보기 초기 노출량 (대용량에서 첫 화면 체감 개선)
  const PREVIEW_BATCH_SIZE = 100;
  const [renderedRowCount, setRenderedRowCount] = useState(0);
  const VIRTUAL_ROW_HEIGHT = 30;
  const VIRTUAL_OVERSCAN = 8;
  const [previewScrollTop, setPreviewScrollTop] = useState(0);
  const [previewViewportHeight, setPreviewViewportHeight] = useState(260);
  const displayRows = useMemo(
    () => sortedRows.slice(0, renderedRowCount),
    [sortedRows, renderedRowCount],
  );
  const visibleRowCount = Math.max(
    1,
    Math.ceil(previewViewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2,
  );
  const virtualStartIndex = Math.min(
    Math.max(0, displayRows.length - visibleRowCount),
    Math.max(0, Math.floor(previewScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN),
  );
  const virtualEndIndex = Math.min(displayRows.length, virtualStartIndex + visibleRowCount);
  const virtualRows = useMemo(
    () => displayRows.slice(virtualStartIndex, virtualEndIndex),
    [displayRows, virtualStartIndex, virtualEndIndex],
  );
  const virtualTopSpacerHeight = virtualStartIndex * VIRTUAL_ROW_HEIGHT;
  const virtualBottomSpacerHeight =
    (displayRows.length - virtualEndIndex) * VIRTUAL_ROW_HEIGHT;

  // "펼치기"를 누르면 사용자 기대대로 전체를 즉시 렌더합니다.
  // (청크 렌더링 중이더라도 스크롤바/마우스 이벤트로 인해 완전 로딩이 지연될 수 있으므로 강제 보정)
  useEffect(() => {
    if (!previewReady) return;
    if (!isPreviewExpanded) return;

    previewHoverPausedRef.current = false;
    setRenderedRowCount(previewRows.length);
  }, [isPreviewExpanded, previewReady, previewRows.length]);

  useEffect(() => {
    const totalRows = previewRows.length;
    if (!previewReady || totalRows === 0 || courierHeaders.length === 0) {
      setRenderedRowCount(0);
      return;
    }

    if (isPreviewExpanded) {
      setRenderedRowCount(totalRows);
      return;
    }

    // renderedRowCount 의존성 금지: '추가 조회' 후 effect가 초기 배치(100건)로 리셋되는 것 방지
    setRenderedRowCount((prev) => {
      if (prev >= totalRows) return totalRows;
      if (prev > 0) return Math.min(prev, totalRows);
      return Math.min(PREVIEW_BATCH_SIZE, totalRows);
    });
  }, [previewReady, previewRows.length, courierHeaders.length, isPreviewExpanded]);

  const hasMorePreviewRows = sortedRows.length > renderedRowCount;

  const handlePreviewScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setPreviewScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const node = previewScrollContainerRef.current;
    if (!node) return;

    const syncViewport = () => {
      setPreviewViewportHeight(node.clientHeight || 260);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [isPreviewExpanded, displayRows.length, courierHeaders.length, previewReady]);

  const commitCellEdit = (rowId: string, header: string, value: string) => {
    setUserOverrides(prev => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [header]: value,
      },
    }));
  };

  /** 세 가지가 모두 있어야 미리보기 표시 (없을 때 안내 문구) */
  const invoicePreviewGateMessage = useMemo(() => {
    if (!isValidCourierTemplate(courierUploadTemplate) || !templateBridgeFile) {
      return '쇼핑몰 송장 업로드 양식을 등록해 주세요.';
    }
    if (!courierInvoiceFile) {
      return '택배사 송장 엑셀 파일을 등록해 주세요.';
    }
    if (!uploadedExcelFile) {
      return '주문 엑셀 파일을 등록해 주세요.';
    }
    return null;
  }, [courierUploadTemplate, templateBridgeFile, courierInvoiceFile, uploadedExcelFile]);

  // fixedHeaderValues를 localStorage에 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('invoiceFileConvert_fixed_header_values_v1', JSON.stringify(fixedHeaderValues));
    } catch (error) {
      console.error('localStorage에 고정 헤더 값을 저장하는 중 오류 발생:', error);
    }
  }, [fixedHeaderValues]);

  useEffect(() => {
    const loadedTemplate = loadCourierUploadTemplate();
    setCourierUploadTemplate(loadedTemplate);

    const formats = loadRecentExcelFormats();
    setRecentExcelFormats(formats);

    // 컴포넌트 마운트 시 bridgeFile 자동 복원
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('invoiceFileConvert_activeCourierBridgeFile');
        if (saved) {
          const parsed = JSON.parse(saved) as TemplateBridgeFile;
          setTemplateBridgeFile(parsed);
        }
      } catch (error) {
        console.error('localStorage에서 bridgeFile을 불러오는 중 오류 발생:', error);
      }
    }
  }, []);

  // templateBridgeFile 변경 시 기존 Stage2/Stage3 결과 초기화
  useEffect(() => {
    if (!templateBridgeFile) return;

    // 기존 변환 결과 초기화
    setPreviewRows([]);
    setCourierHeaders([]);
    setPreviewReady(false);
    setConversionProgress(0);
    if (previewRevealTimeoutRef.current) {
      window.clearTimeout(previewRevealTimeoutRef.current);
      previewRevealTimeoutRef.current = null;
    }
  }, [templateBridgeFile]);

  // 점 애니메이션 처리 (파일 처리용)
  useEffect(() => {
    if (fileProcessingStatus !== "processing") return;

    const interval = setInterval(() => {
      setProcessingDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [fileProcessingStatus]);

  const handleOpenCourierTemplateModal = () => {
    const formats = loadRecentExcelFormats();
    setRecentExcelFormats(formats);
    setShowRecentTemplate(formats.length > 0);

    let matchedFormatId: string | null = null;
    if (courierUploadTemplate && Array.isArray(courierUploadTemplate.headers)) {
      const currentHeaders = courierUploadTemplate.headers
        .filter((header) => !header.isEmpty && header.name.trim() !== '')
        .map((header) => header.name);

      const matchedFormat = formats.find((format) => {
        const formatHeaders = format.columnOrder || [];
        if (currentHeaders.length !== formatHeaders.length) return false;
        return currentHeaders.every((header, index) => header === formatHeaders[index]);
      });

      if (matchedFormat) {
        matchedFormatId = matchedFormat.id;
      }
    }

    setTempSelectedFormatId(matchedFormatId);
    setIsCourierTemplateModalOpen(true);
  };

  const handleCloseCourierTemplateModal = () => {
    setIsCourierTemplateModalOpen(false);
  };

  const handleConfirmCourierTemplateModal = () => {
    // 라디오 버튼 선택 시 이미 모든 설정이 완료되므로, 모달 닫기만 수행
    setIsCourierTemplateModalOpen(false);
  };

  const handleTemplateFileClick = () => {
    if (courierFileInputRef.current) {
      courierFileInputRef.current.click();
    }
  };

  const handleTemplateFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      e.target.value = '';
      return;
    }

    const newTemplateSessionId = crypto.randomUUID();
    setTemplateFileSessionId(newTemplateSessionId);

    // 파일 선택 직후, Stage1 실행 전에 상태 초기화
    setCurrentFilePreviewData([]);
    setOrderStandardFile(null);
    setTemplateBridgeFile(null);
    setUploadedFileMeta([]);

    try {
      const templateResult = await runTemplatePipeline(file, undefined, newTemplateSessionId);
      setOrderStandardFile(null);
      setTemplateBridgeFile(templateResult.bridgeFile);

      // Stage1 성공 시 bridgeFile을 localStorage에 저장
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            'invoiceFileConvert_activeCourierBridgeFile',
            JSON.stringify(templateResult.bridgeFile)
          );
        } catch (error) {
          console.error('localStorage에 bridgeFile을 저장하는 중 오류 발생:', error);
        }
      }

      // templateResult.bridgeFile 기반으로 CourierUploadTemplate 생성
      // bridgeFile.courierHeaders를 CourierUploadHeader[]로 변환
      const headers: CourierUploadHeader[] = templateResult.bridgeFile.courierHeaders.map((headerName, index) => ({
        name: headerName,
        index,
        isEmpty: !headerName || headerName.trim() === '',
      }));

      // 보내는사람 컬럼이 있는지 확인하여 requiresSender 설정
      const hasSenderColumns = headers.some((header) => !header.isEmpty && isSenderColumn(header.name));

      const template: CourierUploadTemplate = {
        courierType: null,
        headers,
        requiresSender: hasSenderColumns,
      };

      // 파일 업로드 처리 후 바로 저장
      const newFormatId = saveRecentExcelFormat(template, setRecentExcelFormats, templateResult.bridgeFile);
      setCourierUploadTemplate(template);
      saveCourierUploadTemplate(template);

      if (newFormatId) {
        setTempSelectedFormatId(newFormatId);
      }

      setRegistrationSuccessMessage('등록이 완료되었습니다');
      setTimeout(() => {
        setRegistrationSuccessMessage(null);
      }, 3500);
    } catch (error) {
      console.error('엑셀 파일 파싱 오류:', error);
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다.');
    } finally {
      e.target.value = '';
    }
  };

  const saveFormatDisplayName = (formatId: string, displayName: string) => {
    try {
      const formats = loadRecentExcelFormats();
      const updatedFormats = formats.map((format) =>
        format.id === formatId ? { ...format, displayName: displayName.trim() || undefined } : format,
      );
      localStorage.setItem('invoiceFileConvert_recent_excel_formats_v1', JSON.stringify(updatedFormats));
      setRecentExcelFormats(updatedFormats);
      setEditingFormatId(null);
      setEditingDisplayName('');
    } catch (error) {
      console.error('양식 이름을 저장하는 중 오류 발생:', error);
    }
  };

  const handleStartEditName = (format: RecentExcelFormat) => {
    setEditingFormatId(format.id);
    setEditingDisplayName(format.displayName || '');
  };

  const handleCancelEditName = () => {
    setEditingFormatId(null);
    setEditingDisplayName('');
  };

  const handleConfirmEditName = (formatId: string) => {
    saveFormatDisplayName(formatId, editingDisplayName);
  };

  const handleTemplateSelect = (formatId: string) => {
    const selected = recentExcelFormats.find((format) => format.id === formatId);

    if (!selected) {
      return;
    }

    // 1. setSelectedTemplateId 실행 (tempSelectedFormatId로 관리)
    setTempSelectedFormatId(formatId);

    // 2. courierUploadTemplate 설정
    const headers: CourierUploadHeader[] = Array.isArray(selected.columnOrder)
      ? selected.columnOrder.map((name, index) => ({
          name: name || '',
          index,
          isEmpty: !name || name.trim() === '',
        }))
      : [];

    const hasSenderColumns = headers.some((header) => !header.isEmpty && isSenderColumn(header.name));

    const template: CourierUploadTemplate = {
      courierType: null,
      headers,
      requiresSender: hasSenderColumns,
    };

    setCourierUploadTemplate(template);
    saveCourierUploadTemplate(template);

    // 템플릿 변경 시 메타 초기화
    setUploadedFileMeta([]);

    // 3. 선택된 템플릿의 bridgeFile 적용
    if (selected.bridgeFile) {
      // setTemplateBridgeFile 실행 - 새 객체로 복사하여 전달 (React 객체 동일성 비교 문제 해결)
      setTemplateBridgeFile(JSON.parse(JSON.stringify(selected.bridgeFile)));
      
      // localStorage(activeCourierBridgeFile)도 함께 갱신
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            'invoiceFileConvert_activeCourierBridgeFile',
            JSON.stringify(selected.bridgeFile)
          );
        } catch (error) {
          console.error('localStorage에 bridgeFile을 저장하는 중 오류 발생:', error);
        }
      }
    }
  };

  const handleDeleteFormat = (formatId: string) => {
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    try {
      const formats = loadRecentExcelFormats();
      const formatToDelete = formats.find((format) => format.id === formatId);
      
      // 삭제하려는 format이 현재 사용 중인 템플릿인지 확인
      if (formatToDelete && courierUploadTemplate && Array.isArray(courierUploadTemplate.headers)) {
        const currentHeaders = courierUploadTemplate.headers
          .filter((header) => !header.isEmpty && header.name.trim() !== '')
          .map((header) => header.name);
        const formatHeaders = formatToDelete.columnOrder || [];
        
        // 헤더 배열이 일치하는지 확인
        if (currentHeaders.length === formatHeaders.length &&
            currentHeaders.every((header, index) => header === formatHeaders[index])) {
          // 현재 사용 중인 템플릿이면 초기화
          setCourierUploadTemplate(null);
          saveCourierUploadTemplate(null);
          // bridgeFile도 함께 삭제
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('invoiceFileConvert_activeCourierBridgeFile');
              setTemplateBridgeFile(null);
            } catch (error) {
              console.error('localStorage에서 bridgeFile을 삭제하는 중 오류 발생:', error);
            }
          }
        }
      }
      
      const updatedFormats = formats.filter((format) => format.id !== formatId);
      localStorage.setItem('invoiceFileConvert_recent_excel_formats_v1', JSON.stringify(updatedFormats));
      setRecentExcelFormats(updatedFormats);

      if (tempSelectedFormatId === formatId) {
        setTempSelectedFormatId(null);
      }
    } catch (error) {
      console.error('양식을 삭제하는 중 오류 발생:', error);
    }
  };

  const handleCloseEmptyDataModal = () => {
    setIsEmptyDataModalOpen(false);
  };

  const handleOpenSenderModal = () => {
    // 택배 업로드 양식이 없는 경우 안내 모달 표시
    if (!isValidCourierTemplate(courierUploadTemplate)) {
      setIsNoTemplateModalOpen(true);
      return;
    }

    // 택배 업로드 양식이 있는 경우 고정 입력 헤더 설정 모달 열기
    setIsSenderModalOpen(true);
  };

  const handleCloseSenderModal = () => {
    setIsSenderModalOpen(false);
  };

  const handleCloseNoTemplateModal = () => {
    setIsNoTemplateModalOpen(false);
  };

  const handleOpenCourierTemplateFromNoTemplateModal = () => {
    setIsNoTemplateModalOpen(false);
    handleOpenCourierTemplateModal();
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      files.forEach((file) => {
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'xlsx' || extension === 'xls') {
          setUploadedExcelFile(file);
          if (
            !isValidCourierTemplate(courierUploadTemplate) ||
            !templateBridgeFile ||
            !courierInvoiceFile
          ) {
            return;
          }
          if (!uploadedFileMeta.some((f) => f.name === file.name && f.size === file.size)) {
            parseExcelFile(file);
          } else {
            alert('이미 업로드된 파일입니다.');
          }
        } else {
          alert('주문 파일은 엑셀(.xlsx, .xls)만 등록할 수 있습니다.');
        }
      });
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleCourierInvoiceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls') {
      alert('송장 파일은 엑셀(.xlsx, .xls)만 등록할 수 있습니다.');
      e.target.value = '';
      return;
    }
    setCourierInvoiceFile(file);
    if (e.target) e.target.value = '';
  };

  // 사용량 차감 헬퍼 함수
  const usePoints = async (amount: number, type: 'text' | 'download'): Promise<boolean> => {
    // 현재 사용자 정보 가져오기 (최신 상태)
    let currentUser = useUserStore.getState().user;
    
    if (!currentUser) {
      // 사용자 정보 다시 가져오기 시도
      try {
        await fetchUser();
        currentUser = useUserStore.getState().user;
        if (!currentUser) {
          alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
          router.push('/auth/login');
          return false;
        }
      } catch (error) {
        console.error('[usePoints] 사용자 정보 가져오기 실패:', error);
        alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
        router.push('/auth/login');
        return false;
      }
    }

    // 사용량 부족 확인
    if (currentUser.points < amount) {
      alert('사용량이 부족합니다');
      router.push('/pricing');
      return false;
    }

    try {
      const response = await fetch('/api/user/use-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          amount,
          type,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.error === '사용량이 부족합니다.') {
          alert('사용량이 부족합니다');
          router.push('/pricing');
          return false;
        }
        throw new Error(data.error || '사용량 차감 실패');
      }

      const result = await response.json();
      if (result.success && result.user) {
        // Zustand store 업데이트
        updatePoints(result.user.points, result.user.monthlyPoints);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[InvoiceFileConvertPage] 사용량 차감 중 오류:', error);
      return false;
    }
  };

  const handleDragOverOrder = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOrder(true);
  };

  const handleDragLeaveOrder = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOrder(false);
  };

  const handleDropOrder = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOrder(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    files.forEach((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'xlsx' || extension === 'xls') {
        setUploadedExcelFile(file);
        if (
          !isValidCourierTemplate(courierUploadTemplate) ||
          !templateBridgeFile ||
          !courierInvoiceFile
        ) {
          return;
        }
        if (!uploadedFileMeta.some((f) => f.name === file.name && f.size === file.size)) {
          parseExcelFile(file);
        } else {
          alert('이미 업로드된 파일입니다.');
        }
      } else {
        alert('주문 파일은 엑셀(.xlsx, .xls)만 등록할 수 있습니다.');
      }
    });
  };

  const handleDragOverCourier = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCourier(true);
  };

  const handleDragLeaveCourier = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCourier(false);
  };

  const handleDropCourier = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCourier(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls') {
      alert('송장 파일은 엑셀(.xlsx, .xls)만 등록할 수 있습니다.');
      return;
    }
    setCourierInvoiceFile(file);
  };

  const parseExcelFile = async (file: File) => {
    const bridge = templateBridgeFileRef.current;
    const inv = courierInvoiceFileRef.current;
    const tpl = courierUploadTemplateRef.current;

    if (!inv || !bridge || !isValidCourierTemplate(tpl)) {
      return;
    }

    if (uploadedFileMeta.some((f) => f.name === file.name && f.size === file.size)) {
      alert('이미 업로드된 파일입니다.');
      return;
    }

    setFileProcessingStatus('processing');
    setPreviewReady(false);
    setConversionProgress(5);
    setPreviewRows([]);
    setCourierHeaders([]);
    setSelectedRows([]);
    setNewRows(new Set());
    setUserOverrides({});
    setUnknownHeadersWarning([]);
    if (previewRevealTimeoutRef.current) {
      window.clearTimeout(previewRevealTimeoutRef.current);
      previewRevealTimeoutRef.current = null;
    }
    setInputSourceType('excel');

    const newOrderSessionId = crypto.randomUUID();
    setOrderFileSessionId(newOrderSessionId);

    try {
      const invoiceFileForMerge = courierInvoiceFileRef.current;
      if (!invoiceFileForMerge) {
        throw new Error('송장 엑셀 파일이 없습니다.');
      }

      const buffer = await file.arrayBuffer();
      const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);

      const filteredRows = filterNonEmptyRows(rawData);
      const headerIndex = detectHeaderRowIndex(filteredRows);
      const alignedRawData = alignRowsFromHeader(filteredRows, headerIndex);

      const preprocessOrder = new ExcelPreprocessPipeline();
      const orderCleanInput = preprocessOrder.run(alignedRawData);

      const invBuffer = await invoiceFileForMerge.arrayBuffer();
      const invRaw = readFirstSheetMatrixFromArrayBuffer(invBuffer);
      const invFiltered = filterNonEmptyRows(invRaw);
      const invHeaderIndex = detectHeaderRowIndex(invFiltered);
      const invAligned = alignRowsFromHeader(invFiltered, invHeaderIndex);
      const preprocessInvoice = new ExcelPreprocessPipeline();
      const invoiceCleanInput = preprocessInvoice.run(invAligned);

      const invoiceSessionId = crypto.randomUUID();

      const [orderStage2, invoiceStage2] = await Promise.all([
        fetchOrderPipelineStage2(orderCleanInput, newOrderSessionId),
        fetchOrderPipelineStage2(invoiceCleanInput, invoiceSessionId),
      ]);

      const combinedUnknownHeaders = [
        ...new Set([...(orderStage2.unknownHeaders ?? []), ...(invoiceStage2.unknownHeaders ?? [])]),
      ];

      setConversionProgress(70);

      if (combinedUnknownHeaders.length > 0) {
        setUnknownHeadersWarning(combinedUnknownHeaders);
      } else {
        setUnknownHeadersWarning([]);
      }

      // Stage2에는 파일별 표준화 결과만 유지합니다.
      setOrderStandardFile(orderStage2);

      const bridgeNow = templateBridgeFileRef.current;
      if (bridgeNow) {
        setConversionProgress(85);
        const stage3Result = await runMergePipeline({
          template: bridgeNow,
          orderData: orderStage2,
          fixedInput: fixedHeaderValues,
          invoiceData: invoiceStage2,
        });

        const newRowIds = stage3Result.previewRows.map(() => crypto.randomUUID());
        setConversionProgress(95);
        setPreviewRows(
          stage3Result.previewRows.map((row, index) => ({
            rowId: newRowIds[index],
            data: row,
          })),
        );

        setNewRows(() => {
          const updated = new Set<string>();
          newRowIds.forEach((id) => updated.add(id));
          return updated;
        });

        setTimeout(() => {
          setNewRows((prev) => {
            const updated = new Set(prev);
            newRowIds.forEach((id) => updated.delete(id));
            return updated;
          });
        }, 3000);

        setCourierHeaders(stage3Result.courierHeaders);

        setUploadedFileMeta((prev) => [{ name: file.name, size: file.size }, ...prev]);
        setConversionProgress(100);
        setRenderedRowCount(
          Math.min(PREVIEW_BATCH_SIZE, stage3Result.previewRows.length),
        );
        if (previewRevealTimeoutRef.current) {
          window.clearTimeout(previewRevealTimeoutRef.current);
          previewRevealTimeoutRef.current = null;
        }
        setPreviewReady(true);
        setFileProcessingStatus('idle');
      } else {
        console.warn('[UI] Stage3 실행 불가: templateBridgeFile이 없습니다.');
        if (previewRevealTimeoutRef.current) {
          window.clearTimeout(previewRevealTimeoutRef.current);
          previewRevealTimeoutRef.current = null;
        }
        setPreviewReady(false);
        setConversionProgress(0);
        setFileProcessingStatus('idle');
      }

      if (typeof window !== 'undefined') {
        (window as any).__lastOrderResult = orderStage2;
        (window as any).__lastOrderFile = file.name;
        (window as any).__lastInvoiceMerge = {
          orderFile: file.name,
          invoiceFile: invoiceFileForMerge.name,
        };
      }
    } catch (err) {
      console.error('[InvoiceFileConvertPage] 주문 엑셀 처리 오류:', err);
      alert(err instanceof Error ? err.message : '주문 파일 처리 중 오류가 발생했습니다.');
      if (previewRevealTimeoutRef.current) {
        window.clearTimeout(previewRevealTimeoutRef.current);
        previewRevealTimeoutRef.current = null;
      }
      setPreviewReady(false);
      setConversionProgress(0);
      setFileProcessingStatus('idle');
    }
  };

  // 송장 엑셀 또는 쇼핑몰 양식(bridge) 변경 시, 이미 선택된 주문 엑셀로 미리보기 재실행
  useEffect(() => {
    if (!templateBridgeFile || !courierInvoiceFile) return;
    const orderFile = uploadedExcelFileRef.current;
    if (!orderFile) return;
    if (!isValidCourierTemplate(courierUploadTemplateRef.current)) return;

    setUploadedFileMeta((prev) =>
      prev.filter((m) => !(m.name === orderFile.name && m.size === orderFile.size)),
    );
    void parseExcelFile(orderFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parseExcelFile은 의도적으로 최신 ref만 사용
  }, [courierInvoiceFile, templateBridgeFile]);

  const handleDownloadPreview = async () => {
    if (!isValidCourierTemplate(courierUploadTemplate) || !templateBridgeFile) {
      alert('쇼핑몰 송장 업로드 양식을 먼저 등록해 주세요.');
      return;
    }
    if (!courierInvoiceFile) {
      alert('택배사 송장 엑셀 파일을 등록해 주세요.');
      return;
    }
    if (!uploadedExcelFile) {
      alert('주문 엑셀 파일을 등록해 주세요.');
      return;
    }
    if (!courierHeaders || courierHeaders.length === 0) {
      alert('미리보기에 표시할 데이터가 없습니다. 주문·송장·양식을 모두 등록했는지 확인해 주세요.');
      return;
    }

    if (!sortedRows || sortedRows.length === 0) {
      alert('다운로드할 주문 데이터가 없습니다.');
      return;
    }

    // 엑셀 다운로드 실행 직전 사용량 체크 (FREE 플랜만)
    if (user?.plan === 'FREE') {
      // 사용자 정보 확인
      if (!user) {
        alert('로그인이 필요합니다.');
        router.push('/auth/login');
        return;
      }
      
      // 사용량 부족 체크 (다운로드 1회 1,000 사용량 필요)
      if (user.points < 1000) {
        alert('사용량이 부족합니다');
        return;
      }
      
      // 사용량 차감 (API 호출)
      const pointsDeducted = await usePoints(1000, 'download');
      if (!pointsDeducted) {
        return; // 사용량 부족으로 차단
      }
    }
    // PRO / YEARLY 플랜은 다운로드 차감 없음

    // 다운로드 시작 상태
    setDownloadStatus("processing");

    // 다음 이벤트 루프로 넘겨 UI 먼저 반응
    setTimeout(() => {
      try {
        // 1. 헤더 생성
        const excelHeaders = courierHeaders;

        // 2. 데이터 생성 (중요: sortedRows 기준)
        const excelRows = sortedRows.map((rowWithId) => {
          return courierHeaders.map((header) => {
            return (
              userOverrides[rowWithId.rowId]?.[header] ??
              rowWithId.data[header] ??
              ""
            );
          });
        });

        const excelData = [excelHeaders, ...excelRows];

        // 3. 엑셀 파일 생성
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const hour = now.getHours();
        const minute = String(now.getMinutes()).padStart(2, '0');
        const fileName = `엑클로드송장정리 ${yy}년${month}월${day}일${hour}시${minute}분.xlsx`;

        XLSX.writeFile(wb, fileName);

        // 히스토리 세션 저장
        try {
          const { addSession } = useHistoryStore.getState();
          
          const sourceType: SourceType = inputSourceType === 'excel' ? 'excel' : 'kakao';

          const excelType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          let files: FileMetadata[] = uploadedFileMeta.map((meta) => ({
            name: meta.name,
            size: meta.size,
            lastModified: Date.now(),
            type: excelType,
          }));
          if (courierInvoiceFile) {
            files = [
              ...files,
              {
                name: courierInvoiceFile.name,
                size: courierInvoiceFile.size,
                lastModified: courierInvoiceFile.lastModified,
                type: excelType,
              },
            ];
          }
          
          // courier: courierUploadTemplate의 courierType
          const courier = courierUploadTemplate?.courierType || null;
          
          // senderInfo: fixedHeaderValues에서 sender 정보 추출
          let senderInfo: SenderInfo | null = null;
          if (courierUploadTemplate?.headers) {
            const senderNameHeader = courierUploadTemplate.headers.find(h => h.fixedType === 'sender_name');
            const senderPhoneHeader = courierUploadTemplate.headers.find(h => h.fixedType === 'sender_phone');
            const senderAddressHeader = courierUploadTemplate.headers.find(h => h.fixedType === 'sender_address');
            
            const senderName = senderNameHeader ? fixedHeaderValues[senderNameHeader.name] : '';
            const senderPhone = senderPhoneHeader ? fixedHeaderValues[senderPhoneHeader.name] : '';
            const senderAddress = senderAddressHeader ? fixedHeaderValues[senderAddressHeader.name] : '';
            
            if (senderName || senderPhone || senderAddress) {
              senderInfo = {
                name: senderName || '',
                phone: senderPhone || '',
                address: senderAddress || ''
              };
            }
          }
          
          addSession({
            sourceType,
            files,
            courier,
            downloadedFileName: fileName,
            senderInfo,
            orderCount: sortedRows.length, // 생성된 주문 건수
            resultRows: sortedRows // 변환된 주문 데이터 (히스토리 복원용)
          });
        } catch (error) {
          console.error('히스토리 세션 저장 오류:', error);
          // 히스토리 저장 실패는 치명적이지 않으므로 조용히 처리
        }

        setDownloadModalFileName(fileName);
        setDownloadStatus("done");

        setTimeout(() => {
          setDownloadStatus("idle");
          setDownloadModalFileName(null);

          // 🔥 기존 초기화 유지
          setPreviewRows([]);
          setUserOverrides({});
          setSortConfig(null);
          setUnknownHeadersWarning([]);
          setSelectedFileName(null);

          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          if (courierInvoiceFileInputRef.current) {
            courierInvoiceFileInputRef.current.value = "";
          }

          // ✅ 다운로드 완료 후 업로드 파일 상태 초기화
          setSelectedFiles([]);
          setUploadedExcelFile(null);
          setUploadedFileMeta([]);
          setInputSourceType(null);
          setCourierInvoiceFile(null);
        }, 3000);

      } catch (error) {
        console.error("다운로드 오류:", error);
        setDownloadStatus("idle");
      }
    }, 0);
  };

  const applyInvoicePreviewWorkspaceReset = useCallback(() => {
    setPreviewRows([]);
    setCourierHeaders([]);
    setUserOverrides({});
    setSortConfig(null);
    setUnknownHeadersWarning([]);
    setSelectedRows([]);
    setNewRows(new Set());
    setEditingCell(null);
    setActiveCell(null);
    setOrderStandardFile(null);
    setCurrentFilePreviewData([]);
    setUploadedExcelFile(null);
    setCourierInvoiceFile(null);
    setUploadedFileMeta([]);
    setSelectedFiles([]);
    setInputSourceType(null);
    setSelectedFileName(null);
    setPreviewReady(false);
    setConversionProgress(0);
    setFileProcessingStatus('idle');
    if (previewRevealTimeoutRef.current) {
      window.clearTimeout(previewRevealTimeoutRef.current);
      previewRevealTimeoutRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    if (courierFileInputRef.current) courierFileInputRef.current.value = '';
    if (courierInvoiceFileInputRef.current) courierInvoiceFileInputRef.current.value = '';
    setIsPreviewResetModalOpen(false);
  }, []);

  return (
    <>
      {/* 삭제 확인 모달 */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-[400px] p-6">
            <h4 className="text-lg font-semibold mb-3">
              선택한 {selectedRows.length}개 항목을 삭제하시겠습니까?
            </h4>

            <p className="text-sm text-gray-500 mb-6">
              선택한 항목을 삭제하고, 나머지 데이터만 유지합니다.
            </p>

            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
                onClick={() => setIsDeleteModalOpen(false)}
              >
                취소
              </button>

              <button
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => {
                  setPreviewRows(prev =>
                    prev.filter(row => !selectedRows.includes(row.rowId))
                  );
                  setSelectedRows([]);
                  setIsDeleteModalOpen(false);
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {isPreviewResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg w-[min(100%,400px)] p-6 border border-zinc-200 dark:border-zinc-700">
            <h4 className="text-lg font-semibold mb-3 text-zinc-900 dark:text-zinc-100">
              미리보기 초기화
            </h4>
            <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2 leading-relaxed">
              미리보기와 이번에 선택한 주문·송장 엑셀 파일을 초기화합니다.
            </p>
            <p className="text-sm text-gray-500 dark:text-zinc-500 mb-6">
              등록한 쇼핑몰 송장 양식·고정 입력은 그대로 둡니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm border rounded hover:bg-gray-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                onClick={() => setIsPreviewResetModalOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"
                onClick={applyInvoicePreviewWorkspaceReset}
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pt-3 pb-4 bg-zinc-50 dark:bg-black">
      <main className="max-w-[1200px] mx-auto px-8">
        {/* Hero 섹션 - 세로 흐름 구조 (주문변환 UI 껍데기) */}
        <section className="relative pt-2 pb-3">
          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 서비스 설명 텍스트 영역 + 사용량 표시 */}
            <div className="relative flex items-center justify-center">
              {/* 주문변환 안내 컨테이너 (항상 중앙) */}
              <div className="flex flex-col gap-2 text-center min-h-[32px]">
                <p className="text-sm text-gray-500 leading-tight">
                  송장파일변환 — 주문 엑셀 파일과 송장 엑셀 파일을 등록하여 쇼핑몰 송장 업로드 양식에 맞게 변환합니다.
                </p>
              </div>
              
              {/* 사용량 표시 UI (오른쪽 절대 위치) */}
              {user && (
                <div className="absolute right-0 bg-gradient-to-r from-blue-500 to-sky-600 text-white py-1.5 px-4 rounded-lg shadow-md min-w-[200px]">
                  <div className="flex items-center gap-2 justify-end">
                    <Coins className="w-4 h-4" />
                    <span className="font-medium text-sm">잔여 사용량</span>
                    <span className="text-lg font-bold">:{user.points.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 이중 파일 업로드: 주문 엑셀 + 택배사 송장 엑셀 */}
            <div className="w-full border-2 border-blue-500 rounded-xl bg-white p-5">
              <div className="flex flex-col lg:flex-row gap-5">
                <div
                  className="w-full lg:w-1/2 flex flex-col"
                  onDragOver={handleDragOverOrder}
                  onDragLeave={handleDragLeaveOrder}
                  onDrop={handleDropOrder}
                >
                  <h3 className="text-base font-semibold text-gray-900 mb-2.5">① 주문 파일</h3>
                  <label
                    htmlFor="invoice-order-file-input"
                    style={{ cursor: 'pointer' }}
                    className={`w-full h-[180px] bg-gray-50 border-2 border-dashed rounded-lg p-4 transition-colors overflow-hidden flex flex-col ${
                      isDraggingOrder
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700">엑셀 파일</p>
                        <p className="text-xs text-gray-500">클릭하거나 드래그하여 업로드하세요</p>
                        <p className="text-xs text-gray-400 mt-1.5">(xlsx, xls)</p>
                      </div>
                      {uploadedExcelFile && (
                        <div className="flex items-center justify-center gap-3 mt-2 text-sm text-gray-600">
                          <span>
                            📄 선택됨: {uploadedExcelFile.name}
                            {uploadedFileMeta.length > 1 && ` 외 ${uploadedFileMeta.length - 1}개`}
                          </span>
                          <span className="w-[110px] text-right inline-block">
                            {fileProcessingStatus === 'processing' && (
                              <span className="text-blue-600 font-medium">⏳ 처리중{processingDots}</span>
                            )}
                            {fileProcessingStatus === 'done' && (
                              <span className="text-green-600 font-medium">✔ 완료</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </label>
                  <input
                    ref={fileInputRef}
                    id="invoice-order-file-input"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelFileChange}
                    style={{ display: 'none' }}
                  />
                  <p className="text-xs text-gray-600 mt-2.5 leading-relaxed text-center">
                    <span className="font-medium text-gray-800">원본 주문 엑셀</span>을 올려주세요.
                  </p>
                </div>

                <div
                  className="w-full lg:w-1/2 flex flex-col lg:border-l lg:border-gray-200 lg:pl-5"
                  onDragOver={handleDragOverCourier}
                  onDragLeave={handleDragLeaveCourier}
                  onDrop={handleDropCourier}
                >
                  <h3 className="text-base font-semibold text-gray-900 mb-2.5">② 송장 파일</h3>
                  <label
                    htmlFor="invoice-courier-file-input"
                    style={{ cursor: 'pointer' }}
                    className={`w-full h-[180px] bg-gray-50 border-2 border-dashed rounded-lg p-4 transition-colors overflow-hidden flex flex-col ${
                      isDraggingCourier
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700">엑셀 파일</p>
                        <p className="text-xs text-gray-500">클릭하거나 드래그하여 업로드하세요</p>
                        <p className="text-xs text-gray-400 mt-1.5">(xlsx, xls)</p>
                      </div>
                      {courierInvoiceFile && (
                        <p className="mt-2 text-sm text-gray-600">
                          📄 선택됨: {courierInvoiceFile.name}
                        </p>
                      )}
                    </div>
                  </label>
                  <input
                    ref={courierInvoiceFileInputRef}
                    id="invoice-courier-file-input"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleCourierInvoiceFileChange}
                    style={{ display: 'none' }}
                  />
                  <p className="text-xs text-gray-600 mt-2.5 leading-relaxed text-center">
                    택배사에서 내려받은 <span className="font-medium text-gray-800">송장번호가 들어 있는 엑셀</span>을
                    등록하세요.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 변환된 파일 출력 영역 레이아웃 */}
        <section className="relative py-3">
          <div className="w-full bg-gray-200 border border-gray-300 rounded-xl">
            <div className="px-6 pt-6 pb-4">
              {/* 미리보기: 그리드로 제목(1열) / 버튼·건수안내·편집안내(2열, 펼치기 시작점 정렬) */}
              <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 items-start">
                <h3 className="row-start-1 col-start-1 self-center text-lg font-semibold">미리보기</h3>

                <div className="row-start-1 col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  {previewRows.length > 0 && courierHeaders.length > 0 && (
                    <button
                      className="inline-flex h-9 w-20 flex-shrink-0 items-center justify-center rounded border text-sm transition"
                      onClick={() => setIsPreviewExpanded(prev => !prev)}
                    >
                      {isPreviewExpanded ? '닫기' : '펼치기'}
                    </button>
                  )}

                  {previewRows.length > 0 && courierHeaders.length > 0 && (
                    <button
                      type="button"
                      className="inline-flex h-9 flex-shrink-0 items-center justify-center rounded border border-amber-500/80 bg-amber-50 px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
                      onClick={() => setIsPreviewResetModalOpen(true)}
                    >
                      미리보기 초기화
                    </button>
                  )}

                  <div className="flex w-20 flex-shrink-0 justify-start">
                    {previewRows.length > 0 && courierHeaders.length > 0 && selectedRows.length > 0 && (
                      <button
                        className="inline-flex h-9 w-20 items-center justify-center rounded-md bg-red-600 text-sm font-medium text-white hover:bg-red-700"
                        onClick={() => {
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        선택 삭제
                      </button>
                    )}
                  </div>

                  {previewRows.length > 0 && courierHeaders.length > 0 && !isPreviewExpanded && (
                    <div className="min-w-0 flex flex-[1_1_12rem] flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium leading-snug text-blue-600 sm:flex-nowrap sm:leading-tight">
                      <span className="sm:whitespace-nowrap">
                        총 {sortedRows.length.toLocaleString()}건 중 {Math.min(renderedRowCount, sortedRows.length).toLocaleString()}건 표시 중
                      </span>
                      {hasMorePreviewRows && (
                        <>
                          <button
                            className="h-7 flex-shrink-0 rounded border px-2.5 text-xs hover:bg-gray-100"
                            type="button"
                            onClick={() =>
                              setRenderedRowCount((prev) =>
                                Math.min(prev + PREVIEW_BATCH_SIZE, sortedRows.length),
                              )
                            }
                          >
                            추가 조회 (다음 {PREVIEW_BATCH_SIZE}건)
                          </button>
                          <button
                            className="h-7 flex-shrink-0 rounded border px-2.5 text-xs hover:bg-gray-100"
                            type="button"
                            onClick={() => setRenderedRowCount(sortedRows.length)}
                          >
                            전체 보기
                          </button>
                        </>
                      )}
                      <span className="text-blue-600 sm:whitespace-nowrap">
                        주문 건수·PC/인터넷 환경에 따라 처리 시간이 다소 걸릴 수 있습니다.
                      </span>
                    </div>
                  )}
                </div>

                {previewRows.length > 0 && courierHeaders.length > 0 && (
                  <p className="row-start-2 col-start-2 min-w-0 text-sm text-gray-500">
                    ✔ 셀을 클릭하면 수정할 수 있습니다.{' '}
                    ✔ 주소, 상품 등을 클릭하면 오름/내림차순 정렬됩니다.{' '}
                    ✔ 체크박스로 선택 후 삭제할 수 있습니다.
                  </p>
                )}
              </div>
            </div>
            {!previewReady || previewRows.length === 0 || courierHeaders.length === 0 ? (
              <div className="min-h-[192px] flex items-center justify-center text-gray-400 px-4 text-center text-sm leading-relaxed">
                {invoicePreviewGateMessage ??
                  (
                    <>
                      변환된 주문 데이터가 여기에 표시됩니다.
                      <br />
                      파일 크기·주문 건수·PC/인터넷 환경에 따라 처리 시간이 다소 걸릴 수 있습니다.
                    </>
                  )}
              </div>
            ) : (
              <>
                {/* unknownHeaders 경고 박스 */}
                {unknownHeadersWarning.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 p-4 rounded-lg text-sm text-amber-800 mx-6 mb-4">
                    <p className="font-semibold mb-2">
                      ⚠ 일부 항목을 자동으로 인식하지 못했습니다.
                    </p>

                    <p className="mb-2">
                      업로드한 파일의 항목 이름이 일반적인 택배 양식과 달라 일부 데이터가 자동으로 분류되지 않았습니다.
                    </p>

                    <div className="mb-2 text-blue-600 font-semibold text-base">
                      [인식되지 않은 항목]
                    </div>

                    <div className="text-xs mb-2">
                      (주문 엑셀 파일의 보내는분 / 받는분 / 주소 / 상품 등의 항목)
                    </div>

                    <div className="mb-3 text-blue-600 font-semibold text-base">
                      {unknownHeadersWarning.join(', ')}
                    </div>

                    <div className="text-xs text-amber-700 leading-relaxed">
                      <strong>이렇게 해결할 수 있습니다</strong><br />
                      • 항목 이름을 상품명 / 수량 / 주소 등 일반적인 이름으로 수정 후 다시 업로드<br />
                      • 또는 아래 미리보기에서 직접 수정 후 다운로드
                    </div>

                    <div className="mt-2 text-xs text-amber-800">
                      ※ 다운로드 전에 주문 정보가 올바르게 정리되었는지 확인해주세요.
                    </div>
                  </div>
                )}

                {/* 
                  미리보기 렌더링 데이터 소스: previewRows / courierHeaders
                  - courierHeaders 기준으로 전체 컬럼 구조 표시
                */}
                <div className={`border rounded-lg bg-white flex flex-col overflow-hidden mx-6 mb-6 ${
                  isPreviewExpanded ? 'max-h-[750px] h-auto' : 'h-[260px]'
                }`}>
                  <div className="flex flex-shrink-0 items-center gap-2 border-b bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-600">
                      헤더 체크박스를 선택하면 원하는 값을 설정할 수 있습니다. 미리보기에서 적용된 형식 그대로 업로드 파일이 생성됩니다.
                    </p>
                  </div>
                  <div
                    ref={previewScrollContainerRef}
                    onScroll={handlePreviewScroll}
                    className={`${isPreviewExpanded ? '' : 'flex-1'} overflow-auto min-h-0 preview-scrollbar`}
                    onMouseEnter={() => {
                      previewHoverPausedRef.current = true;
                    }}
                    onMouseLeave={() => {
                      previewHoverPausedRef.current = false;
                    }}
                  >
                    <table className="min-w-max text-sm border border-gray-300 border-collapse">
                      <thead className="bg-gray-50 sticky top-0 z-20">
                        <tr>
                          <th className="border border-gray-300 px-2 py-1 text-left font-semibold border-b whitespace-nowrap">
                            <input
                              type="checkbox"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRows(previewRows.map(row => row.rowId));
                                } else {
                                  setSelectedRows([]);
                                }
                              }}
                            />
                          </th>
                          {courierHeaders.map((header) => (
                            <th
                              key={header}
                              className="border border-gray-300 px-2 py-1 text-left font-semibold border-b whitespace-nowrap cursor-pointer select-none"
                              onClick={() => {
                                setSortConfig(prev => {
                                  if (!prev || prev.header !== header) {
                                    return { header, direction: 'asc' };
                                  }
                                  if (prev.direction === 'asc') {
                                    return { header, direction: 'desc' };
                                  }
                                  return null;
                                });
                              }}
                            >
                              <div className="flex items-center gap-1">
                                <span
                                  className={
                                    sortConfig?.header === header
                                      ? sortConfig.direction === 'asc'
                                        ? 'text-blue-600 font-semibold'
                                        : 'text-red-600 font-semibold'
                                      : ''
                                  }
                                >
                                  {header}
                                </span>

                                {sortConfig?.header === header && (
                                  <span
                                    className={
                                      sortConfig.direction === 'asc'
                                        ? 'text-blue-600 text-xs'
                                        : 'text-red-600 text-xs'
                                    }
                                  >
                                    {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {virtualTopSpacerHeight > 0 && (
                          <tr aria-hidden="true">
                            <td
                              colSpan={courierHeaders.length + 1}
                              style={{ height: `${virtualTopSpacerHeight}px`, padding: 0, border: 0 }}
                            />
                          </tr>
                        )}
                        {virtualRows.map((row) => {
                          const isNewRow = newRows.has(row.rowId);
                          return (
                          <tr
                            key={row.rowId}
                            className={`transition-colors
                              ${
                                selectedRows.includes(row.rowId)
                                  ? "bg-blue-100"
                                  : isNewRow
                                  ? "bg-green-100 animate-pulse"
                                  : "hover:bg-gray-50"
                              }
                            `}
                          >
                            <td className="border border-gray-300 px-2 py-1 border-b whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedRows.includes(row.rowId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRows(prev => [...prev, row.rowId]);
                                  } else {
                                    setSelectedRows(prev =>
                                      prev.filter(id => id !== row.rowId)
                                    );
                                  }
                                }}
                              />
                            </td>
                            {courierHeaders.map((header) => {
                              const cellValue = row.data[header] ?? '';
                              const overrideValue = userOverrides[row.rowId]?.[header];
                              const displayValue = overrideValue ?? cellValue;
                              
                              // 전화번호 필드인지 확인 (헤더 이름에 "전화" 포함)
                              const isPhoneField = header.includes('전화') || header.includes('phone');

                              if (editingCell?.rowId === row.rowId && editingCell?.header === header) {
                                return (
                                  <td key={header} className="border border-gray-300 px-2 py-1 border-b whitespace-nowrap bg-yellow-100">
                                    <input
                                      autoFocus
                                      className="w-full h-full border-0 p-0 bg-transparent outline-none text-sm"
                                      style={{ minHeight: '1.25rem' }}
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          commitCellEdit(row.rowId, header, editingValue);
                                          setEditingCell(null);
                                          setActiveCell(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingCell(null);
                                          setActiveCell(null);
                                        }
                                      }}
                                      onBlur={() => {
                                        commitCellEdit(row.rowId, header, editingValue);
                                        setEditingCell(null);
                                        setActiveCell(null);
                                      }}
                                    />
                                  </td>
                                );
                              }

                              const isActiveCell = activeCell?.rowId === row.rowId && activeCell?.header === header;
                              
                              return (
                                <td
                                  key={header}
                                  className={`border border-gray-300 px-2 py-1 border-b whitespace-nowrap cursor-pointer ${
                                    isActiveCell ? 'bg-yellow-100' : ''
                                  }`}
                                  onClick={() => {
                                    setEditingValue(displayValue);
                                    setActiveCell({ rowId: row.rowId, header });
                                    setEditingCell({ rowId: row.rowId, header });
                                  }}
                                >
                                  {isPhoneField ? formatPhoneDisplay(displayValue) : displayValue}
                                </td>
                              );
                            })}
                          </tr>
                          );
                        })}
                        {virtualBottomSpacerHeight > 0 && (
                          <tr aria-hidden="true">
                            <td
                              colSpan={courierHeaders.length + 1}
                              style={{ height: `${virtualBottomSpacerHeight}px`, padding: 0, border: 0 }}
                            />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 기능 설명 섹션 레이아웃 */}
        <section className="relative pt-4 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 lg:gap-3">
            {/* 카드 1: 쇼핑몰 송장 업로드 양식 */}
            <button
              type="button"
              onClick={handleOpenCourierTemplateModal}
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Truck className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">
                  쇼핑몰 송장 업로드 양식 등록
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                쇼핑몰에 송장을 넣을 때 쓰는 엑셀 양식을 등록합니다.
                <br />
                등록한 양식 열 구성에 맞춰 미리보기·다운로드가 만들어집니다.
              </p>
              {courierUploadTemplate && (
                <p className="mt-2 text-[11px] text-green-700 text-center line-clamp-1">
                  선택된 양식이 있습니다 (컬럼 {courierUploadTemplate.headers.length}개)
                </p>
              )}
            </button>

            {/* 카드 2: 고정입력 */}
            <button
              type="button"
              onClick={handleOpenSenderModal}
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Search className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">
                  고정 입력 정보 설정
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                택배사, 배송방법 등 모든 주문에 공통으로 적용되는 값을
                <br />
                미리 지정해 두면 매번 채우는 수고를 줄일 수 있습니다.
              </p>
            </button>

            {/* 카드 3: 송장 업로드 파일 다운로드 */}
            <button
              type="button"
              onClick={handleDownloadPreview}
              disabled={downloadStatus === "processing"}
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <ArrowDown className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">
                  송장 업로드 파일 다운로드
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                변환·매핑이 끝난 데이터를
                <br />
                쇼핑몰 송장 일괄 등록용 엑셀로 내려받습니다.
              </p>
            </button>
          </div>

          {/* 사용중 양식 표시 */}
          {isValidCourierTemplate(courierUploadTemplate) && courierUploadTemplate && (
            <div className="w-full mt-4">
              <p className="text-xs text-blue-600 w-full whitespace-nowrap overflow-hidden text-ellipsis">
                <span className="inline-block py-0.5 px-2 rounded-md text-xs font-medium bg-blue-50 text-blue-600">사용 중인 양식 :</span>{' '}
                {courierUploadTemplate.headers
                  .filter((header) => !header.isEmpty && header.name.trim() !== '')
                  .map((header) => header.name)
                  .join(' · ')}
              </p>
              {/* 고정 입력 정보 표시 */}
              {FIXED_HEADER_ORDER.some(headerName => fixedHeaderValues[headerName] && fixedHeaderValues[headerName].trim() !== '') && (
                <p className="text-xs text-blue-500 w-full whitespace-nowrap overflow-hidden text-ellipsis mt-1">
                  <span className="inline-block py-0.5 px-2 rounded-md text-xs font-medium bg-blue-50 text-blue-600">고정 입력 정보 :</span>{' '}
                  {FIXED_HEADER_ORDER
                    .filter(headerName => fixedHeaderValues[headerName] && fixedHeaderValues[headerName].trim() !== '')
                    .map(headerName => `${headerName} ${fixedHeaderValues[headerName]}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}
        </section>

      </main>

      {isCourierTemplateModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseCourierTemplateModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[900px] h-[798px] max-h-[798px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                업로드 양식 등록 선택
              </h2>
              <button
                onClick={handleCloseCourierTemplateModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            <div className="space-y-2 mb-6 overflow-y-auto flex-1 min-h-0">
              <div className="w-full px-4 py-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  이미 사용 중인 택배사 업로드 파일이 있으신가요?
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                  지금 택배사에 올리고 있는
                  <br />
                  업로드 엑셀을 한 번만 등록하면,
                  <br />
                  그 양식 그대로 자동 설정됩니다.
                </p>
                <input
                  ref={courierFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleTemplateFileInputChange}
                  className="hidden"
                />
                <button
                  onClick={handleTemplateFileClick}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-lg font-medium text-sm"
                >
                  내 업로드 파일 등록하기
                </button>
                {registrationSuccessMessage && (
                  <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                    {registrationSuccessMessage}
                  </p>
                )}
              </div>

              {Array.isArray(recentExcelFormats) && recentExcelFormats.length > 0 && (
                <div className="space-y-2 mt-4">
                  <button
                    onClick={() => setShowRecentTemplate(!showRecentTemplate)}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800 text-left hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                      등록된 양식
                      {recentExcelFormats.length > 0 ? ` (${recentExcelFormats.length})` : ''}
                    </span>
                  </button>

                  {showRecentTemplate &&
                    recentExcelFormats.map((format, index) => {
                      const savedDate = new Date(format.createdAt);
                      const dateStr = `${savedDate.getFullYear()}-${String(savedDate.getMonth() + 1).padStart(
                        2,
                        '0',
                      )}-${String(savedDate.getDate()).padStart(2, '0')} ${String(savedDate.getHours()).padStart(
                        2,
                        '0',
                      )}:${String(savedDate.getMinutes()).padStart(2, '0')}`;

                      const isEditing = editingFormatId === format.id;
                      const defaultDisplayName =
                        recentExcelFormats.length > 1 ? `등록된 엑셀 양식 ${index + 1}` : '등록된 엑셀 양식';

                      return (
                        <div
                          key={`${format.id}-${index}`}
                          className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-left transition-colors min-h-[120px]"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 pt-0.5">
                              <input
                                type="radio"
                                name="selectedFormat"
                                checked={tempSelectedFormatId === format.id}
                                onChange={() => handleTemplateSelect(format.id)}
                                className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 dark:bg-zinc-800"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1 min-w-0">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2 flex-nowrap">
                                      <input
                                        type="text"
                                        value={editingDisplayName}
                                        onChange={(e) => setEditingDisplayName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleConfirmEditName(format.id);
                                          } else if (e.key === 'Escape') {
                                            handleCancelEditName();
                                          }
                                        }}
                                        autoFocus
                                        className="w-[40%] min-w-[240px] px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                                        placeholder="양식 이름을 입력하세요"
                                      />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleConfirmEditName(format.id);
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs whitespace-nowrap"
                                      >
                                        확인
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCancelEditName();
                                        }}
                                        className="bg-white border border-gray-300 text-gray-900 px-3 py-1 rounded text-xs whitespace-nowrap"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                      {format.displayName || defaultDisplayName}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {!isEditing && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStartEditName(format);
                                        }}
                                        className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                      >
                                        이름 변경하기
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteFormat(format.id);
                                        }}
                                        className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                      >
                                        삭제
                                      </button>
                                    </>
                                  )}
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{dateStr}</span>
                                </div>
                              </div>

                              <div
                                className={`h-[22px] ${
                                  tempSelectedFormatId === format.id ? 'visible' : 'invisible'
                                }`}
                              >
                                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5 mb-1">
                                  ✔ 이 양식이 사용됩니다
                                </div>
                              </div>

                              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                {Array.isArray(format.columnOrder) && format.columnOrder.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {format.columnOrder.map((headerName, idx) => (
                                      <span
                                        key={`${headerName}-${idx}`}
                                        className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                      >
                                        {headerName || '(빈 헤더)'}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-zinc-400 dark:text-zinc-500">헤더 정보 없음</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                등록된 양식은 브라우저에 안전하게 저장되며, 이 페이지에서만 사용됩니다.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseCourierTemplateModal}
                  className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCourierTemplateModal}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 더미 없음 안내 모달 */}
      {isEmptyDataModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseEmptyDataModal}
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[600px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                이 파일로는 정보를 어디에 넣어야 할지 알기 어려워요
              </h2>
              <button
                onClick={handleCloseEmptyDataModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto mb-6">
              {/* 안내 텍스트 */}
              <div className="mb-4">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
                  아래 예시처럼 연락처·주소·상품 등등 입력되거나 모든 항목을 채울 필요는 없지만
                  <br />
                  꼭 입력이 필요한곳은 위치 확인이 가능하도록 표시된 상태로 저장한 뒤 다시 업로드해 주세요.
                  <br />
                  <br />
                  💡 최근에 실제 주문이 들어온 택배사 업로드 엑셀 파일이 있다면 그 파일을 그대로 올려주셔도 됩니다. 양식 등록 용도이며 고객 정보는 저장·사용되지 않습니다
                </p>
              </div>

              {/* 엑셀 템플릿 예시 이미지 */}
              <div className="mb-4">
                <img 
                  src="/excel-template-example.jpg" 
                  alt="엑셀 템플릿 예시"
                  className="w-full border rounded-md"
                />
              </div>

              {/* 안내 문구 */}
              <div className="mb-4 text-center">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  ⬆ 위 예시처럼 주문 정보가 들어갈 위치에  입력 → 저장 → 다시 업로드
                </p>
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <button
                onClick={handleCloseEmptyDataModal}
                className="flex-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 h-11 rounded-lg font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 택배 업로드 양식 없음 안내 모달 */}
      {isNoTemplateModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseNoTemplateModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[600px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                택배 업로드 양식 등록 필요
              </h2>
              <button
                onClick={handleCloseNoTemplateModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto mb-6">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
                택배 업로드 양식을 먼저 등록해야 고정 입력 설정이 가능합니다.
              </p>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <button
                onClick={handleCloseNoTemplateModal}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                닫기
              </button>
              <button
                onClick={handleOpenCourierTemplateFromNoTemplateModal}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white font-medium"
              >
                택배 업로드 양식 등록하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 고정 입력 정보 설정 모달 */}
      {isSenderModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseSenderModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[1482px] h-[84vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                고정 입력 정보 설정
              </h2>
              <button
                onClick={handleCloseSenderModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 통합 안내 문구 */}
            <div className="mb-6 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                모든 주문에 동일하게 적용할 보내는 사람 정보를 설정합니다.
                <br />
                고정 입력은 선택 기능이며, 모든 주문에 동일한 정보가 있을 때만 설정하면 됩니다.
              </p>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto min-h-[400px] pb-2">

              {/* 고정 입력 버튼 영역 */}
              <div className="flex flex-wrap gap-5 mb-6 max-h-[280px] overflow-y-auto">
                {isValidCourierTemplate(courierUploadTemplate) && FIXED_HEADER_ORDER.length > 0 ? (
                  FIXED_HEADER_ORDER.map((headerName, mapIndex) => {
                    // FIXED_HEADER_ORDER의 헤더명으로 courierUploadTemplate.headers에서 헤더와 인덱스 찾기
                    const headerIndex = courierUploadTemplate?.headers?.findIndex(h => h.name === headerName) ?? -1;
                    if (headerIndex === -1) return null;
                    const header = courierUploadTemplate?.headers?.[headerIndex];
                    if (!header) return null;
                    
                    const index = headerIndex;
                    const isEditing = editingHeaderIndex === index;
                    // 값 가져오기: headerInputValues 우선, 없으면 fixedHeaderValues에서
                    const savedValue = fixedHeaderValues[headerName] || '';
                    const inputValue = headerInputValues[index] !== undefined ? headerInputValues[index] : savedValue;
                    // 실제 입력값이 있는지 확인 (공백 제외)
                    const savedValueTrimmed = fixedHeaderValues[headerName]?.trim() || '';
                    const inputValueTrimmed = headerInputValues[index]?.trim() || '';
                    const hasValue = savedValueTrimmed !== '' || (headerInputValues[index] !== undefined && inputValueTrimmed !== '');

                    if (isEditing) {
                      // 입력 모드 UI
                      return (
                        <div
                          key={`${headerName}-${mapIndex}`}
                          className="flex items-center gap-2 px-5 py-2 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800"
                        >
                          <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => {
                              setHeaderInputValues(prev => ({
                                ...prev,
                                [index]: e.target.value
                              }));
                            }}
                            className="flex-1 min-w-[120px] px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            placeholder="입력"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                // 확인 버튼 클릭과 동일한 동작
                                const headerName = header.name;
                                const inputValue = headerInputValues[index] || '';
                                setFixedHeaderValues(prev => ({
                                  ...prev,
                                  [headerName]: inputValue
                                }));
                                setEditingHeaderIndex(null);
                              } else if (e.key === 'Escape') {
                                // 취소 버튼 클릭과 동일한 동작
                                setEditingHeaderIndex(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              // 확인: 입력 모드 종료 및 fixedHeaderValues에 저장
                              const headerName = header.name;
                              const inputValue = headerInputValues[index] || '';
                              setFixedHeaderValues(prev => ({
                                ...prev,
                                [headerName]: inputValue
                              }));
                              setEditingHeaderIndex(null);
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // 취소: 입력 모드 종료, 입력값 복원
                              setEditingHeaderIndex(null);
                            }}
                            className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded text-sm font-medium transition-colors"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // 삭제: fixedHeaderValues에서 해당 key 제거, headerInputValues에서 해당 항목 제거
                              const headerName = header.name;
                              setFixedHeaderValues(prev => {
                                const newValues = { ...prev };
                                delete newValues[headerName];
                                return newValues;
                              });
                              setHeaderInputValues(prev => {
                                const newValues = { ...prev };
                                delete newValues[index];
                                return newValues;
                              });
                            }}
                            className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded text-sm font-medium transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      );
                    }

                    // 일반 모드 UI
                    return (
                      <button
                        key={`${headerName}-${mapIndex}`}
                        type="button"
                        className={`px-6 py-2 rounded-lg font-medium cursor-pointer flex flex-col items-center transition-colors relative ${
                          hasValue
                            ? 'border border-zinc-300 dark:border-zinc-700 bg-blue-50 dark:bg-blue-950/30 text-zinc-900 dark:text-zinc-100 hover:bg-blue-100 dark:hover:bg-blue-950/50'
                            : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                        }`}
                        onClick={() => {
                          // 입력 모드로 전환
                          setEditingHeaderIndex(index);
                          // 기존 입력값이 없으면 fixedHeaderValues에서 복원하거나 빈 문자열로 초기화
                          if (headerInputValues[index] === undefined) {
                            const savedValue = fixedHeaderValues[headerName] || '';
                            setHeaderInputValues(prev => ({
                              ...prev,
                              [index]: savedValue
                            }));
                          }
                        }}
                      >
                        {hasValue && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-sm">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        {hasValue ? (
                          <>
                            <span className="text-base">{inputValue}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              (표기: {header.name})
                            </span>
                          </>
                        ) : (
                          <span className="text-base">{header.name}</span>
                        )}
                      </button>
                    );
                  }).filter(Boolean)
                ) : (
                  <div className="text-zinc-500 dark:text-zinc-400 text-sm w-full">
                    등록된 업로드 양식이 없습니다.
                  </div>
                )}
              </div>
              
              {/* 고정 입력 안내 영역 */}
              {isValidCourierTemplate(courierUploadTemplate) && FIXED_HEADER_ORDER.some(headerName => fixedHeaderValues[headerName] && fixedHeaderValues[headerName].trim() !== '') && (
                <div className="mt-4 mb-2 p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">
                    현재 설정된 고정 입력 값
                  </h3>
                  <div className="space-y-1.5 mb-3">
                    {FIXED_HEADER_ORDER
                      .filter(headerName => fixedHeaderValues[headerName] && fixedHeaderValues[headerName].trim() !== '')
                      .map((headerName, index) => (
                        <div key={`${headerName}-${index}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          • {headerName}: {fixedHeaderValues[headerName]}
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    설정된 고정 입력 값은 택배 업로드 파일 다운로드 시 자동으로 입력됩니다.
                  </p>
                </div>
              )}
            </div>

            {/* 모달 하단 버튼 */}
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <button
                onClick={handleCloseSenderModal}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-lg font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 다운로드 상태 모달 */}
      {downloadStatus !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-[400px] p-6 text-center">

            {downloadStatus === "processing" && (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700 mx-auto mb-4" />
                <p className="font-semibold">파일 생성 중입니다...</p>
                <p className="text-sm text-gray-500 mt-2">
                  잠시만 기다려주세요.
                </p>
              </>
            )}

            {downloadStatus === "done" && (
              <>
                <p className="text-lg font-semibold mb-3">
                  다운로드 완료
                </p>
                <p className="text-sm text-gray-700 mb-2">
                  {downloadModalFileName}
                </p>
                <p className="text-xs text-gray-500">
                  파일은 다운로드 폴더에서 확인하실 수 있습니다.
                </p>
              </>
            )}

          </div>
        </div>
      )}
    </div>
    </>
  );
}

