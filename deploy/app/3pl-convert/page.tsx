/**
 * ⚠️ EXCLOAD CONSTITUTION v4.0 적용 파일
 * - 3PL UI만 구현(파이프라인/변환 로직 연결 없음)
 * - 버튼/카드 클릭 시 console.log만 출력
 * - order-convert의 UI 레이아웃을 복제하되 텍스트만 3PL로 변경
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  alignRowsFromHeader,
  detectHeaderRowIndex,
  filterNonEmptyRows,
  readFirstSheetMatrixFromArrayBuffer,
} from '@/app/lib/excel/sheet-header';
import { ArrowDown, Check, Loader2, Search, Truck, Upload, X } from 'lucide-react';
import { Coins } from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';
import { extractTextFromImage } from '@/app/unified-input/adapters/ImageToTextAdapter';
import { runTextToCleanInputAdapter } from '@/app/unified-input/adapters/TextToCleanInputAdapter';

/** 업로드된 엑셀 파일에서 첫 시트 헤더 행을 문자열 배열로 추출 (공통 sheet-header 로직) */
function parseExcelHeadersFromFile(file: File): Promise<string[]> {
  return file.arrayBuffer().then((buffer) => {
    const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);
    const filtered = filterNonEmptyRows(rawData);
    const headerIndex = detectHeaderRowIndex(filtered);
    const aligned = alignRowsFromHeader(filtered, headerIndex);
    const headerRow = aligned[0] ?? [];
    return headerRow.map((cell) => String(cell ?? '').trim());
  });
}

/** 업로드된 엑셀 파일의 첫 시트를 2차원 배열로 추출 — [0]=헤더 (공통 sheet-header 로직) */
function parseExcelRowsFromFile(file: File): Promise<string[][]> {
  return file.arrayBuffer().then((buffer) => {
    const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);
    const filtered = filterNonEmptyRows(rawData);
    console.log('[3PL UI] parsed excel rows.length:', filtered.length);
    const headerIndex = detectHeaderRowIndex(filtered);
    return alignRowsFromHeader(filtered, headerIndex);
  });
}

