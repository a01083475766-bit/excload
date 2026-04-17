/**
 * ⚠️ EXCLOAD CONSTITUTION v4.0 적용 파일
 * 모든 수정 전 CONSTITUTION.md 필독
 * 3단계 분리 파이프라인 유지 필수
 * 기준헤더 내부 전용, UI 노출 금지
 */

'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Truck, Search, ArrowDown, Image, X, Check, Upload, Loader2 } from 'lucide-react';
import { runTemplatePipeline } from '@/app/pipeline/template/template-pipeline';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { ExcelPreprocessPipeline } from '@/app/pipeline/preprocess/excel-preprocess-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';
import { runMergePipeline } from '@/app/pipeline/merge/merge-pipeline';
import type { PreviewRow } from '@/app/pipeline/merge/types';
import * as XLSX from 'xlsx';
import {
  alignRowsFromHeader,
  detectHeaderRowIndex,
  filterNonEmptyRows,
  readFirstSheetMatrixFromArrayBuffer,
} from '@/app/lib/excel/sheet-header';
import type { UnifiedInputPipelineResult } from '@/app/unified-input/adapters/runUnifiedInputOrderPipelines';
import { extractTextFromImage } from '@/app/unified-input/adapters/ImageToTextAdapter';
import { runTextToCleanInputAdapter } from '@/app/unified-input/adapters/TextToCleanInputAdapter';
import { runUnifiedInputOrderPipelines } from '@/app/unified-input/adapters/runUnifiedInputOrderPipelines';
import { formatPhoneDisplay } from '@/app/utils/format-phone';
import { useHistoryStore } from '@/app/store/historyStore';
import type { SourceType, FileMetadata, SenderInfo } from '@/app/store/historyStore';
import { useUserStore } from '@/app/store/userStore';
import { Coins } from 'lucide-react';
import {
  NormalizeQualityNoticeModal,
  isLikelyClientNetworkError,
} from '@/app/components/NormalizeQualityNoticeModal';

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
    const stored = localStorage.getItem('onc_courier_template_v1');
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
      localStorage.setItem('onc_courier_template_v1', JSON.stringify(template));
    } else {
      localStorage.removeItem('onc_courier_template_v1');
    }
  } catch (error) {
    console.error('localStorage에 택배 양식 정보를 저장하는 중 오류 발생:', error);
  }
};

const loadRecentExcelFormats = (): RecentExcelFormat[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('recent_excel_formats_v1');
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
    localStorage.setItem('recent_excel_formats_v1', JSON.stringify(updatedFormats));
    setRecentExcelFormats(updatedFormats);
    return newFormat.id;
  } catch (error) {
    console.error('localStorage에 최근 사용 엑셀 양식을 저장하는 중 오류 발생:', error);
    return null;
  }
};

export default function OrderConvertPage() {
  const router = useRouter();
  const connectedMalls = ['coupang']; // 테스트용
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
  const [noTemplateModalType, setNoTemplateModalType] = useState<'fixed-input' | 'convert'>('fixed-input');
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
      const saved = localStorage.getItem('orderConvert_fixed_header_values_v1');
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
  const [newRows, setNewRows] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  
  // 텍스트 주문 변환용 상태
  const [textInput, setTextInput] = useState('');
  const [isProcessingTextImage, setIsProcessingTextImage] = useState(false);
  const [errorMessageTextImage, setErrorMessageTextImage] = useState<string | null>(null);
  const [qualityNoticeModal, setQualityNoticeModal] = useState<
    'hidden' | 'heuristic' | 'network'
  >('hidden');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showTextConvertModal, setShowTextConvertModal] = useState(false);
  const [dontShowToday, setDontShowToday] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [screenshotStage, setScreenshotStage] = useState<
    'idle' | 'processing' | 'completed'
  >('idle');

  // 사용자 정보 가져오기 (컴포넌트 마운트 시)
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
  const [screenshotImagePreview, setScreenshotImagePreview] = useState<string | null>(null);
  const [showTextProcessingModal, setShowTextProcessingModal] = useState(false);
  const [textProcessingSource, setTextProcessingSource] = useState<'screenshot' | 'imageFile'>('screenshot');
  const [downloadModalFileName, setDownloadModalFileName] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "processing" | "done">("idle");
  const [unknownHeadersWarning, setUnknownHeadersWarning] = useState<string[]>([]);
  const [fileProcessingStatus, setFileProcessingStatus] = useState<"idle" | "processing" | "done">("idle");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [processingDots, setProcessingDots] = useState("");
  const [textProcessingDots, setTextProcessingDots] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // 입력 방식 추적: 사용자가 어떤 방식으로 입력했는지 기록
  const [inputSourceType, setInputSourceType] = useState<'excel' | 'image' | 'text' | null>(null);

  const courierFileInputRef = useRef<HTMLInputElement | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  /** 텍스트 변환 중복 클릭·사용량 차감 이중 호출 방지 (await 전에 state가 안 올라가는 레이스 대비) */
  const textConvertInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const screenshotPasteAreaRef = useRef<HTMLDivElement | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  // 고정 헤더 순서 배열 (courierUploadTemplate.headers 기준)
  const FIXED_HEADER_ORDER = useMemo(() => {
    if (courierUploadTemplate && Array.isArray(courierUploadTemplate.headers) && courierUploadTemplate.headers.length > 0) {
      return courierUploadTemplate.headers.map(header => header.name);
    }
    return [];
  }, [courierUploadTemplate]);

  // 정렬된 배열 계산
  const sortedRows = useMemo(() => {
    if (!sortConfig) return previewRows;

    const { header, direction } = sortConfig;

    return [...previewRows].sort((a, b) => {
      const aValue =
        userOverrides[a.rowId]?.[header] ??
        a.data[header] ??
        '';

      const bValue =
        userOverrides[b.rowId]?.[header] ??
        b.data[header] ??
        '';

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [previewRows, sortConfig, userOverrides]);

  // fixedHeaderValues를 localStorage에 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('orderConvert_fixed_header_values_v1', JSON.stringify(fixedHeaderValues));
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
        const saved = localStorage.getItem('activeCourierBridgeFile');
        if (saved) {
          const parsed = JSON.parse(saved) as TemplateBridgeFile;
          // 개인통관번호 기준헤더 추가로 인해, 과거(구버전) 템플릿 캐시의
          // mappedBaseHeaders가 null/누락 상태일 수 있습니다.
          // 이 경우 템플릿을 강제로 재생성하도록 캐시 무효화합니다.
          const pcccIndex = parsed?.courierHeaders?.findIndex((h) =>
            /개인통관번호|PCCC/i.test(String(h ?? ''))
          ) ?? -1;
          const pcccMapped =
            pcccIndex >= 0 ? parsed?.mappedBaseHeaders?.[pcccIndex] : null;

          // PCCC 열이 템플릿에 없으면(대부분 양식) 그대로 복원. 있을 때만 구버전(null 등) 매핑이면 무효화.
          const needsPcccMigration =
            pcccIndex >= 0 && pcccMapped !== '개인통관번호';

          if (needsPcccMigration) {
            localStorage.removeItem('activeCourierBridgeFile');
            setTemplateBridgeFile(null);
          } else {
            setTemplateBridgeFile(parsed);
          }
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
  }, [templateBridgeFile]);

  // 점 애니메이션 처리 (파일 처리용)
  useEffect(() => {
    if (fileProcessingStatus !== "processing") return;

    const interval = setInterval(() => {
      setProcessingDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [fileProcessingStatus]);

  // 점 애니메이션 처리 (텍스트 변환용)
  useEffect(() => {
    if (!isProcessingTextImage) {
      setTextProcessingDots("");
      return;
    }

    const interval = setInterval(() => {
      setTextProcessingDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [isProcessingTextImage]);

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
            'activeCourierBridgeFile',
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
      localStorage.setItem('recent_excel_formats_v1', JSON.stringify(updatedFormats));
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
            'activeCourierBridgeFile',
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
              localStorage.removeItem('activeCourierBridgeFile');
              setTemplateBridgeFile(null);
            } catch (error) {
              console.error('localStorage에서 bridgeFile을 삭제하는 중 오류 발생:', error);
            }
          }
        }
      }
      
      const updatedFormats = formats.filter((format) => format.id !== formatId);
      localStorage.setItem('recent_excel_formats_v1', JSON.stringify(updatedFormats));
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
      setNoTemplateModalType('fixed-input');
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
      files.forEach(file => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const fileType = file.type;
        
      // 엑셀 파일 처리
      if (extension === 'xlsx' || extension === 'xls') {
        // 택배 업로드 양식이 없는 경우 안내 모달 표시
        if (!isValidCourierTemplate(courierUploadTemplate)) {
          setNoTemplateModalType('convert');
          setIsNoTemplateModalOpen(true);
          return;
        }
        if (!uploadedFileMeta.some(f => f.name === file.name && f.size === file.size)) {
          setUploadedExcelFile(file);
          parseExcelFile(file);
        }
      }
      // 이미지 파일 처리 (이미지 변환)
      else if (extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'gif' || extension === 'webp' || 
               fileType.startsWith('image/')) {
        handleImageFileSelect(file);
      }
      });
    }
    // input 초기화하여 같은 파일을 다시 선택할 수 있도록 함
    if (e.target) {
      e.target.value = '';
    }
  };

  // 이미지 파일 선택 및 OCR 자동 실행 (이미지 변환)
  const handleImageFileSelect = async (file: File) => {
    setSelectedImage(file);
    setInputSourceType('image'); // 이미지 업로드로 입력 방식 기록
    setErrorMessageTextImage(null);

    // 텍스트 정리 중 모달 열기 (이미지 파일로 표시)
    setTextProcessingSource('imageFile');
    setShowTextProcessingModal(true);
    setScreenshotStage('processing');

    try {
      setIsProcessingTextImage(true);

      const ocrText = await extractTextFromImage(file);

      // 기존 텍스트 입력 state 이름에 맞게 수정
      setTextInput(ocrText);

      // 처리 완료 상태로 변경
      setScreenshotStage('completed');

    } catch (error) {
      setErrorMessageTextImage(
        error instanceof Error ? error.message : 'OCR 처리 중 오류가 발생했습니다.'
      );
      setScreenshotStage('idle');
      setShowTextProcessingModal(false);
    } finally {
      setIsProcessingTextImage(false);
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 스크린샷 주문변환 모달 닫기
  const handleScreenshotModalClose = () => {
    // 처리 중단 플래그 설정
    if (screenshotStage === 'processing') {
      isCancelledRef.current = true;
    }
    
    setShowScreenshotModal(false);
    setScreenshotImagePreview(null);
    setScreenshotStage('idle');
    setErrorMessageTextImage(null);
    isCancelledRef.current = false;
  };

  // 클립보드 붙여넣기 처리
  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    const items = e.clipboardData.items;
    let imageFound = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 이미지 타입 확인
      if (item.type.indexOf('image') !== -1) {
        imageFound = true;
        const blob = item.getAsFile();
        if (blob) {
          // 스크린샷 모달 닫기
          setShowScreenshotModal(false);
          
          // 텍스트 정리 중 모달 열기
          setShowTextProcessingModal(true);
          
          // 이미지 처리 시작
          await handleScreenshotImageProcess(blob);
        }
        break;
      }
    }

    // 이미지가 없으면 contentEditable 내용 제거
    if (!imageFound && screenshotPasteAreaRef.current) {
      setTimeout(() => {
        if (screenshotPasteAreaRef.current) {
          screenshotPasteAreaRef.current.textContent = '';
          screenshotPasteAreaRef.current.innerHTML = '';
        }
      }, 0);
    }
  };

  // contentEditable에서 텍스트 입력 방지 (이미지 미리보기는 유지)
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    // contentEditable의 텍스트만 제거 (이미지 미리보기는 state로 관리되므로 유지됨)
    // 이미지 미리보기가 있을 때는 contentEditable 내용을 제거하지 않음
    // (이미지 미리보기가 state로 표시되므로 contentEditable 내용은 무시)
    if (screenshotPasteAreaRef.current && screenshotStage === 'idle') {
      // idle에서만 contentEditable 텍스트 제거
      screenshotPasteAreaRef.current.textContent = '';
      screenshotPasteAreaRef.current.innerHTML = '';
    }
  };

  // 스크린샷 이미지 처리 및 텍스트 추출
  const handleScreenshotImageProcess = async (blob: Blob) => {
    // 취소 플래그 초기화
    isCancelledRef.current = false;
    
    // 텍스트 정리 중 모달 열기 (스크린샷으로 표시)
    setTextProcessingSource('screenshot');
    setShowTextProcessingModal(true);
    setScreenshotStage('processing');
    setInputSourceType('image'); // 스크린샷 주문변환으로 입력 방식 기록
    setErrorMessageTextImage(null);

    try {
      // Blob을 File로 변환
      const file = new File([blob], 'screenshot.png', { type: 'image/png' });

      // 기존 OCR 로직 사용 (extractTextFromImage)
      const extractedText = await extractTextFromImage(file);

      // 취소 여부 확인
      if (isCancelledRef.current) {
        setScreenshotStage('idle');
        setShowTextProcessingModal(false);
        return;
      }

      if (extractedText && extractedText.trim()) {
        // 취소 여부 재확인
        if (isCancelledRef.current) {
          setScreenshotStage('idle');
          setShowTextProcessingModal(false);
          return;
        }

        // 텍스트 주문입력 textarea에 결과 입력
        setTextInput(extractedText);
        
        // 처리 완료 상태로 변경
        setScreenshotStage('completed');
        // 모달은 완료 상태로 유지 (사용자가 확인 버튼을 눌러야 닫힘)
      } else {
        if (!isCancelledRef.current) {
          setErrorMessageTextImage('이미지에서 텍스트를 추출할 수 없습니다.');
          setScreenshotStage('idle');
          setShowTextProcessingModal(false);
        }
      }
    } catch (error) {
      if (!isCancelledRef.current) {
        console.error('[OrderConvertPage] 스크린샷 이미지 처리 중 오류:', error);
        setErrorMessageTextImage(
          error instanceof Error ? error.message : '이미지 처리 중 오류가 발생했습니다.'
        );
        setScreenshotStage('idle');
        setShowTextProcessingModal(false);
      }
    }
  };

  // 모달 열릴 때 취소 플래그 초기화 및 붙여넣기 이벤트 리스너 등록
  useEffect(() => {
    if (showScreenshotModal) {
      // 모달이 열릴 때 취소 플래그 및 상태 초기화
      isCancelledRef.current = false;
      setScreenshotStage('idle');
      setErrorMessageTextImage(null);
    }

    if (showScreenshotModal && screenshotPasteAreaRef.current) {
      const pasteArea = screenshotPasteAreaRef.current;
      
      const handlePasteEvent = async (e: ClipboardEvent) => {
        e.preventDefault();
        const items = e.clipboardData?.items;
        let imageFound = false;

        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item.type.indexOf('image') !== -1) {
              imageFound = true;
              const blob = item.getAsFile();
              if (blob) {
                // 스크린샷 모달 닫기
                setShowScreenshotModal(false);
                
                // 텍스트 정리 중 모달 열기
                setShowTextProcessingModal(true);
                
                // 이미지 처리 시작
                await handleScreenshotImageProcess(blob);
              }
              break;
            }
          }
        }

        // 이미지가 없으면 contentEditable 내용 제거
        if (!imageFound && screenshotPasteAreaRef.current) {
          setTimeout(() => {
            if (screenshotPasteAreaRef.current) {
              screenshotPasteAreaRef.current.textContent = '';
              screenshotPasteAreaRef.current.innerHTML = '';
            }
          }, 0);
        }
      };

      pasteArea.addEventListener('paste', handlePasteEvent);
      pasteArea.focus();

      return () => {
        pasteArea.removeEventListener('paste', handlePasteEvent);
      };
    }
  }, [showScreenshotModal]);
  
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
      console.error('[OrderConvertPage] 사용량 차감 중 오류:', error);
      return false;
    }
  };

  // 텍스트 주문 변환 처리 (실제 변환 로직)
  const handleTextConvert = async () => {
    if (textConvertInFlightRef.current || isProcessingTextImage) {
      return;
    }
    setErrorMessageTextImage(null);

    // 택배 업로드 양식이 없는 경우 안내 모달 표시
    if (!isValidCourierTemplate(courierUploadTemplate)) {
      setNoTemplateModalType('convert');
      setIsNoTemplateModalOpen(true);
      return;
    }

    const trimmed = textInput.trim();
    if (!trimmed) {
      setErrorMessageTextImage('변환할 텍스트를 입력해 주세요.');
      return;
    }

    const textLength = trimmed.length;

    if (!user) {
      alert('로그인이 필요합니다.');
      router.push('/auth/login');
      return;
    }

    if (user.points < textLength) {
      setErrorMessageTextImage('사용량이 부족합니다');
      return;
    }

    textConvertInFlightRef.current = true;
    setIsProcessingTextImage(true);
    try {
      const pointsDeducted = await usePoints(textLength, 'text');
      if (!pointsDeducted) {
        return;
      }

      if (!selectedImage) {
        setInputSourceType('text');
      }

      const adapterResult = await runTextToCleanInputAdapter(trimmed);
      const { normalizeMeta, ...cleanInputFile } = adapterResult;
      if (cleanInputFile) {
        const fileSessionId = crypto.randomUUID();
        const pipelineResult = await runUnifiedInputOrderPipelines({
          cleanInputFile: {
            ...cleanInputFile,
            headers: [...cleanInputFile.headers],
            rows: cleanInputFile.rows.map((r) => [...r]),
          },
          templateBridgeFile,
          fixedHeaderValues,
          fileSessionId,
        });

        handleUnifiedPipelinesCompleted(pipelineResult);

        setTextInput('');
        if (normalizeMeta.usedFallback) {
          setQualityNoticeModal('heuristic');
        }
      } else {
        setErrorMessageTextImage('텍스트 주문 변환에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('[OrderConvertPage] 텍스트 주문 변환 중 오류:', error);
      if (isLikelyClientNetworkError(error)) {
        setQualityNoticeModal('network');
      }
      setErrorMessageTextImage(
        error instanceof Error ? error.message : '텍스트를 변환하는 중 알 수 없는 오류가 발생했습니다.'
      );
    } finally {
      setIsProcessingTextImage(false);
      textConvertInFlightRef.current = false;
    }
  };

  // 텍스트 주문 변환 실행 (모달 확인 후 호출)
  const executeTextConvert = async () => {
    // 오늘은 보지 않기 체크 시 localStorage에 저장
    if (dontShowToday) {
      const today = new Date().toDateString();
      localStorage.setItem("hideTextConvertModal", today);
    }
    setShowTextConvertModal(false);
    setDontShowToday(false); // 체크박스 초기화
    await handleTextConvert();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) {
      return;
    }

    // 파일 타입별로 분류 처리
    files.forEach(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileType = file.type;
      
      // 엑셀 파일 처리
      if (extension === 'xlsx' || extension === 'xls') {
        // 택배 업로드 양식이 없는 경우 안내 모달 표시
        if (!isValidCourierTemplate(courierUploadTemplate)) {
          setNoTemplateModalType('convert');
          setIsNoTemplateModalOpen(true);
          return;
        }
        if (!uploadedFileMeta.some(f => f.name === file.name && f.size === file.size)) {
          setUploadedExcelFile(file);
          parseExcelFile(file);
        }
      }
      // 이미지 파일 처리 (이미지 변환)
      else if (extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'gif' || extension === 'webp' || 
               fileType.startsWith('image/')) {
        handleImageFileSelect(file);
      }
      else {
        alert(`지원하지 않는 파일 형식입니다: ${extension || fileType}`);
      }
    });
  };

  const parseExcelFile = async (file: File) => {
    setFileProcessingStatus("processing");
    setInputSourceType('excel'); // 엑셀 업로드로 입력 방식 기록
    
    const newOrderSessionId = crypto.randomUUID();
    setOrderFileSessionId(newOrderSessionId);

    // 중복 검사 로직
    if (uploadedFileMeta.some(
      f => f.name === file.name && f.size === file.size
    )) {
      alert('이미 업로드된 파일입니다.');
      return;
    }

    const buffer = await file.arrayBuffer();
    const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);

    const filteredRows = filterNonEmptyRows(rawData);
    const headerIndex = detectHeaderRowIndex(filteredRows);
    const alignedRawData = alignRowsFromHeader(filteredRows, headerIndex);

    // ExcelPreprocessPipeline(Stage0)을 통과하여 CleanInputFile 생성
    const preprocessPipeline = new ExcelPreprocessPipeline();
    const cleanInputFile = preprocessPipeline.run(alignedRawData);

    // Stage2 실행 (서버 API 호출)
    const response = await fetch('/api/order-pipeline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...cleanInputFile,
        fileSessionId: newOrderSessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stage2 실행 실패: ${response.statusText}`);
    }

    const stage2Result = await response.json();

    // 디버그: 개인통관번호(PCCC) 값이 Stage2(OrderStandardFile)에 실제로 들어가는지 확인
    // (콘솔에서 Stage2 값/Stage3 미리보기 값을 바로 대조할 수 있게 PCCC만 최소 로그)
    try {
      const pcccBaseHeader = '개인통관번호';
      const includes =
        Array.isArray(stage2Result?.baseHeaders) &&
        stage2Result.baseHeaders.includes(pcccBaseHeader);
      const row0 = String(stage2Result?.rows?.[0]?.[pcccBaseHeader] ?? '');

      // eslint-disable-next-line no-console
      console.log(
        `[EXCLOAD][DEBUG][PCCC] Stage2 baseHeadersHas=${includes} row0=${row0}`
      );

      if (typeof window !== 'undefined') {
        (window as any).__EXCLOUD_PCCC_STAGE2 = {
          baseHeadersHas: includes,
          row0,
          rowsCount: stage2Result?.rows?.length ?? 0,
        };
      }
    } catch {
      // 로그 실패는 무시
    }

    // Stage2 완료 직후 상태 설정
    setFileProcessingStatus("done");
    setTimeout(() => {
      setFileProcessingStatus("idle");
    }, 1500);
    
    // unknownHeaders 처리
    if (stage2Result.unknownHeaders?.length > 0) {
      setUnknownHeadersWarning(stage2Result.unknownHeaders);
    } else {
      setUnknownHeadersWarning([]);
    }
    
    // orderStandardFile 상태는 유지하되, 누적하지 않음 (파일 단위 처리)
    setOrderStandardFile(stage2Result);
    
    // Stage3 실행 (handleExcelUpload 내부에서만 실행)
    if (templateBridgeFile) {
      const stage3Result = await runMergePipeline(
        templateBridgeFile,
        stage2Result,     // ❗ 누적 전체 아님, 현재 파일의 stage2Result만 전달
        fixedHeaderValues
      );

      // 디버그: 개인통관번호(PCCC) 값이 Stage3 미리보기(=previewRows)로도 넘어오는지 확인
      try {
        const pcccCourierHeader =
          stage3Result?.courierHeaders?.find((h) =>
            /개인통관번호|PCCC/i.test(String(h))
          ) ?? null;
        const previewRow0 =
          pcccCourierHeader
            ? String(stage3Result?.previewRows?.[0]?.[pcccCourierHeader] ?? '')
            : '';

        const idx = pcccCourierHeader
          ? templateBridgeFile.courierHeaders.indexOf(pcccCourierHeader)
          : -1;
        const mappedBaseHeader =
          idx >= 0 ? templateBridgeFile.mappedBaseHeaders[idx] ?? null : null;

        // eslint-disable-next-line no-console
        console.log(
          `[EXCLOAD][DEBUG][PCCC] Stage3 courierHeader=${pcccCourierHeader} mappedBase=${mappedBaseHeader} previewRow0=${previewRow0}`
        );

        if (typeof window !== 'undefined') {
          (window as any).__EXCLOUD_PCCC_STAGE3 = {
            courierHeader: pcccCourierHeader,
            mappedBase: mappedBaseHeader,
            previewRow0,
            previewRowsCount: stage3Result?.previewRows?.length ?? 0,
          };
        }
      } catch {
        // 로그 실패는 무시
      }
      
      // previewRows 상단 prepend 구조 적용
      const newRowIds = stage3Result.previewRows.map(() => crypto.randomUUID());
      setPreviewRows(prev => [
        ...stage3Result.previewRows.map((row, index) => ({
          rowId: newRowIds[index],
          data: row
        })),
        ...prev
      ]);
      
      // 새로 생성된 행을 newRows에 추가
      setNewRows(prev => {
        const updated = new Set(prev);
        newRowIds.forEach(id => updated.add(id));
        return updated;
      });
      
      // 3초 후 자동 제거
      setTimeout(() => {
        setNewRows(prev => {
          const updated = new Set(prev);
          newRowIds.forEach(id => updated.delete(id));
          return updated;
        });
      }, 3000);
      
      setCourierHeaders(stage3Result.courierHeaders);

      // Stage3 성공 후 메타데이터 저장
      setUploadedFileMeta(prev => [
        { name: file.name, size: file.size },
        ...prev
      ]);
    } else {
      console.warn('[UI] Stage3 실행 불가: templateBridgeFile이 없습니다.');
    }
    
    if (typeof window !== 'undefined') {
      (window as any).__lastOrderResult = stage2Result;
      (window as any).__lastOrderFile = file.name;
    }
  };
  
  const handleUnifiedPipelinesCompleted = (result: UnifiedInputPipelineResult) => {
    if (!result.mergeResult) {
      return;
    }

    // unknownHeaders 처리
    if (result.orderStandardFile?.unknownHeaders?.length > 0) {
      setUnknownHeadersWarning(result.orderStandardFile.unknownHeaders);
    } else {
      setUnknownHeadersWarning([]);
    }

    const { courierHeaders: mergedCourierHeaders, previewRows: mergedPreviewRows } = result.mergeResult;

    // Stage3 결과를 현재 미리보기 상단에 추가
    const newRowIds = mergedPreviewRows.map(() => crypto.randomUUID());
    setPreviewRows(prev => [
      ...mergedPreviewRows.map((row, index) => ({
        rowId: newRowIds[index],
        data: row,
      })),
      ...prev,
    ]);
    
    // 새로 생성된 행을 newRows에 추가
    setNewRows(prev => {
      const updated = new Set(prev);
      newRowIds.forEach(id => updated.add(id));
      return updated;
    });
    
    // 3초 후 자동 제거
    setTimeout(() => {
      setNewRows(prev => {
        const updated = new Set(prev);
        newRowIds.forEach(id => updated.delete(id));
        return updated;
      });
    }, 3000);

    setCourierHeaders(mergedCourierHeaders);
  };

  const handleDownloadPreview = async () => {
    if (!courierHeaders || courierHeaders.length === 0) {
      alert("택배사 양식을 먼저 등록해주세요.");
      return;
    }

    if (!sortedRows || sortedRows.length === 0) {
      alert("다운로드할 주문 데이터가 없습니다.");
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
        const fileName = `주문정리파일_${now
          .toISOString()
          .replace(/[-:]/g, "")
          .slice(0, 15)}.xlsx`;

        XLSX.writeFile(wb, fileName);

        // 히스토리 세션 저장
        try {
          const { addSession } = useHistoryStore.getState();
          
          // sourceType 결정: 사용자 입력 방식 기준
          const sourceType: SourceType =
            inputSourceType === 'excel'
              ? 'excel'
              : inputSourceType === 'image'
              ? 'image'
              : 'kakao'; // 'text' 또는 null인 경우 'kakao' (텍스트 입력)
          
          // files: 입력 방식에 따라 파일 메타데이터 생성
          let files: FileMetadata[] = [];
          if (inputSourceType === 'excel') {
            // 엑셀 업로드: uploadedFileMeta 사용
            files = uploadedFileMeta.map(meta => ({
              name: meta.name,
              size: meta.size,
              lastModified: Date.now(), // 현재 시간으로 설정 (원본 파일 정보가 없으므로)
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // 엑셀 파일 타입
            }));
          } else if (inputSourceType === 'image' && selectedImage) {
            // 이미지 업로드: selectedImage 사용
            files = [{
              name: selectedImage.name,
              size: selectedImage.size,
              lastModified: selectedImage.lastModified,
              type: selectedImage.type
            }];
          } else {
            // 텍스트 입력: 빈 배열
            files = [];
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

          // ✅ 다운로드 완료 후 업로드 파일 상태 초기화
          setSelectedFiles([]);
          setUploadedExcelFile(null);
          setUploadedFileMeta([]);
          setInputSourceType(null); // 입력 방식 초기화
          setSelectedImage(null); // 이미지 초기화
        }, 3000);

      } catch (error) {
        console.error("다운로드 오류:", error);
        setDownloadStatus("idle");
      }
    }, 0);
  };

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
                  엑셀 파일, 텍스트, 이미지로 전달된 주문 정보를 불러와 택배 업로드 파일로 자동 변환합니다.
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

            {connectedMalls.length > 0 && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => router.push('/order/fetch')}
                  className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition"
                >
                  주문 가져오기
                </button>
              </div>
            )}

            {/* 통합 입력 카드 - 하나의 파란색 테두리 카드에서 파일선택(왼쪽) + 텍스트입력(오른쪽) */}
            <div className="w-full border-2 border-blue-500 rounded-xl bg-white p-5">
              <div className="flex flex-col lg:flex-row gap-5">
                {/* 왼쪽: 파일선택 영역 (엑셀 + 이미지 드래그존) */}
                <div 
                  className="w-full lg:w-1/2 flex flex-col"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <h3 className="text-base font-semibold text-gray-900 mb-2.5">파일선택</h3>
                  <label
                    htmlFor="unified-file-input"
                    style={{ cursor: 'pointer' }}
                    className={`w-full h-[180px] bg-gray-50 border-2 border-dashed rounded-lg p-4 transition-colors overflow-hidden flex flex-col ${
                      isDragging 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700">
                          엑셀파일 · 이미지파일
                        </p>
                        <p className="text-xs text-gray-500">
                          클릭하거나 드래그하여 업로드하세요
                        </p>
                        <p className="text-xs text-gray-400 mt-1.5">
                          (xlsx, xls, jpg, png, gif)
                        </p>
                      </div>
                      {uploadedExcelFile && (
                        <div className="flex items-center justify-center gap-3 mt-2 text-sm text-gray-600">
                          <span>
                            📄 선택된 파일: {uploadedExcelFile.name}
                            {uploadedFileMeta.length > 1 && ` 외 ${uploadedFileMeta.length - 1}개`}
                          </span>

                          <span className="w-[110px] text-right inline-block">
                            {fileProcessingStatus === "processing" && (
                              <span className="text-blue-600 font-medium">
                                ⏳ 처리중{processingDots}
                              </span>
                            )}

                            {fileProcessingStatus === "done" && (
                              <span className="text-green-600 font-medium">
                                ✔ 완료
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </label>
                  <input
                    ref={fileInputRef}
                    id="unified-file-input"
                    type="file"
                    accept=".xlsx,.xls,.png,.jpg,.jpeg,.gif"
                    onChange={handleExcelFileChange}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="w-full mt-2.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    onClick={() => setShowScreenshotModal(true)}
                  >
                    캡처화면 주문변환 (스크린샷 주문 변환)
                  </button>
                </div>

                {/* 오른쪽: 텍스트 주문입력 영역 */}
                <div className="w-full lg:w-1/2 border-l-0 lg:border-l border-gray-200 pl-0 lg:pl-5 flex flex-col">
                  <h3 className="text-base font-semibold text-gray-900 mb-2.5">텍스트 주문입력</h3>
                  <p className="text-xs text-gray-600 mb-2.5 leading-relaxed">
                    카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣으면 주문변환할 수 있습니다
                  </p>
                  <div className="space-y-2.5">
                    <textarea
                      ref={textInputRef}
                      className="w-full h-36 rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      placeholder={
                        '예) 홍길동 010-1234-5766   무선마우스 2개\n' +
                        '서울시 강남구 테헤란로 123  문앞에 놓아주세요'
                      }
                      value={textInput}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        // 무료 회원 텍스트 입력 제한 (10000자)
                        if (user?.plan === 'FREE' && newValue.length > 10000) {
                          alert('무료 회원은 최대 10,000자까지 입력할 수 있습니다.');
                          return;
                        }
                        setTextInput(newValue);
                      }}
                      disabled={isProcessingTextImage}
                    />
                    <button
                      type="button"
                      className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const today = new Date().toDateString();
                        const saved = localStorage.getItem("hideTextConvertModal");

                        if (saved === today) {
                          handleTextConvert(); // 바로 실행
                        } else {
                          setShowTextConvertModal(true);
                        }
                      }}
                      disabled={isProcessingTextImage || !textInput.trim()}
                    >
                      {isProcessingTextImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>변환 중{textProcessingDots}</span>
                        </>
                      ) : (
                        '텍스트 주문 변환'
                      )}
                    </button>
                    {errorMessageTextImage && (
                      <p className="text-xs text-red-600">
                        {errorMessageTextImage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 변환된 파일 출력 영역 레이아웃 */}
        <section className="relative py-3">
          <div className="w-full bg-gray-200 border border-gray-300 rounded-xl">
            <div className="px-6 pt-6 pb-4">
              {/* 1줄: 미리보기 제목 + 펼치기 버튼 + 선택 삭제 버튼 + 기능 안내 문구 */}
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold">미리보기</h3>

                {previewRows.length > 0 && courierHeaders.length > 0 && (
                  <button
                    className="w-20 h-9 inline-flex items-center justify-center text-sm border rounded transition"
                    onClick={() => setIsPreviewExpanded(prev => !prev)}
                  >
                    {isPreviewExpanded ? '닫기' : '펼치기'}
                  </button>
                )}

                {/* 삭제 버튼 영역 - 고정 너비로 텍스트 위치 고정 */}
                <div className="w-20 flex-shrink-0">
                  {previewRows.length > 0 && courierHeaders.length > 0 && selectedRows.length > 0 && (
                    <button
                      className="w-20 h-9 inline-flex items-center justify-center text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
                      onClick={() => {
                        setIsDeleteModalOpen(true);
                      }}
                    >
                      선택 삭제
                    </button>
                  )}
                </div>

                {/* 기능 안내 문구 - 고정 위치 */}
                {previewRows.length > 0 && courierHeaders.length > 0 && (
                  <p className="text-sm text-gray-500 flex-1">
                    ✔ 셀을 클릭하면 수정할 수 있습니다.  
                    ✔ 주소, 상품 등을 클릭하면 오름/내림차순 정렬됩니다.  
                    ✔ 체크박스로 선택 후 삭제할 수 있습니다.
                  </p>
                )}
              </div>
            </div>
            {previewRows.length === 0 || courierHeaders.length === 0 ? (
              <div className="min-h-[192px] flex items-center justify-center text-gray-400">
                변환된 주문 데이터가 여기에 표시됩니다.
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
                  <div className="px-4 py-3 border-b bg-gray-50 flex-shrink-0">
                  </div>
                  <div className={`${isPreviewExpanded ? '' : 'flex-1'} overflow-auto min-h-0 preview-scrollbar`}>
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
                        {sortedRows.map((row) => {
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
                                      value={displayValue}
                                      onChange={(e) => {
                                        const newValue = e.target.value;
                                        setUserOverrides(prev => ({
                                          ...prev,
                                          [row.rowId]: {
                                            ...prev[row.rowId],
                                            [header]: newValue
                                          }
                                        }));
                                      }}
                                      onBlur={() => {
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
            {/* 카드 1: 택배 업로드 양식 */}
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
                  택배 업로드 양식 등록
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                실제 택배사 업로드에 사용하는 엑셀 양식을 등록해주세요.
                <br />
                등록하신 양식 그대로 자동 설정됩니다.
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
                보내는 사람 정보 등 모든 주문에 공통으로 적용되는 값을
                <br />
                미리 등록하여 매번 입력하는 번거로움을 줄일 수 있습니다.
              </p>
            </button>

            {/* 카드 3: 파일 다운로드 */}
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
                  택배 업로드 파일 다운로드
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                변환이 완료된 주문 데이터를
                <br />
                택배사 업로드용 파일로 내려받는 단계입니다.
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
                {noTemplateModalType === 'fixed-input' 
                  ? '택배 업로드 양식을 먼저 등록해야 고정 입력 설정이 가능합니다.'
                  : '택배 업로드 양식을 먼저 등록해야 주문 변환이 가능합니다.'}
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

      {/* 텍스트 주문 변환 안내 모달 */}
      {showTextConvertModal && (
        <div 
          className="fixed inset-0 bg-black/35 flex items-center justify-center z-[9999] p-4 transition-opacity duration-300 ease-out"
          onClick={() => setShowTextConvertModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-lg w-full max-w-[468px] p-6 transition-all duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-6 text-gray-900">자동 변환 안내</h3>
            <div className="space-y-4 mb-8">
              <p className="text-base font-medium text-gray-900 leading-relaxed">
                주문정보로 변환하여 주문목록에 추가하겠습니다.
              </p>
              <div className="space-y-3 pl-1">
                <p className="text-sm text-gray-600 leading-relaxed">
                  변환 완료 후 내용을 한 번 더 확인해주세요 ·
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  주문목록에서 수정 가능합니다 ·
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center px-4 py-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={dontShowToday}
                  onChange={(e) => setDontShowToday(e.target.checked)}
                  className="mr-2 w-4 h-4"
                />
                오늘은 보지 않기
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowTextConvertModal(false);
                    setDontShowToday(false); // 모달 닫을 때 체크박스 초기화
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={executeTextConvert}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  주문목록으로 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NormalizeQualityNoticeModal
        isOpen={qualityNoticeModal !== 'hidden'}
        variant={qualityNoticeModal === 'network' ? 'network' : 'heuristic'}
        onClose={() => setQualityNoticeModal('hidden')}
      />

      {/* 스크린샷 주문변환 모달 */}
      {showScreenshotModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
          onClick={handleScreenshotModalClose}
        >
          <div 
            className="bg-white rounded-lg shadow-lg w-full max-w-[600px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">스크린샷 주문변환</h3>
              <button
                onClick={handleScreenshotModalClose}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* 안내 문구 */}
            <div className="mb-6">
              <p className="text-sm text-gray-700 leading-relaxed mb-2">
                주문 화면을 먼저 캡처하세요.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                PrintScreen 또는 캡처 도구를 사용한 뒤
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                Ctrl + V 또는 마우스 우클릭 → 붙여넣기 하세요.
              </p>
            </div>

            {/* 붙여넣기 영역 */}
            <div
              ref={screenshotPasteAreaRef}
              tabIndex={0}
              contentEditable={screenshotStage === 'idle' ? "true" : "false"}
              suppressContentEditableWarning={true}
              onPaste={handlePaste}
              onInput={handleInput}
              onKeyDown={(e) => {
                // idle이 아니면 모든 키 입력 방지
                if (screenshotStage !== 'idle') {
                  e.preventDefault();
                  return;
                }
                // 텍스트 입력 방지 (이미지만 허용)
                if (e.key !== 'v' || !e.ctrlKey) {
                  e.preventDefault();
                }
              }}
              className={`w-full min-h-[300px] border-2 border-dashed rounded-lg p-6 mb-4 transition-colors ${
                screenshotStage === 'processing'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-gray-50 hover:border-blue-400 cursor-pointer'
              }`}
              style={{ outline: 'none', userSelect: 'none' }}
            >
              {screenshotStage === 'idle' ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    이미지를 붙여넣으세요
                  </p>
                  <p className="text-xs text-gray-500">
                    Ctrl + V 또는 우클릭 → 붙여넣기
                  </p>
                </div>
              ) : screenshotImagePreview ? (
                <div className="flex flex-col items-center justify-center h-full relative">
                  <img
                    src={screenshotImagePreview}
                    alt="붙여넣은 이미지"
                    className="max-w-full max-h-[400px] rounded-lg shadow-md mb-4"
                  />
                  {screenshotStage === 'processing' ? (
                    <div className="flex items-center gap-2 text-blue-600">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-medium">주문 데이터를 정리중입니다...</span>
                    </div>
                  ) : screenshotStage === 'completed' ? (
                    <div className="flex flex-col items-center gap-2 mt-2">
                      <div className="flex items-center gap-2 text-green-600">
                        <Check className="w-5 h-5" />
                        <span className="text-sm font-medium">스크린샷을 확인하였습니다</span>
                      </div>
                      <p className="text-xs text-gray-600">
                        주문정보를 처리하기 위해 텍스트로 변환하고 있습니다
                      </p>
                      <p className="text-xs text-gray-600">
                        텍스트 완성이 되면 오른쪽 <span className="font-semibold text-blue-600">텍스트 주문 변환</span> 버튼을 눌러주세요
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* 에러 메시지 */}
            {errorMessageTextImage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{errorMessageTextImage}</p>
              </div>
            )}

            {/* 하단 버튼 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleScreenshotModalClose}
                className={`px-4 py-2 text-sm border border-gray-300 rounded transition-colors ${
                  screenshotStage === 'processing'
                    ? 'hover:bg-red-50 border-red-300 text-red-600'
                    : 'hover:bg-gray-100'
                }`}
              >
                {screenshotStage === 'processing' ? '처리 중단' : '취소'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 정리 중 모달 */}
      {showTextProcessingModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
        >
          <div 
            className="bg-white rounded-lg shadow-lg w-full max-w-[500px] p-6"
          >
            <div className="flex flex-col items-center justify-center text-center">
              {screenshotStage === 'processing' ? (
                <>
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    {textProcessingSource === 'screenshot' 
                      ? '스크린샷에서 텍스트를 정리중입니다'
                      : '이미지 파일에서 텍스트를 정리중입니다'}
                  </p>
                  <p className="text-sm text-gray-600">
                    텍스트정리가 완료되면 텍스트변환버튼을 눌러 주문목록으로 추가하세요
                  </p>
                </>
              ) : screenshotStage === 'completed' ? (
                <>
                  <Check className="w-12 h-12 text-green-500 mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    텍스트로 변환이 완료되었습니다
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    텍스트 변환하기 버튼을 눌러주세요
                  </p>
                  <button
                    onClick={() => setShowTextProcessingModal(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    확인
                  </button>
                </>
              ) : null}
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