/** 빈 문자열/공백은 false — fixed 보호·source 덮어쓰기 방지에 사용 */
function isNonEmptyStringValue(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/**
 * 탭 구분 입력 → runTextToCleanInputAdapter(AI)와 동일한 CleanInputFile 형태.
 * 컬럼 순서: 수취인명 · 주소 · 전화 · 상품명 (canonicalHeaderAliases와 호환되는 한글 헤더)
 */
const TAB_SEPARATED_TEXT_HEADERS = ['받는사람', '주소', '전화번호1', '상품명'] as const;

function buildCleanInputFromTabSeparatedText(text: string): {
  headers: string[];
  rows: string[][];
  sourceType: 'text';
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const rows: string[][] = [];
  const colCount = TAB_SEPARATED_TEXT_HEADERS.length;
  for (const line of lines) {
    if (!line.includes('\t')) continue;
    const cols = line.split('\t').map((c) => c.trim());
    const padded = [...cols];
    while (padded.length < colCount) padded.push('');
    rows.push(padded.slice(0, colCount));
  }
  return {
    headers: [...TAB_SEPARATED_TEXT_HEADERS],
    rows,
    sourceType: 'text',
  };
}

const THREEPL_TEMPLATE_STORAGE_KEY = 'threepl_recent_excel_formats_v1';
const THREEPL_TEMPLATE_SELECTED_KEY = 'threepl_selected_template_id_v1';
const THREEPL_MAPPING_STORAGE_KEY = 'threepl_recent_mapping_formats_v1';
const THREEPL_MAPPING_SELECTED_KEY = 'threepl_selected_mapping_id_v1';
const THREEPL_FIXED_INPUT_STORAGE_KEY = 'threepl_fixed_header_values_v1';

function getScopedStorageKey(baseKey: string, userId: string | null | undefined): string {
  const suffix = userId && userId.trim() !== '' ? userId : 'guest';
  return `${baseKey}_${suffix}`;
}

export default function ThreePLConvertPage() {
  const user = useUserStore((state) => state.user);
  const userId = user?.userId ?? null;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const mappingInputRef = useRef<HTMLInputElement | null>(null);
  const screenshotPasteAreaRef = useRef<HTMLDivElement | null>(null);
  const isCancelledRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileCount, setUploadedFileCount] = useState(0);
  const [uploadedExcelFile, setUploadedExcelFile] = useState<File | null>(null);

  const [textInput, setTextInput] = useState('');
  const [isProcessingTextImage, setIsProcessingTextImage] = useState(false);

  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [showTextConvertModal, setShowTextConvertModal] = useState(false);
  const [dontShowToday, setDontShowToday] = useState(false);
  const [showTextProcessingModal, setShowTextProcessingModal] = useState(false);
  const [textProcessingSource, setTextProcessingSource] = useState<'screenshot' | 'imageFile'>('screenshot');
  const [screenshotStage, setScreenshotStage] = useState<'idle' | 'processing' | 'completed'>('idle');
  const [errorMessageTextImage, setErrorMessageTextImage] = useState<string | null>(null);
  const [screenshotImagePreview, setScreenshotImagePreview] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [showThreePlTemplateModal, setShowThreePlTemplateModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showFixedInputModal, setShowFixedInputModal] = useState(false);

  type RecentExcelFormat = {
    id: string;
    displayName?: string;
    createdAt: string;
    columnOrder: string[];
  };
  type MappingFileFormat = {
    id: string;
    displayName?: string;
    createdAt: string;
    rows: string[][];
  };

  // 등록된 양식 목록(업로드한 파일의 실제 헤더만 표시, 상품코드 매핑은 별도 업로드)
  const [recentExcelFormats, setRecentExcelFormats] = useState<RecentExcelFormat[]>([]);
  const [showRecentTemplate, setShowRecentTemplate] = useState(false);
  const [tempSelectedFormatId, setTempSelectedFormatId] = useState<string>('');
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState<string>('');
  const [registrationSuccessMessage, setRegistrationSuccessMessage] = useState<string | null>(null);
  const [recentMappingFormats, setRecentMappingFormats] = useState<MappingFileFormat[]>([]);
  const [showRecentMapping, setShowRecentMapping] = useState(false);
  const [tempSelectedMappingId, setTempSelectedMappingId] = useState<string>('');
  const [mappingRegistrationMessage, setMappingRegistrationMessage] = useState<string | null>(null);
  const [mappingPreviewMode, setMappingPreviewMode] = useState<'vertical' | 'horizontal'>('vertical');
  /** 변환 실행 시에만 파이프라인에 전달. 업로드/라디오 선택만으로는 갱신하지 않음(모달 확인·복원 시 설정). */
  const [mappingData, setMappingData] = useState<string[][] | null>(null);
  const [isProcessingExcelUpload, setIsProcessingExcelUpload] = useState(false);
  const [excelConvertError, setExcelConvertError] = useState<string | null>(null);
  const [fixedHeaderValues, setFixedHeaderValues] = useState<Record<string, string>>({});
  const [editingFixedHeader, setEditingFixedHeader] = useState<string | null>(null);
  const [fixedInputDraft, setFixedInputDraft] = useState('');
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);
  const [previewRows, setPreviewRows] = useState<
    Array<{
      rowId: string;
      data: Record<string, string>;
      missingReasons?: Array<{ key: string; reason?: string }>;
    }>
  >([]);
  const [courierHeaders, setCourierHeaders] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ header: string; direction: 'asc' | 'desc' } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; header: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  // 마지막 변환으로 미리보기를 생성한 템플릿 id를 추적
  // (localStorage hydration 과정에서 템플릿 상태가 재설정되는 경우 previewRows가 지워지는 현상 방지)
  const lastPreviewTemplateIdRef = useRef<string | null>(null);
  // 최근에 생성된 미리보기 행 하이라이트
  const [newRows, setNewRows] = useState<Set<string>>(new Set());

  const selectedTemplateHeaders = useMemo(
    () =>
      recentExcelFormats
        .find((f) => f.id === tempSelectedFormatId)
        ?.columnOrder.filter((h) => h.trim() !== '') ?? [],
    [recentExcelFormats, tempSelectedFormatId],
  );
  const fixedSummaryEntries = useMemo(
    () => selectedTemplateHeaders.filter((header) => (fixedHeaderValues[header] || '').trim() !== ''),
    [selectedTemplateHeaders, fixedHeaderValues],
  );
  const selectedMappingFormat = useMemo(
    () => recentMappingFormats.find((f) => f.id === tempSelectedMappingId) ?? null,
    [recentMappingFormats, tempSelectedMappingId],
  );
  const selectedMappingSummary = useMemo(
    () =>
      selectedMappingFormat?.rows
        .flatMap((row) => row)
        .map((cell) => String(cell ?? '').trim())
        .filter((cell) => cell !== '')
        .join(' · ') ?? '',
    [selectedMappingFormat],
  );
  const hasActivePreview = useMemo(
    () =>
      previewRows.length > 0 && courierHeaders.length > 0,
    [previewRows, courierHeaders],
  );

  const derivedPreviewMeta = useMemo(() => {
    const total = previewRows.length;
    const missingCount = previewRows.reduce(
      (acc, row) => acc + (row.missingReasons?.length ?? 0),
      0,
    );
    return { total, missingCount };
  }, [previewRows]);

  // 템플릿 변경 시: 헤더만 동기화. 미리보기는 텍스트 변환 완료·변환 버튼 클릭 시에만 갱신(매핑 시트로 자동 구성 금지).
  useEffect(() => {
    if (selectedTemplateHeaders.length === 0) {
      setCourierHeaders([]);
      setPreviewRows([]);
      setSelectedRows([]);
      setNewRows(new Set());
      return;
    }

    setCourierHeaders(selectedTemplateHeaders);
    // 같은 템플릿 id로부터 이미 변환된 미리보기라면(예: hydration 재설정), previewRows는 유지한다.
    if (lastPreviewTemplateIdRef.current && lastPreviewTemplateIdRef.current === tempSelectedFormatId) {
      return;
    }
    setPreviewRows([]);
    setSelectedRows([]);
    setNewRows(new Set());
  }, [selectedTemplateHeaders]);

  const handleSortByHeader = (header: string) => {
    const nextDirection: 'asc' | 'desc' =
      sortConfig?.header === header && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ header, direction: nextDirection });
    setPreviewRows((prev) =>
      [...prev].sort((a, b) => {
        const av = String(a.data[header] ?? '').toLowerCase();
        const bv = String(b.data[header] ?? '').toLowerCase();
        if (av < bv) return nextDirection === 'asc' ? -1 : 1;
        if (av > bv) return nextDirection === 'asc' ? 1 : -1;
        return 0;
      }),
    );
  };

  const handleToggleRow = (rowId: string) => {
    setSelectedRows((prev) => (prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]));
  };

  const handleToggleAllRows = () => {
    if (selectedRows.length === previewRows.length) {
      setSelectedRows([]);
      return;
    }
    setSelectedRows(previewRows.map((row) => row.rowId));
  };

  const handleDeleteSelectedRows = () => {
    if (selectedRows.length === 0) return;
    setPreviewRows((prev) => prev.filter((row) => !selectedRows.includes(row.rowId)));
    setSelectedRows([]);
  };

  const handleStartEditCell = (rowId: string, header: string, value: string) => {
    setEditingCell({ rowId, header });
    setEditingValue(value);
  };

  const handleCommitEditCell = () => {
    if (!editingCell) return;
    setPreviewRows((prev) =>
      prev.map((row) =>
        row.rowId === editingCell.rowId
          ? { ...row, data: { ...row.data, [editingCell.header]: editingValue } }
          : row,
      ),
    );
    setEditingCell(null);
    setEditingValue('');
  };

  // 페이지 이동/새로고침/재로그인 시에도 유지되도록 localStorage에서 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsStorageHydrated(false);
    try {
      const templateKey = getScopedStorageKey(THREEPL_TEMPLATE_STORAGE_KEY, userId);
      const templateSelectedKey = getScopedStorageKey(THREEPL_TEMPLATE_SELECTED_KEY, userId);
      const mappingKey = getScopedStorageKey(THREEPL_MAPPING_STORAGE_KEY, userId);
      const mappingSelectedKey = getScopedStorageKey(THREEPL_MAPPING_SELECTED_KEY, userId);
      const fixedInputKey = getScopedStorageKey(THREEPL_FIXED_INPUT_STORAGE_KEY, userId);

      // 기존 공용 key 데이터가 있으면 사용자별 key로 1회 마이그레이션
      const migrateIfNeeded = (scopedKey: string, legacyKey: string) => {
        const scopedValue = localStorage.getItem(scopedKey);
        if (scopedValue !== null) return scopedValue;
        const guestValue = localStorage.getItem(getScopedStorageKey(legacyKey, 'guest'));
        if (guestValue !== null) {
          localStorage.setItem(scopedKey, guestValue);
          return guestValue;
        }
        const legacyValue = localStorage.getItem(legacyKey);
        if (legacyValue !== null) {
          localStorage.setItem(scopedKey, legacyValue);
          return legacyValue;
        }
        return null;
      };

      const savedTemplates = migrateIfNeeded(templateKey, THREEPL_TEMPLATE_STORAGE_KEY);
      const savedTemplateSelected = migrateIfNeeded(templateSelectedKey, THREEPL_TEMPLATE_SELECTED_KEY);
      const savedMappings = migrateIfNeeded(mappingKey, THREEPL_MAPPING_STORAGE_KEY);
      const savedMappingSelected = migrateIfNeeded(mappingSelectedKey, THREEPL_MAPPING_SELECTED_KEY);
      const savedFixedValues = migrateIfNeeded(fixedInputKey, THREEPL_FIXED_INPUT_STORAGE_KEY);

      if (savedTemplates) {
        const parsed = JSON.parse(savedTemplates) as RecentExcelFormat[];
        if (Array.isArray(parsed)) setRecentExcelFormats(parsed);
      }
      if (savedTemplateSelected) {
        setTempSelectedFormatId(savedTemplateSelected);
      }

      if (savedMappings) {
        const parsed = JSON.parse(savedMappings) as MappingFileFormat[];
        if (Array.isArray(parsed)) {
          setRecentMappingFormats(parsed);
          if (savedMappingSelected) {
            const fmt = parsed.find((f) => f.id === savedMappingSelected);
            setMappingData(fmt?.rows ?? null);
          } else {
            setMappingData(null);
          }
        } else {
          setMappingData(null);
        }
      } else {
        setMappingData(null);
      }
      if (savedMappingSelected) {
        setTempSelectedMappingId(savedMappingSelected);
      }

      if (savedFixedValues) {
        const parsed = JSON.parse(savedFixedValues) as Record<string, string>;
        if (parsed && typeof parsed === 'object') setFixedHeaderValues(parsed);
      }
    } catch (error) {
      console.error('[3PL UI] localStorage 복원 중 오류:', error);
    } finally {
      setIsStorageHydrated(true);
    }
  }, [userId]);

  // 템플릿 목록/선택 자동 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isStorageHydrated) return;
    try {
      const templateKey = getScopedStorageKey(THREEPL_TEMPLATE_STORAGE_KEY, userId);
      const templateSelectedKey = getScopedStorageKey(THREEPL_TEMPLATE_SELECTED_KEY, userId);
      localStorage.setItem(templateKey, JSON.stringify(recentExcelFormats));
      const hasSelected = recentExcelFormats.some((f) => f.id === tempSelectedFormatId);
      localStorage.setItem(templateSelectedKey, hasSelected ? tempSelectedFormatId : '');
    } catch (error) {
      console.error('[3PL UI] 템플릿 localStorage 저장 중 오류:', error);
    }
  }, [recentExcelFormats, tempSelectedFormatId, userId, isStorageHydrated]);

  // 매핑 목록/선택 자동 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isStorageHydrated) return;
    try {
      const mappingKey = getScopedStorageKey(THREEPL_MAPPING_STORAGE_KEY, userId);
      const mappingSelectedKey = getScopedStorageKey(THREEPL_MAPPING_SELECTED_KEY, userId);
      localStorage.setItem(mappingKey, JSON.stringify(recentMappingFormats));
      const hasSelected = recentMappingFormats.some((f) => f.id === tempSelectedMappingId);
      localStorage.setItem(mappingSelectedKey, hasSelected ? tempSelectedMappingId : '');
    } catch (error) {
      console.error('[3PL UI] 매핑 localStorage 저장 중 오류:', error);
    }
  }, [recentMappingFormats, tempSelectedMappingId, userId, isStorageHydrated]);

  // 고정 입력 값 자동 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isStorageHydrated) return;
    try {
      const fixedInputKey = getScopedStorageKey(THREEPL_FIXED_INPUT_STORAGE_KEY, userId);
      localStorage.setItem(fixedInputKey, JSON.stringify(fixedHeaderValues));
    } catch (error) {
      console.error('[3PL UI] 고정 입력 localStorage 저장 중 오류:', error);
    }
  }, [fixedHeaderValues, userId, isStorageHydrated]);

  // 통합 입력 카드(드래그/드롭 + 파일 선택)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    console.log('[3PL UI] 파일 드롭됨:', files.length);

    // Excel/이미지 여부 구분
    const allFiles = Array.from(files);
    const firstExcel = allFiles.find((f) => /\.(xlsx|xls)$/i.test(f.name));
    const firstImage = allFiles.find(
      (f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name) || f.type.startsWith('image/'),
    );

    setUploadedFileCount(allFiles.length);
    setUploadedExcelFile(firstExcel ?? allFiles[0] ?? null);

    if (firstImage) {
      void handleImageFileSelect(firstImage);
    }

    // 주문 엑셀 업로드 시: 조건 만족 시에만 변환 실행(템플릿/매핑 변경 시 자동 실행 금지)
    if (firstExcel) {
      void handleExcelOrderConvert(firstExcel);
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    console.log('[3PL UI] 파일 선택됨:', files.length);

    const allFiles = Array.from(files);
    const firstExcel = allFiles.find((f) => /\.(xlsx|xls)$/i.test(f.name));
    const firstImage = allFiles.find(
      (f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name) || f.type.startsWith('image/'),
    );
    setUploadedFileCount(allFiles.length);
    setUploadedExcelFile(firstExcel ?? allFiles[0] ?? null);
    if (firstImage) {
      void handleImageFileSelect(firstImage);
    }

    // 주문 엑셀 업로드 시: 조건 만족 시에만 변환 실행(템플릿/매핑 변경 시 자동 실행 금지)
    if (firstExcel) {
      void handleExcelOrderConvert(firstExcel);
    }
  };

  const normalizeHeader = (value: string) =>
    value.toLowerCase().replace(/\s+/g, '').replace(/[()_\-\/]/g, '');

  const canonicalHeaderAliases: Record<string, string[]> = {
    ordernumber: ['주문번호', 'ordernumber', 'orderid'],
    // 수취인명은 엑셀 헤더에 "수취인", "수취인명", "고객명" 등 다양한 표현이 올 수 있음
    receivername: [
      '받는사람',
      '받는분',
      '받는사람명',
      '구매자',
      '배송받는사람',
      '받는이',
      '수취인',
      '수령인',
      '배송받는분',
      '이름',
      '고객이름',
      '수취인명',
      '고객명',
      '받으시는 분',
      '받으시는분',
      '수령자명',
      '수령자',
      'receivername',
      'recipientname',
    ],
    receiverphone1: [
      '전화번호1',
      '받는분전화',
      '수취인전화',
      '고객전화',
      '연락처',
      '휴대폰',
      '휴대폰번호',
      '전화번호',
      '수취인연락처',
      '받는사람전화번호',
      '수령인연락처',
      '받으시는 분 전화',
      '받으시는분전화',
      '받는분핸드폰',
      '받는사람전화번호',
      'receiverphone1',
      'receiverphone',
      '수령자연락처',
      '수령자전화',
      '수령자휴대폰',
      '수령인전화',
      '수령인휴대폰',
      'receiverphone1',
    ],
    receiverphone2: [
      '전화번호2',
      '받는분전화2',
      '연락처2',
      '보조연락처',
      '받는사람전화2',
      '받는사람연락처2',
      '수취인전화2',
      '고객전화2',
      '수령인전화2',
      '받는분휴대폰2',
      '보조전화(받는사람)',
      'recipient_phone2',
      'receiver_phone2',
      'customer_phone2',
      'receiverphone2',
    ],
    receiverzipcode: [
      '우편번호',
      '받는분우편번호',
      '수취인우편번호',
      '고객우편번호',
      '배송우편번호',
      '받는사람우편번호',
      '받는사람우편',
      '수령인우편번호',
      '배송지우편번호',
      '우편번호(받는사람)',
      '우편번호(배송지)',
      'recipient_zip',
      'receiver_zip',
      'customer_zip',
      'delivery_zip',
      '수취인우편번호',
      'receiverzipcode',
      'zipcode',
    ],
    // 주소는 "수취인 주소", "수취인주소", "배송지주소" 등으로 들어오는 경우가 많음
    receiveraddress1: [
      '주소',
      '받는분주소',
      '받는분총주소',
      '받으시는분주소',
      '주소1',
      '수취인주소',
      '배송지주소',
      '고객주소',
      '배송주소',
      '배송지주소',
      '수취인주소',
      '수취인 주소',
      '도로명주소',
      '지번주소',
      '받는사람주소',
      '고객주소',
      'receiveraddress1',
      'receiveraddress',
      'address1',
    ],
    receiveraddress2: [
      '상세주소',
      '받는분상세주소',
      '수취인상세주소',
      '배송지상세주소',
      '받는사람상세주소',
      '받는사람상세주소2',
      '받는분주소2',
      '수령인상세주소',
      '배송지주소2',
      '고객상세주소',
      '배송상세주소',
      'recipient_address2',
      'receiver_address2',
      'delivery_address2',
      'receiveraddress2',
      'detailaddress',
      'address2',
    ],
    productname: ['상품명1', '상품명', '품명', 'productname', 'itemname'],
    quantity: ['수량', '수량(a타입)', '옵션수량', 'quantity', 'qty'],
    deliverymessage: ['배송메시지', '택배기사요청사항', 'deliverymessage', 'requestmemo'],
    sendername: ['보내는사람', '보내는사람(지정)', '송화인', 'sendername'],
    senderphone1: ['전화번호1(지정)', '보내는사람연락처', 'senderphone1'],
    senderphone2: ['전화번호2(지정)', 'senderphone2'],
    senderzipcode: ['우편번호(지정)', 'senderzipcode'],
    senderaddress1: ['주소(지정)', 'senderaddress1', 'senderaddress'],
    senderaddress2: ['상세주소(지정)', 'senderaddress2'],
    shippingfeetype: ['운임구분', 'shippingfeetype'],
    shippingfee: ['운임', 'shippingfee'],
    invoicenumber: ['운송장번호', 'invoice', 'invoicenumber'],
    productcode: ['상품코드', '품목코드', 'productcode', 'itemcode'],
    optioncode: ['옵션코드', 'optioncode'],
    saleschannel: ['판매채널', '주문중개채널', 'saleschannel', 'channel'],
    bundlekey: ['합포장키', '묶음배송번호', 'bundlekey'],
  };

  const inferCanonicalFromHeader = (rawHeader: string): string | null => {
    const normalized = normalizeHeader(rawHeader);
    const isFixedSender = rawHeader.includes('(지정)');

    // "(지정)"가 붙은 경우 sender 필드를 우선 매칭
    if (isFixedSender) {
      if (normalized.includes('보내는사람') || normalized.includes('sendername')) return 'sendername';
      if (normalized.includes('전화번호1') || normalized.includes('senderphone1')) return 'senderphone1';
      if (normalized.includes('전화번호2') || normalized.includes('senderphone2')) return 'senderphone2';
      if (normalized.includes('우편번호') || normalized.includes('senderzipcode')) return 'senderzipcode';
      if (normalized.includes('상세주소') || normalized.includes('senderaddress2')) return 'senderaddress2';
      if (normalized.includes('주소') || normalized.includes('senderaddress1')) return 'senderaddress1';
    }

    for (const [canonical, aliases] of Object.entries(canonicalHeaderAliases)) {
      if (normalizeHeader(canonical) === normalized) return canonical;
      if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return canonical;
    }

    for (const [canonical, aliases] of Object.entries(canonicalHeaderAliases)) {
      if (
        aliases.some((alias) => {
          const n = normalizeHeader(alias);
          return normalized.includes(n) || n.includes(normalized);
        })
      ) {
        return canonical;
      }
    }

    return null;
  };

  const mapCleanInputToThreePlPreview = (
    headers: string[],
    rows: string[][],
  ): Array<{ rowId: string; data: Record<string, string> }> => {
    const sourceCanonicalToIndex = new Map<string, number>();
    const normalizedSource = headers.map((h) => normalizeHeader(String(h ?? '')));

    headers.forEach((sourceHeader, index) => {
      const canonical = inferCanonicalFromHeader(String(sourceHeader ?? ''));
      if (canonical && !sourceCanonicalToIndex.has(canonical)) {
        sourceCanonicalToIndex.set(canonical, index);
      }
    });

    const selectedHeaderToIndex = new Map<string, number>();
    selectedTemplateHeaders.forEach((targetHeader) => {
      const targetCanonical = inferCanonicalFromHeader(targetHeader);

      if (targetCanonical && sourceCanonicalToIndex.has(targetCanonical)) {
        selectedHeaderToIndex.set(targetHeader, sourceCanonicalToIndex.get(targetCanonical)!);
        return;
      }

      // canonical 매칭 실패 시 문자열 유사 매칭 fallback
      const targetNorm = normalizeHeader(targetHeader);
      let idx = normalizedSource.findIndex((h) => h === targetNorm);
      if (idx === -1) {
        idx = normalizedSource.findIndex((h) => h.includes(targetNorm) || targetNorm.includes(h));
      }
      if (idx !== -1) selectedHeaderToIndex.set(targetHeader, idx);
    });

    return rows
      .map((sourceRow, rowIdx) => {
        const rowData: Record<string, string> = {};

        selectedTemplateHeaders.forEach((header) => {
          const index = selectedHeaderToIndex.get(header);
          const fromText = index !== undefined ? String(sourceRow[index] ?? '').trim() : '';
          const fixed = String(fixedHeaderValues[header] ?? '').trim();
          rowData[header] = fromText || fixed;
        });

        // 소스만 비어 있어도 fixed로 채워진 행은 유지 (finalRow 기준)
        const hasFinalRow = Object.values(rowData).some((cell) => isNonEmptyStringValue(cell));
        if (!hasFinalRow) return null;
        return { rowId: `text-preview-${Date.now()}-${rowIdx}`, data: rowData };
      })
      .filter((row): row is { rowId: string; data: Record<string, string> } => row !== null);
  };

  const handleExcelOrderConvert = async (file: File) => {
    // 실행 전 게이트: 템플릿/주문 데이터가 없으면 중단
    const templateHeaders = selectedTemplateHeaders;
    if (templateHeaders.length === 0) {
      setExcelConvertError('템플릿 양식을 먼저 등록/선택해주세요.');
      return;
    }

    if (isProcessingExcelUpload) return;

    setExcelConvertError(null);
    setIsProcessingExcelUpload(true);
    try {
      const excelHeaders = await parseExcelHeadersFromFile(file);
      const allExcelRows = await parseExcelRowsFromFile(file);
      const dataRows = allExcelRows.slice(1); // 1행(헤더) 제외

      const generated = mapCleanInputToThreePlPreview(excelHeaders, dataRows);
      if (generated.length === 0) {
        setExcelConvertError('주문 데이터가 없거나 유효한 행을 찾지 못했습니다.');
        return;
      }

      const orderData = generated.map((g) => {
        // rowId: text-preview-${Date.now()}-${rowIdx}
        const sourceRowIdx = Number(String(g.rowId).split('-').pop() ?? 'NaN');
        const sourceRowArr = dataRows[sourceRowIdx] ?? [];

        const obj: Record<string, unknown> = {};

        // (1) 템플릿 헤더 값 먼저 주입
        for (const [k, v] of Object.entries(g.data)) {
          obj[k] = v;
        }

        // (2) 원본 엑셀 헤더 키 전체도 함께 주입 (mapping source 키 보강)
        excelHeaders.forEach((h, idx) => {
          const key = String(h ?? '');
          const v = String(sourceRowArr[idx] ?? '').trim();
          // 요구사항: 빈셀값("")은 덮어쓰기에서 제외(기존 fixed값 유지)
          if (v !== '') obj[key] = v;
        });

        // (3) Stage2 매핑의 source 키(상품명/옵션명/바코드)도 canonical 기반으로 보강
        excelHeaders.forEach((h, idx) => {
          const rawHeader = String(h ?? '');
          const canonical = inferCanonicalFromHeader(rawHeader);
          const value = String(sourceRowArr[idx] ?? '').trim();

          if (canonical === 'productname' && isNonEmptyStringValue(value)) obj['상품명'] = value;
          if (canonical === 'optioncode' && isNonEmptyStringValue(value)) obj['옵션명'] = value;

          const norm = normalizeHeader(rawHeader);
          if ((norm === 'barcode' || norm.includes('바코드')) && isNonEmptyStringValue(value)) obj['바코드'] = value;
        });

        return obj;
      });

      if (orderData.length === 0) {
        setExcelConvertError('주문 데이터 생성에 실패했습니다.');
        return;
      }

      const resp = await fetch('/api/3pl-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateHeaders,
          orderData,
          mappingData,
        }),
      });

      const pipelineResult = await resp.json();
      if (!resp.ok) {
        throw new Error(pipelineResult?.error ?? '3PL 미리보기 생성 실패');
      }

      setCourierHeaders(templateHeaders);
      const newPreviewRows = pipelineResult.rows.map((row, idx) => ({
        // 주문변환처럼 최근 행 하이라이트를 안정적으로 하기 위해 UUID로 rowId 생성
        rowId: crypto.randomUUID(),
        data: row as Record<string, string>,
        missingReasons:
          pipelineResult.rowMissingReasons[idx]?.map((m: any) => ({
            key: m.key,
            reason: m.reason ? String(m.reason) : undefined,
          })) ?? [],
      }));
      const newRowIds = newPreviewRows.map((r) => r.rowId);
      setNewRows((prev) => {
        const updated = new Set(prev);
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
      // 주문변환처럼 새 파일/텍스트 변환 결과를 누적(상단 prepend)
      setPreviewRows((prev) => [...newPreviewRows, ...prev]);
      lastPreviewTemplateIdRef.current = tempSelectedFormatId;
      setSelectedRows([]);
      setExcelConvertError(null);
    } catch (error) {
      console.error('[3PL] 엑셀 주문 변환 오류:', error);
      setExcelConvertError(
        error instanceof Error ? error.message : '엑셀 주문을 변환하는 중 오류가 발생했습니다.',
      );
    } finally {
      setIsProcessingExcelUpload(false);
    }
  };

  const handleTextConvert = async () => {
    setErrorMessageTextImage(null);

    if (selectedTemplateHeaders.length === 0) {
      setErrorMessageTextImage('3PL 템플릿 양식을 먼저 등록/선택해주세요.');
      return;
    }

    const trimmed = textInput.trim();
    if (!trimmed) {
      setErrorMessageTextImage('변환할 텍스트를 입력해 주세요.');
      return;
    }

    setIsProcessingTextImage(true);
    try {
      // 탭 구분: 열 고정 분리 (AI normalize-29는 자연어에 적합, 탭 입력은 구조화 데이터로 처리)
      const cleanInputFile = trimmed.includes('\t')
        ? buildCleanInputFromTabSeparatedText(trimmed)
        : await runTextToCleanInputAdapter(trimmed);

      if (trimmed.includes('\t') && cleanInputFile.rows.length === 0) {
        setErrorMessageTextImage(
          '탭으로 구분된 유효한 행이 없습니다. 형식: 받는사람\\t주소\\t전화\\t상품명 (줄마다 입력 가능)',
        );
        return;
      }

      const generated = mapCleanInputToThreePlPreview(cleanInputFile.headers, cleanInputFile.rows);

      const orderData = generated.map((g) => {
        // rowId: text-preview-${Date.now()}-${rowIdx}
        const sourceRowIdx = Number(String(g.rowId).split('-').pop() ?? 'NaN');
        const sourceRowArr = cleanInputFile.rows[sourceRowIdx] ?? [];

        const obj: Record<string, unknown> = {};

        // (1) 템플릿 헤더 값 먼저 주입
        for (const [k, v] of Object.entries(g.data)) {
          obj[k] = v;
        }

        // (2) 원본 clean input 키 전체도 함께 주입 (mapping source 키를 보강하기 위함)
        cleanInputFile.headers.forEach((h, idx) => {
          const key = String(h ?? '');
          const v = String(sourceRowArr[idx] ?? '').trim();
          // 요구사항: 빈셀값("")은 덮어쓰기에서 제외(기존 fixed값 유지)
          if (v !== '') obj[key] = v;
        });

        // (3) Stage2 매핑의 source 키(상품명/옵션명/바코드)도 canonical 기반으로 보강
        cleanInputFile.headers.forEach((h, idx) => {
          const rawHeader = String(h ?? '');
          const canonical = inferCanonicalFromHeader(rawHeader);
          const value = String(sourceRowArr[idx] ?? '').trim();

          if (canonical === 'productname' && isNonEmptyStringValue(value)) obj['상품명'] = value;
          if (canonical === 'optioncode' && isNonEmptyStringValue(value)) obj['옵션명'] = value;

          const norm = normalizeHeader(rawHeader);
          if ((norm === 'barcode' || norm.includes('바코드')) && isNonEmptyStringValue(value)) obj['바코드'] = value;
        });

        return obj;
      });

      const resp = await fetch("/api/3pl-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateHeaders: selectedTemplateHeaders,
          orderData,
          mappingData,
        }),
      });

      const pipelineResult = await resp.json();
      if (!resp.ok) {
        throw new Error(pipelineResult?.error ?? "3PL 미리보기 생성 실패");
      }

      setCourierHeaders(selectedTemplateHeaders);
      const newPreviewRows = pipelineResult.rows.map((row, idx) => ({
        rowId: generated[idx]?.rowId ?? crypto.randomUUID(),
        data: row as Record<string, string>,
        missingReasons:
          pipelineResult.rowMissingReasons[idx]?.map((m) => ({
            key: m.key,
            reason: m.reason ? String(m.reason) : undefined,
          })) ?? [],
      }));
      const newRowIds = newPreviewRows.map((r) => r.rowId);
      setNewRows((prev) => {
        const updated = new Set(prev);
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
      // 주문변환처럼 새 파일/텍스트 변환 결과를 누적(상단 prepend)
      setPreviewRows((prev) => [...newPreviewRows, ...prev]);
      lastPreviewTemplateIdRef.current = tempSelectedFormatId;
      setSelectedRows([]);
      setShowTextProcessingModal(false);
      setTextInput('');
      setSelectedImage(null);
    } catch (error) {
      console.error('[3PL] 텍스트 주문 변환 오류:', error);
      setErrorMessageTextImage(
        error instanceof Error ? error.message : '텍스트를 변환하는 중 알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setIsProcessingTextImage(false);
    }
  };

  const executeTextConvert = async () => {
    if (dontShowToday) {
      const today = new Date().toDateString();
      localStorage.setItem('hideTextConvertModal', today);
    }
    setShowTextConvertModal(false);
    setDontShowToday(false);
    await handleTextConvert();
  };

  const handleScreenshotModalClose = () => {
    if (screenshotStage === 'processing') {
      isCancelledRef.current = true;
    }
    setShowScreenshotModal(false);
    setScreenshotImagePreview(null);
    setScreenshotStage('idle');
    setErrorMessageTextImage(null);
    isCancelledRef.current = false;
  };

  const handleInput = () => {
    if (screenshotPasteAreaRef.current && screenshotStage === 'idle') {
      screenshotPasteAreaRef.current.textContent = '';
      screenshotPasteAreaRef.current.innerHTML = '';
    }
  };

  const handleScreenshotImageProcess = async (blob: Blob) => {
    isCancelledRef.current = false;
    setTextProcessingSource('screenshot');
    setShowTextProcessingModal(true);
    setScreenshotStage('processing');
    setErrorMessageTextImage(null);

    try {
      const file = new File([blob], 'screenshot.png', { type: 'image/png' });
      const extractedText = await extractTextFromImage(file);

      if (isCancelledRef.current) {
        setScreenshotStage('idle');
        setShowTextProcessingModal(false);
        return;
      }

      if (extractedText && extractedText.trim()) {
        setTextInput(extractedText);
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onload = () => setScreenshotImagePreview(reader.result as string);
        reader.readAsDataURL(file);
        setScreenshotStage('completed');
      } else {
        setErrorMessageTextImage('이미지에서 텍스트를 추출할 수 없습니다.');
        setScreenshotStage('idle');
        setShowTextProcessingModal(false);
      }
    } catch (error) {
      console.error('[3PL] 스크린샷 처리 오류:', error);
      setErrorMessageTextImage(error instanceof Error ? error.message : '이미지 처리 중 오류가 발생했습니다.');
      setScreenshotStage('idle');
      setShowTextProcessingModal(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          setShowScreenshotModal(false);
          await handleScreenshotImageProcess(blob);
        }
        break;
      }
    }
  };

  const handleImageFileSelect = async (file: File) => {
    setSelectedImage(file);
    setErrorMessageTextImage(null);
    setTextProcessingSource('imageFile');
    setShowTextProcessingModal(true);
    setScreenshotStage('processing');
    setIsProcessingTextImage(true);

    try {
      const ocrText = await extractTextFromImage(file);
      setTextInput(ocrText);
      const reader = new FileReader();
      reader.onload = () => setScreenshotImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      setScreenshotStage('completed');
    } catch (error) {
      setErrorMessageTextImage(error instanceof Error ? error.message : 'OCR 처리 중 오류가 발생했습니다.');
      setScreenshotStage('idle');
      setShowTextProcessingModal(false);
    } finally {
      setIsProcessingTextImage(false);
    }
  };

  useEffect(() => {
    if (showScreenshotModal) {
      isCancelledRef.current = false;
      setScreenshotStage('idle');
      setErrorMessageTextImage(null);
      setScreenshotImagePreview(null);
    }
  }, [showScreenshotModal]);

  return (
    <div className="pt-3 pb-4 bg-zinc-50 dark:bg-black">
      <main className="max-w-[1200px] mx-auto px-8">
        {/* Hero 섹션 */}
        <section className="relative pt-2 pb-3">
          <div className="flex flex-col gap-2 lg:gap-3">
            <div className="relative flex items-center justify-center">
              <div className="flex flex-col gap-2 text-center">
                <p className="text-sm text-gray-500 leading-tight">
                  엑셀 파일, 텍스트, 이미지로 전달된 주문 정보를 불러와 3PL 업로드 파일로 자동 변환합니다.
                </p>
              </div>

                {/* 포인트 표시(오른쪽 절대 위치) - order-convert와 동일한 기준 컨테이너에 배치 */}
                <div className="absolute right-0 bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-1.5 px-4 rounded-lg shadow-md min-w-[200px]">
                  <div className="flex items-center gap-2 justify-end">
                    <Coins className="w-4 h-4" />
                    <span className="font-medium text-sm">잔여포인트</span>
                    <span className="text-lg font-bold">:0</span>
                  </div>
                </div>
            </div>

              {/* (중복 배지 제거) */}

            {/* 통합 입력 카드(복제) */}
            <div className="w-full border-2 border-purple-500 rounded-xl bg-white p-5">
              <div className="flex flex-col lg:flex-row gap-5">
                {/* 왼쪽: 파일선택 영역 */}
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
                      isDragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400'
                    }`}
                  >
                    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700">엑셀파일 · 이미지파일</p>
                        <p className="text-xs text-gray-500">클릭하거나 드래그하여 업로드하세요</p>
                        <p className="text-xs text-gray-400 mt-1.5">(xlsx, xls, jpg, png, gif)</p>
                      </div>

                      {uploadedExcelFile && (
                        <div className="flex items-center justify-center gap-3 mt-2 text-sm text-gray-600">
                          <span>
                            📄 선택된 파일: {uploadedExcelFile.name}
                            {uploadedFileCount > 1 && ` 외 ${uploadedFileCount - 1}개`}
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
                    className="w-full mt-2.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                    onClick={() => {
                      console.log('[3PL UI] 캡처화면(스크린샷) 주문 변환 버튼 클릭');
                      setShowScreenshotModal(true);
                    }}
                  >
                    캡처화면 주문변환 (스크린샷 주문 변환)
                  </button>
                </div>

                {/* 오른쪽: 텍스트 주문입력 영역 */}
                <div className="w-full lg:w-1/2 border-l-0 lg:border-l border-gray-200 pl-0 lg:pl-5 flex flex-col">
                  <h3 className="text-base font-semibold text-gray-900 mb-2.5">텍스트 주문입력</h3>
                  <p className="text-xs text-gray-600 mb-2.5 leading-relaxed">
                    카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣으면 3PL 변환을 진행할 수 있습니다
                  </p>

                  <div className="space-y-2.5">
                    <textarea
                      className="w-full h-36 rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                      placeholder={
                        '예) 받는사람: 홍길동\n' +
                        '전화번호: 010-1234-5678\n' +
                        '주소: 서울시 강남구 테헤란로 123 4층\n' +
                        '상품: 무선 마우스 블랙 / 수량 2개\n' +
                        '요청사항: 부재 시 경비실에 맡겨주세요'
                      }
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      disabled={isProcessingTextImage}
                    />

                    <button
                      type="button"
                      className="w-full px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:bg-purple-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log('[3PL UI] 텍스트 주문 변환 버튼 클릭:', textInput.trim());
                        const today = new Date().toDateString();
                        const hideToday = localStorage.getItem('hideTextConvertModal');
                        if (hideToday === today) {
                          await handleTextConvert();
                          return;
                        }
                        setShowTextConvertModal(true);
                      }}
                      disabled={isProcessingTextImage || !textInput.trim()}
                    >
                      {isProcessingTextImage ? '변환 중...' : '텍스트 주문 변환'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 변환된 파일 출력 영역(빈 상태 유지) */}
        <section className="relative py-3">
          <div className="w-full bg-gray-200 border border-gray-300 rounded-xl">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold">미리보기</h3>
                {excelConvertError && (
                  <p className="text-sm text-red-600 whitespace-nowrap overflow-hidden text-ellipsis">
                    {excelConvertError}
                  </p>
                )}
                {hasActivePreview && (
                  <button
                    type="button"
                    onClick={() => setIsPreviewExpanded((prev) => !prev)}
                    className="w-20 h-9 inline-flex items-center justify-center text-sm border rounded transition bg-white hover:bg-gray-50"
                  >
                    {isPreviewExpanded ? '접기' : '펼치기'}
                  </button>
                )}

                <div className="w-20 flex-shrink-0">
                  {hasActivePreview && selectedRows.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedRows}
                      className="w-20 h-9 inline-flex items-center justify-center text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
                    >
                      선택 삭제
                    </button>
                  )}
                </div>

                {hasActivePreview && (
                  <p className="text-sm text-gray-500 flex-1">
                    ✔ 셀을 클릭하면 수정할 수 있습니다. ✔ 주소, 상품 등을 클릭하면 오름/내림차순 정렬됩니다.
                    {' '}
                    ✔ 체크박스로 선택 후 삭제할 수 있습니다.
                  </p>
                )}
              </div>
            </div>

            {!hasActivePreview ? (
              <div className="min-h-[192px] flex items-center justify-center text-gray-400">
                변환된 3PL 주문 데이터가 여기에 표시됩니다.
              </div>
            ) : (
              <div
                className={`border rounded-lg bg-white flex flex-col overflow-hidden mx-6 mb-6 ${
                  isPreviewExpanded ? 'max-h-[750px] h-auto' : 'h-[260px]'
                }`}
              >
                <div className="px-4 py-3 border-b bg-gray-50 flex-shrink-0">
                  <p className="text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                    총 {derivedPreviewMeta.total}건 / 누락 {derivedPreviewMeta.missingCount}건
                  </p>
                </div>
                <div className={`${isPreviewExpanded ? '' : 'flex-1'} overflow-auto min-h-0 preview-scrollbar-purple`}>
                  <table className="min-w-max text-sm border border-gray-300 border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-20">
                      <tr>
                        <th className="border border-gray-300 px-2 py-1 text-left font-semibold border-b whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={previewRows.length > 0 && selectedRows.length === previewRows.length}
                            onChange={handleToggleAllRows}
                          />
                        </th>
                        {courierHeaders.map((header) => (
                          <th
                            key={header}
                            className="border border-gray-300 px-2 py-1 text-left font-semibold border-b whitespace-nowrap cursor-pointer select-none"
                            onClick={() => handleSortByHeader(header)}
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
                                    sortConfig.direction === 'asc' ? 'text-blue-600 text-xs' : 'text-red-600 text-xs'
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
                      {previewRows.map((row) => {
                        const isNewRow = newRows.has(row.rowId);
                        return (
                          <tr
                            key={row.rowId}
                            className={`transition-colors ${
                              selectedRows.includes(row.rowId)
                                ? 'bg-purple-50'
                                : isNewRow
                                  ? 'bg-green-100 animate-pulse'
                                  : row.missingReasons && row.missingReasons.length > 0
                                    ? 'bg-yellow-50'
                                    : 'hover:bg-gray-50'
                            }`}
                          >
                          <td className="border border-gray-300 px-2 py-1 border-b whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedRows.includes(row.rowId)}
                              onChange={() => handleToggleRow(row.rowId)}
                            />
                          </td>
                          {courierHeaders.map((header) => {
                            const value = row.data[header] ?? '';
                            const isEditingCell = editingCell?.rowId === row.rowId && editingCell?.header === header;
                            return (
                              <td
                                key={`${row.rowId}-${header}`}
                                className={`border border-gray-300 px-2 py-1 border-b whitespace-nowrap cursor-pointer ${
                                  isEditingCell ? 'bg-yellow-100' : ''
                                }`}
                                onClick={() => {
                                  if (!isEditingCell) handleStartEditCell(row.rowId, header, value);
                                }}
                              >
                                {isEditingCell ? (
                                  <input
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onBlur={handleCommitEditCell}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleCommitEditCell();
                                      if (e.key === 'Escape') {
                                        setEditingCell(null);
                                        setEditingValue('');
                                      }
                                    }}
                                    autoFocus
                                    className="w-full h-full border-0 p-0 bg-transparent outline-none text-sm"
                                    style={{ minHeight: '1.25rem' }}
                                  />
                                ) : (
                                  value
                                )}
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
            )}
          </div>
        </section>

        {/* 기능 설명 카드 영역(복제) */}
        <section className="relative pt-4 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 lg:gap-3">
            {/* 카드 1: 템플릿/매핑(상/하 2분할) */}
            <div className="h-[120px] flex flex-col gap-2">
              <button
                type="button"
                className="h-[56px] bg-gray-200 border border-gray-300 rounded-xl px-5 flex flex-col justify-center transition-colors hover:bg-gray-100"
                onClick={() => {
                  console.log('[3PL UI] 카드1-상단: 3PL 템플릿 업로드 양식 등록 클릭');
                  setShowThreePlTemplateModal(true);
                }}
              >
                <div className="flex items-center justify-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100">
                    <Truck className="w-4 h-4 text-gray-500" />
                  </div>
                  <h3 className="text-[12px] font-semibold text-gray-900 text-center leading-tight">
                    3PL 템플릿 업로드 양식 등록
                  </h3>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5 text-center leading-tight">
                  템플릿 선택
                </p>
              </button>

              <button
                type="button"
                className="h-[56px] bg-gray-200 border border-gray-300 rounded-xl px-5 flex flex-col justify-center transition-colors hover:bg-gray-100"
                onClick={() => {
                  console.log('[3PL UI] 카드1-하단: 상품코드 매핑 파일 업로드 클릭');
                  setShowMappingModal(true);
                }}
              >
                <div className="flex items-center justify-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100">
                    <Upload className="w-4 h-4 text-gray-500" />
                  </div>
                  <h3 className="text-[12px] font-semibold text-gray-900 text-center leading-tight">
                    상품코드 매핑 파일 업로드
                  </h3>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5 text-center leading-tight">
                  매핑 파일 업로드
                </p>
              </button>

            </div>

            {/* 카드 2: 고정 입력 정보 설정(복제용 UI만) */}
            <button
              type="button"
              onClick={() => {
                console.log('[3PL UI] 카드2: 고정 입력 정보 설정 클릭');
                setShowFixedInputModal(true);
              }}
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Search className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">고정 입력 정보 설정</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center leading-relaxed">
                보내는/받는 정보 등 모든 주문에 공통으로 적용되는 값을
                <br />
                미리 등록해두면 입력이 줄어듭니다.
              </p>
            </button>

            {/* 카드 3: 택배 업로드 파일 다운로드 -> 3PL 출력 파일 다운로드 */}
            <button
              type="button"
              onClick={() => console.log('[3PL UI] 카드3: 3PL 출력 파일 다운로드 클릭')}
              className="h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100"
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <ArrowDown className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">3PL 출력 파일 다운로드</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center leading-relaxed">
                변환이 완료된 데이터를 3PL 업로드용 파일로 내려받는 단계입니다.
                <br />
                (현재는 UI만 존재)
              </p>
            </button>
          </div>

          {/* 주문변환과 동일: 사용 중 양식 / 고정 입력 요약 */}
          {selectedTemplateHeaders.length > 0 && (
            <div className="w-full mt-4">
              <p className="text-xs text-blue-600 w-full whitespace-nowrap overflow-hidden text-ellipsis">
                <span className="inline-block py-0.5 px-2 rounded-md text-xs font-medium bg-blue-50 text-blue-600">
                  사용 중인 양식 :
                </span>{' '}
                {selectedTemplateHeaders.join(' · ')}
              </p>
              {fixedSummaryEntries.length > 0 && (
                <p className="text-xs text-blue-500 w-full whitespace-nowrap overflow-hidden text-ellipsis mt-1">
                  <span className="inline-block py-0.5 px-2 rounded-md text-xs font-medium bg-blue-50 text-blue-600">
                    고정 입력 정보 :
                  </span>{' '}
                  {fixedSummaryEntries.map((header) => `${header} ${fixedHeaderValues[header]}`).join(' · ')}
                </p>
              )}
              {selectedMappingSummary && (
                <p className="text-xs text-blue-500 w-full whitespace-nowrap overflow-hidden text-ellipsis mt-1">
                  <span className="inline-block py-0.5 px-2 rounded-md text-xs font-medium bg-blue-50 text-blue-600">
                    상품코드 매핑 :
                  </span>{' '}
                  {selectedMappingSummary}
                </p>
              )}
            </div>
          )}
        </section>

      </main>

      {/* 3PL 템플릿 업로드 양식 등록 모달(크기/형식: order-convert 복제) */}
      {showThreePlTemplateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowThreePlTemplateModal(false)}
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
                type="button"
                onClick={() => setShowThreePlTemplateModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            <div className="space-y-2 mb-6 overflow-y-auto flex-1 min-h-0">
              <div className="w-full px-4 py-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  이미 사용 중인 3PL 업로드 양식이 있으신가요?
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                  지금 3PL에 올리고 있는
                  <br />
                  업로드 엑셀 양식을 한 번만 등록하면,
                  <br />
                  그 양식 그대로 자동 설정됩니다.
                </p>

                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    console.log('[3PL UI] 3PL 템플릿 파일 선택됨:', f?.name ?? '(none)');
                    if (!f) return;

                    try {
                      const columnOrder = await parseExcelHeadersFromFile(f);
                      const newId = `threepl-template-${Date.now()}`;
                      const nextFormat: RecentExcelFormat = {
                        id: newId,
                        displayName: f.name.replace(/\.[^.]+$/, ''),
                        createdAt: new Date().toISOString(),
                        columnOrder,
                      };

                      setRecentExcelFormats((prev) => [nextFormat, ...prev]);
                      setTempSelectedFormatId(newId);
                      setRegistrationSuccessMessage('등록이 완료되었습니다');
                      setShowRecentTemplate(true);
                      setTimeout(() => setRegistrationSuccessMessage(null), 3500);
                    } catch (err) {
                      console.error('[3PL UI] 템플릿 엑셀 파싱 오류:', err);
                      setRegistrationSuccessMessage('엑셀을 읽는 중 오류가 발생했습니다.');
                      setTimeout(() => setRegistrationSuccessMessage(null), 3500);
                    }

                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={() => {
                    console.log('[3PL UI] 내 업로드 파일 등록하기 버튼 클릭');
                    templateInputRef.current?.click();
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-11 rounded-lg font-medium text-sm"
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
                    type="button"
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
                        recentExcelFormats.length > 1
                          ? `등록된 엑셀 양식 ${index + 1}`
                          : '등록된 엑셀 양식';

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
                                onChange={() => {
                                  console.log('[3PL UI] 템플릿 양식 선택됨:', format.id);
                                  setTempSelectedFormatId(format.id);
                                }}
                                className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 dark:bg-zinc-800"
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
                                            setRecentExcelFormats((prev) =>
                                              prev.map((p) =>
                                                p.id === format.id
                                                  ? { ...p, displayName: editingDisplayName.trim() || undefined }
                                                  : p,
                                              ),
                                            );
                                            setEditingFormatId(null);
                                            setEditingDisplayName('');
                                          } else if (e.key === 'Escape') {
                                            setEditingFormatId(null);
                                            setEditingDisplayName('');
                                          }
                                        }}
                                        autoFocus
                                        className="w-[40%] min-w-[240px] px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                                        placeholder="양식 이름을 입력하세요"
                                      />
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRecentExcelFormats((prev) =>
                                            prev.map((p) =>
                                              p.id === format.id
                                                ? { ...p, displayName: editingDisplayName.trim() || undefined }
                                                : p,
                                            ),
                                          );
                                          setEditingFormatId(null);
                                          setEditingDisplayName('');
                                        }}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs whitespace-nowrap"
                                      >
                                        확인
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingFormatId(null);
                                          setEditingDisplayName('');
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
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingFormatId(format.id);
                                          setEditingDisplayName(format.displayName || '');
                                        }}
                                        className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                      >
                                        이름 변경하기
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          console.log('[3PL UI] 템플릿 양식 삭제 클릭:', format.id);
                                          setRecentExcelFormats((prev) => {
                                            const next = prev.filter((p) => p.id !== format.id);
                                            if (tempSelectedFormatId === format.id) {
                                              setTempSelectedFormatId(next[0]?.id ?? '');
                                            }
                                            return next;
                                          });
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

                              <div className={`h-[22px] ${tempSelectedFormatId === format.id ? 'visible' : 'invisible'}`}>
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
                  onClick={() => setShowThreePlTemplateModal(false)}
                  className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log('[3PL UI] 3PL 템플릿 양식 등록 선택 확인 클릭:', tempSelectedFormatId);
                    setShowThreePlTemplateModal(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm text-white font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상품코드 매핑 파일 업로드 모달(템플릿 모달과 동일한 크기/형식) */}
      {showMappingModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowMappingModal(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[900px] h-[798px] max-h-[798px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                매핑 파일 등록 선택
              </h2>
              <button
                type="button"
                onClick={() => setShowMappingModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            <div className="space-y-2 mb-6 overflow-y-auto flex-1 min-h-0">
              <div className="w-full px-4 py-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  상품코드 매핑 파일을 등록해주세요
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                  매핑 파일은 템플릿 양식과 별도로 관리됩니다.
                  <br />
                  업로드한 엑셀의 행/열 구조를 그대로 표시합니다.
                  <br />
                  데이터가 길면 아래에서 스크롤로 확인할 수 있습니다.
                </p>

                <input
                  ref={mappingInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    console.log('[3PL UI] 매핑 파일 선택됨:', f?.name ?? '(none)');
                    if (!f) return;

                    try {
                      const rows = await parseExcelRowsFromFile(f);
                      const newId = `threepl-mapping-${Date.now()}`;
                      const nextMapping: MappingFileFormat = {
                        id: newId,
                        displayName: f.name.replace(/\.[^.]+$/, ''),
                        createdAt: new Date().toISOString(),
                        rows,
                      };

                      setRecentMappingFormats((prev) => [nextMapping, ...prev]);
                      setTempSelectedMappingId(newId);
                      setMappingData(rows);
                      setShowRecentMapping(true);
                      setMappingRegistrationMessage('등록이 완료되었습니다');
                      setTimeout(() => setMappingRegistrationMessage(null), 3500);
                    } catch (err) {
                      console.error('[3PL UI] 매핑 엑셀 파싱 오류:', err);
                      setMappingRegistrationMessage('엑셀을 읽는 중 오류가 발생했습니다.');
                      setTimeout(() => setMappingRegistrationMessage(null), 3500);
                    }

                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={() => {
                    console.log('[3PL UI] 매핑 파일 등록하기 버튼 클릭');
                    mappingInputRef.current?.click();
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-11 rounded-lg font-medium text-sm"
                >
                  내 매핑 파일 등록하기
                </button>

                {mappingRegistrationMessage && (
                  <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                    {mappingRegistrationMessage}
                  </p>
                )}
              </div>

              {Array.isArray(recentMappingFormats) && recentMappingFormats.length > 0 && (
                <div className="space-y-2 mt-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setMappingPreviewMode((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'))
                      }
                      className="px-3 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      {mappingPreviewMode === 'vertical' ? '가로 보기' : '세로 보기'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRecentMapping(!showRecentMapping)}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800 text-left hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                      등록된 매핑 파일
                      {recentMappingFormats.length > 0 ? ` (${recentMappingFormats.length})` : ''}
                    </span>
                  </button>

                  {showRecentMapping &&
                    recentMappingFormats.map((format, index) => {
                      const savedDate = new Date(format.createdAt);
                      const dateStr = `${savedDate.getFullYear()}-${String(savedDate.getMonth() + 1).padStart(
                        2,
                        '0',
                      )}-${String(savedDate.getDate()).padStart(2, '0')} ${String(savedDate.getHours()).padStart(
                        2,
                        '0',
                      )}:${String(savedDate.getMinutes()).padStart(2, '0')}`;
                      const defaultDisplayName =
                        recentMappingFormats.length > 1 ? `등록된 매핑 파일 ${index + 1}` : '등록된 매핑 파일';

                      return (
                        <div
                          key={`${format.id}-${index}`}
                          className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-left transition-colors min-h-[120px]"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 pt-0.5">
                              <input
                                type="radio"
                                name="selectedMappingFormat"
                                checked={tempSelectedMappingId === format.id}
                                onChange={() => {
                                  console.log('[3PL UI] 매핑 파일 선택됨:', format.id);
                                  setTempSelectedMappingId(format.id);
                                }}
                                className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 dark:bg-zinc-800"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-2">
                                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                  {format.displayName || defaultDisplayName}
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('[3PL UI] 매핑 파일 삭제 클릭:', format.id);
                                      setRecentMappingFormats((prev) => {
                                        const next = prev.filter((p) => p.id !== format.id);
                                        if (tempSelectedMappingId === format.id) {
                                          setTempSelectedMappingId(next[0]?.id ?? '');
                                          setMappingData(null);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                  >
                                    삭제
                                  </button>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{dateStr}</span>
                                </div>
                              </div>

                              <div
                                className={`h-[22px] ${
                                  tempSelectedMappingId === format.id ? 'visible' : 'invisible'
                                }`}
                              >
                                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5 mb-1">
                                  ✔ 이 매핑 파일이 사용됩니다
                                </div>
                              </div>

                              {mappingPreviewMode === 'vertical' ? (
                                <div className="mt-1 border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 max-h-[190px] overflow-y-auto">
                                  <table className="w-full text-[11px] text-zinc-700 dark:text-zinc-300">
                                    <tbody>
                                      {format.rows.length > 0 ? (
                                        format.rows.map((row, rowIdx) => (
                                          <tr key={`${format.id}-row-${rowIdx}`} className="border-b last:border-b-0 border-zinc-200 dark:border-zinc-700">
                                            {row.length > 0 ? (
                                              row.map((cell, colIdx) => (
                                                <td key={`${format.id}-cell-${rowIdx}-${colIdx}`} className="px-2 py-1.5 align-top whitespace-pre-wrap break-words">
                                                  {cell || '-'}
                                                </td>
                                              ))
                                            ) : (
                                              <td className="px-2 py-1.5 text-zinc-400">(빈 행)</td>
                                            )}
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td className="px-2 py-2 text-zinc-400">데이터가 없습니다.</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="mt-1 border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 px-2 py-2 overflow-x-auto">
                                  <div className="text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                                    {format.rows.flatMap((row) => row).filter((cell) => String(cell).trim() !== '').length >
                                    0
                                      ? format.rows
                                          .flatMap((row) => row)
                                          .filter((cell) => String(cell).trim() !== '')
                                          .join(' · ')
                                      : '데이터가 없습니다.'}
                                  </div>
                                </div>
                              )}
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
                등록된 매핑 파일은 브라우저에 안전하게 저장되며, 이 페이지에서만 사용됩니다.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMappingModal(false)}
                  className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log('[3PL UI] 매핑 파일 등록 선택 확인 클릭:', tempSelectedMappingId);
                    const fmt = recentMappingFormats.find((f) => f.id === tempSelectedMappingId);
                    setMappingData(fmt?.rows ?? null);
                    setShowMappingModal(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm text-white font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 고정 입력 정보 설정 모달(주문변환과 동일 형식) */}
      {showFixedInputModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowFixedInputModal(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[1482px] h-[84vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">고정 입력 정보 설정</h2>
              <button
                type="button"
                onClick={() => setShowFixedInputModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            <div className="mb-6 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                모든 주문에 동일하게 적용할 보내는 사람 정보를 설정합니다.
                <br />
                고정 입력은 선택 기능이며, 모든 주문에 동일한 정보가 있을 때만 설정하면 됩니다.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[400px] pb-2">
              <div className="flex flex-wrap gap-4 mb-6 max-h-[300px] overflow-y-auto">
                {selectedTemplateHeaders.length > 0 ? (
                  selectedTemplateHeaders.map((headerName, index) => {
                    const isEditing = editingFixedHeader === headerName;
                    const savedValue = fixedHeaderValues[headerName] || '';
                    const hasValue = savedValue.trim() !== '';

                    if (isEditing) {
                      return (
                        <div
                          key={`${headerName}-${index}`}
                          className="flex items-center gap-2 px-4 py-2 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800"
                        >
                          <input
                            type="text"
                            value={fixedInputDraft}
                            onChange={(e) => setFixedInputDraft(e.target.value)}
                            className="flex-1 min-w-[140px] px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            placeholder="입력"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setFixedHeaderValues((prev) => ({ ...prev, [headerName]: fixedInputDraft }));
                                setEditingFixedHeader(null);
                              } else if (e.key === 'Escape') {
                                setEditingFixedHeader(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setFixedHeaderValues((prev) => ({ ...prev, [headerName]: fixedInputDraft }));
                              setEditingFixedHeader(null);
                            }}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors"
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFixedHeader(null)}
                            className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded text-sm font-medium transition-colors"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFixedHeaderValues((prev) => {
                                const next = { ...prev };
                                delete next[headerName];
                                return next;
                              });
                              setEditingFixedHeader(null);
                            }}
                            className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded text-sm font-medium transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={`${headerName}-${index}`}
                        type="button"
                        className={`px-6 py-2 rounded-lg font-medium cursor-pointer flex flex-col items-center transition-colors relative ${
                          hasValue
                            ? 'border border-zinc-300 dark:border-zinc-700 bg-purple-50 dark:bg-purple-950/30 text-zinc-900 dark:text-zinc-100 hover:bg-purple-100 dark:hover:bg-purple-950/50'
                            : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                        }`}
                        onClick={() => {
                          setEditingFixedHeader(headerName);
                          setFixedInputDraft(savedValue);
                        }}
                      >
                        {hasValue && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-sm">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        {hasValue ? (
                          <>
                            <span className="text-base">{savedValue}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              (표기: {headerName})
                            </span>
                          </>
                        ) : (
                          <span className="text-base">{headerName}</span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-zinc-500 dark:text-zinc-400 text-sm w-full">
                    템플릿 양식을 먼저 선택해야 고정 입력을 설정할 수 있습니다.
                  </div>
                )}
              </div>

              <div className="mt-4 mb-2 p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">현재 설정된 고정 입력 값</h3>
                <div className="space-y-1.5 mb-3">
                  {selectedTemplateHeaders.filter((header) => fixedHeaderValues[header]?.trim()).length > 0 ? (
                    selectedTemplateHeaders
                      .filter((header) => fixedHeaderValues[header]?.trim())
                      .map((header, idx) => (
                        <div key={`${header}-${idx}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          • {header}: {fixedHeaderValues[header]}
                        </div>
                      ))
                  ) : (
                    <div className="text-xs text-zinc-400">설정된 고정 입력 값이 없습니다.</div>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  설정된 고정 입력 값은 택배 업로드 파일 다운로드 시 자동으로 입력됩니다.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  console.log('[3PL UI] 고정 입력 정보 확인 클릭:', fixedHeaderValues);
                  setShowFixedInputModal(false);
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white h-11 rounded-lg font-medium"
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
                주문정보로 변환하여 미리보기에 반영하겠습니다.
              </p>
              <div className="space-y-3 pl-1">
                <p className="text-sm text-gray-600 leading-relaxed">변환 완료 후 내용을 한 번 더 확인해주세요 ·</p>
                <p className="text-sm text-gray-600 leading-relaxed">미리보기에서 수정 가능합니다 ·</p>
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
                    setDontShowToday(false);
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={executeTextConvert}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                >
                  미리보기로 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

            <div className="mb-6">
              <p className="text-sm text-gray-700 leading-relaxed mb-2">주문 화면을 먼저 캡처하세요.</p>
              <p className="text-sm text-gray-700 leading-relaxed">PrintScreen 또는 캡처 도구를 사용한 뒤</p>
              <p className="text-sm text-gray-700 leading-relaxed">Ctrl + V 또는 마우스 우클릭 → 붙여넣기 하세요.</p>
            </div>

            <div
              ref={screenshotPasteAreaRef}
              tabIndex={0}
              contentEditable={screenshotStage === 'idle' ? 'true' : 'false'}
              suppressContentEditableWarning
              onPaste={handlePaste}
              onInput={handleInput}
              onKeyDown={(e) => {
                if (screenshotStage !== 'idle') {
                  e.preventDefault();
                  return;
                }
                if (e.key !== 'v' || !e.ctrlKey) {
                  e.preventDefault();
                }
              }}
              className={`w-full min-h-[300px] border-2 border-dashed rounded-lg p-6 mb-4 transition-colors ${
                screenshotStage === 'processing'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-300 bg-gray-50 hover:border-purple-400 cursor-pointer'
              }`}
              style={{ outline: 'none', userSelect: 'none' }}
            >
              {screenshotStage === 'idle' ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-sm font-medium text-gray-700 mb-2">이미지를 붙여넣으세요</p>
                  <p className="text-xs text-gray-500">Ctrl + V 또는 우클릭 → 붙여넣기</p>
                </div>
              ) : screenshotImagePreview ? (
                <div className="flex flex-col items-center justify-center h-full relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={screenshotImagePreview} alt="붙여넣은 이미지" className="max-w-full max-h-[400px] rounded-lg shadow-md mb-4" />
                  {screenshotStage === 'processing' ? (
                    <div className="flex items-center gap-2 text-purple-600">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-medium">주문 데이터를 정리중입니다...</span>
                    </div>
                  ) : screenshotStage === 'completed' ? (
                    <div className="flex flex-col items-center gap-2 mt-2">
                      <div className="flex items-center gap-2 text-green-600">
                        <Check className="w-5 h-5" />
                        <span className="text-sm font-medium">스크린샷을 확인하였습니다</span>
                      </div>
                      <p className="text-xs text-gray-600">주문정보를 처리하기 위해 텍스트로 변환하고 있습니다</p>
                      <p className="text-xs text-gray-600">
                        텍스트 완성이 되면 오른쪽 <span className="font-semibold text-purple-600">텍스트 주문 변환</span> 버튼을 눌러주세요
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {errorMessageTextImage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{errorMessageTextImage}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleScreenshotModalClose}
                className={`px-4 py-2 text-sm border border-gray-300 rounded transition-colors ${
                  screenshotStage === 'processing' ? 'hover:bg-red-50 border-red-300 text-red-600' : 'hover:bg-gray-100'
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-[500px] p-6">
            <div className="flex flex-col items-center justify-center text-center">
              {screenshotStage === 'processing' ? (
                <>
                  <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    {textProcessingSource === 'screenshot'
                      ? '스크린샷에서 텍스트를 정리중입니다'
                      : '이미지 파일에서 텍스트를 정리중입니다'}
                  </p>
                  <p className="text-sm text-gray-600">
                    텍스트정리가 완료되면 텍스트변환버튼을 눌러 미리보기에 반영하세요
                  </p>
                </>
              ) : screenshotStage === 'completed' ? (
                <>
                  <Check className="w-12 h-12 text-green-500 mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">텍스트로 변환이 완료되었습니다</p>
                  <p className="text-sm text-gray-600 mb-4">텍스트 변환하기 버튼을 눌러주세요</p>
                  <button
                    onClick={() => setShowTextProcessingModal(false)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    확인
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

