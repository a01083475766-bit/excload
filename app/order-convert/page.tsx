/**
 * ⚠️ EXCLOAD CONSTITUTION v4.0 적용 파일
 * 모든 수정 전 CONSTITUTION.md 필독
 * 3단계 분리 파이프라인 유지 필수
 * 기준헤더 내부 전용, UI 노출 금지
 */

'use client';

import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback, type UIEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FileSpreadsheet, Truck, Search, ArrowDown, Image, X, Check, Upload, Loader2 } from 'lucide-react';
import { runTemplatePipeline } from '@/app/pipeline/template/template-pipeline';
import {
  buildTemplateHeaderLogPayload,
  buildOrderFileHeaderLogPayload,
  logTemplateHeaderUpload,
} from '@/app/lib/template-header-log';
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
import { fetchOrderPipelineStage2 } from '@/app/lib/fetch-order-pipeline-stage2';
import { useWorkerSortedRows } from '@/app/hooks/useWorkerSortedRows';
import { useHistoryStore } from '@/app/store/historyStore';
import { useAuthAssetsReady } from '@/app/hooks/useAuthAssetsReady';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import { WorkspaceFormStatusBanner } from '@/app/components/WorkspaceFormStatusBanner';
import { DefaultCjTemplateNotice } from '@/app/components/DefaultCjTemplateNotice';
import {
  buildDefaultCjCourierSeed,
  DEFAULT_CJ_FORMAT_ID,
  DEFAULT_CJ_INTRO_COPY,
  isActiveDefaultCjTemplate,
  isDefaultCjAutoSeedOptOutForUserIds,
  isDefaultCjIntroAcknowledged,
  isDefaultCjSeedFormat,
  isDefaultCjSeedFormatId,
  ORDER_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY,
  ORDER_DEFAULT_CJ_INTRO_SUPPRESS_KEY,
  ORDER_DEFAULT_CJ_OPT_OUT_KEY,
  setDefaultCjAutoSeedOptOutForUserIds,
  setDefaultCjIntroAcknowledged,
} from '@/app/lib/default-cj-courier-template';
import { WorkspaceSettingsCheckingOverlay } from '@/app/components/WorkspaceSettingsCheckingOverlay';
import { UploadTemplateChangeReuploadModal } from '@/app/components/UploadTemplateChangeReuploadModal';
import { usePreviewWorkspaceSession } from '@/app/hooks/usePreviewWorkspaceSession';
import { useClearPreviewOnBridgeChange } from '@/app/hooks/useClearPreviewOnBridgeChange';
import {
  clearAllPreviewWorkspacesForScope,
  clearPreviewWorkspace,
  migratePreviewWorkspaceGuestToUser,
} from '@/app/lib/preview-workspace-session';
import {
  clearWorkspaceFiles,
  loadWorkspaceFiles,
  putWorkspaceFiles,
} from '@/app/lib/workspace-order-files-idb';
import type { SourceType, FileMetadata, SenderInfo } from '@/app/store/historyStore';
import {
  emptyInputSourceCounts,
  incrementInputSource,
  normalizeInputSourcesForSession,
  primarySourceTypeFromCounts,
  type InputSourceCounts,
} from '@/app/lib/history-input-sources';
import { useUserStore } from '@/app/store/userStore';
import { Coins } from 'lucide-react';
import {
  NormalizeQualityNoticeModal,
  isLikelyClientNetworkError,
  type NormalizeQualityNoticeVariant,
} from '@/app/components/NormalizeQualityNoticeModal';
import { resolveNormalizeQualityNotice } from '@/app/lib/normalize-29/normalize29-error';
import { isExcloudPipelineDebugClient } from '@/app/lib/excloud-pipeline-debug';
import { FREE_TEXT_INPUT_MAX_CHARS } from '@/app/lib/plan-limits';
import { shouldChargeDownloadPoints, hasProEntitlementClient } from '@/app/lib/feedback-event/client';
import {
  buildPreviewDownloadAoA,
  buildPreviewDownloadFileName,
  createPreviewDownloadWorkbook,
} from '@/app/lib/excel/preview-download-xlsx';
import {
  isTrackingNumberUploadHeader,
  sanitizeTrackingNumberForUpload,
} from '@/app/lib/sanitize-tracking-number-for-upload';
import {
  TextConvertResultReviewModal,
  buildTextConvertReviewRows,
  type TextConvertReviewRow,
} from '@/app/components/TextConvertResultReviewModal';
import { RequiresAccountOrderModal } from '@/app/components/RequiresAccountOrderInput';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';
import {
  OrderConvertPreviewTableRow,
  type PreviewRowWithId,
} from '@/app/order-convert/OrderConvertPreviewTableRow';
import {
  BundleShippingModal,
  type BundleShippingApplyPayload,
  type BundleShippingApplySummary,
} from '@/app/order-convert/BundleShippingModal';
import {
  countBundleShippingDuplicateRows,
  detectBundleShippingGroups,
} from '@/app/order-convert/bundle-shipping-utils';
import {
  ORDER_CONVERT_KEYS,
  readLocalStorageWithLegacyMigrate,
  writeLocalStorageForUser,
  removeLocalStorageForUser,
} from '@/app/lib/scoped-local-storage';
import {
  deleteFixedHeaderEntry,
  patchFixedHeaderEntry,
  pruneFixedInputToCourierKeys,
} from '@/app/lib/fixed-header-values';
import {
  registerOrderSnapshotsForPreviewChunk,
  pruneOrderSnapshotsForRowIds,
} from '@/app/lib/order-standard-row-snapshot';
import { reapplyFixedInputToPreviewRows } from '@/app/lib/reapply-fixed-input-preview';
import {
  buildCourierTemplateFromHeaders,
  buildTrialBridgeFile,
} from '@/app/logistics-convert/trial-sample-formats';

/** 미리보기 상단·보조 액션 버튼 공통 틀 (색상·배경만 개별 지정) */
const PREVIEW_TOOLBAR_BTN =
  'inline-flex h-9 flex-shrink-0 items-center justify-center rounded-lg border px-3 text-sm font-medium leading-none transition';
const DEFAULT_CJ_INTRO_SUPPRESS_KEY = ORDER_DEFAULT_CJ_INTRO_SUPPRESS_KEY;
const MANUAL_TEMPLATE_INITIAL_HEADERS = ['', '', '', ''];
const MANUAL_TEMPLATE_HEADER_EXAMPLES = [
  '주문 번호',
  '보내는 사람',
  '보내는 사람 전화',
  '보내는 사람 추가 전화',
  '보내는 사람 우편번호',
  '보내는 사람 주소',
  '보내는 사람 상세 주소',
  '받는 사람',
  '받는 사람 전화',
  '받는 사람 추가 전화',
  '받는 사람 우편번호',
  '받는 사람 주소',
  '받는 사람 상세 주소',
  '주문자',
  '주문자 연락처',
  '주문 일시',
  '결제 금액',
  '결제 구분',
  '상품명',
  '추가 상품',
  '상품 옵션',
  '상품 옵션 상세',
  '수량',
  '배송 메시지',
  '상품별 추가 메시지',
  '주문자 추가 메시지',
  '주문 배송비 구분',
  '주문 배송비',
  '운임 구분',
  '운임',
  '운송장 번호',
  '창고 메모',
  '내부 메모',
  '출고 번호',
  '택배사',
  '묶음 배송 번호',
  '분리 배송 여부',
  '분리 배송 출고 예정일',
  '주문시 출고 예정일',
  '출고 발송일',
  '등록 상품명',
  '등록 옵션명',
  '노출 상품명',
  '노출 상품 ID',
  '옵션 ID',
  '최초 등록 옵션명',
  '도서산간 추가 배송비',
  '옵션 판매가',
  '배송 완료일',
  '구매 확정일자',
  '통관용 구매자 전화번호',
  '주문 상태',
  '상품 주문 번호',
  '제휴 주문 번호',
  '관리 상품 번호',
  '판매 상품 번호',
  '판매자 할인',
  '지원 할인',
  '쿠폰명',
  '쿠폰 할인',
  '포인트',
  '주문자 이메일',
  '택배사 코드',
  '배송 첨부 파일',
  '상품 코드',
  '옵션 코드',
  '센터 코드',
  '박스 수량',
  '출고 타입',
  '출고 요청일',
  '주문 ID',
  '출고 지시사항',
  '판매처',
  '개인통관번호',
] as const;

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

type PendingOrderUpload =
  | { kind: 'excel'; file: File }
  | { kind: 'image'; file: File };

type ParsedExcelPreviewChunk = {
  file: File;
  rowIds: string[];
  previewRows: PreviewRowWithId[];
  standardRows: Record<string, string>[];
  courierHeaders: string[];
  unknownHeaders: string[];
  unknownHeaderSamples: UnknownHeaderSamples;
  metrics: {
    fileName: string;
    originalRows: number;
    baseHeaderMatchedRows: number;
    stage1Rows: number;
    stage2Rows: number;
    stage3Rows: number;
    stage4Rows: number;
  };
};

type UnknownHeaderSamples = Record<string, string[]>;
type UnknownHeaderSampleInput = {
  headers: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<unknown>>;
};
type DirectHeaderMapping = Record<string, string | null>;

function maskUnknownHeaderSampleValue(rawValue: unknown): string {
  const value = String(rawValue ?? '').trim();
  if (!value) return '';

  return value
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;

      const chars = Array.from(part);
      if (chars.length <= 2) return part;

      let masked = '';
      for (let i = 0; i < chars.length; i += 4) {
        const chunk = chars.slice(i, i + 4);
        if (chunk.length === 1) {
          masked += chunk[0];
        } else if (chunk.length === 2 && i > 0) {
          masked += `${chunk[0]}*`;
        } else {
          masked += chunk
            .map((char, index) => (index < 2 ? char : '*'))
            .join('');
        }
      }

      return masked;
    })
    .join('');
}

function buildUnknownHeaderSamples(
  unknownHeaders: string[],
  inputFile: UnknownHeaderSampleInput | null | undefined,
): UnknownHeaderSamples {
  if (!inputFile || unknownHeaders.length === 0) return {};

  const exactHeaderIndex = new Map<string, number>();
  const trimmedHeaderIndex = new Map<string, number>();
  inputFile.headers.forEach((header, index) => {
    exactHeaderIndex.set(header, index);
    trimmedHeaderIndex.set(header.trim(), index);
  });

  return unknownHeaders.reduce<UnknownHeaderSamples>((acc, header) => {
    const columnIndex = exactHeaderIndex.get(header) ?? trimmedHeaderIndex.get(header.trim());
    const samples: string[] = [];
    const seen = new Set<string>();

    if (typeof columnIndex === 'number') {
      for (const row of inputFile.rows) {
        const masked = maskUnknownHeaderSampleValue(row[columnIndex]);
        if (!masked || seen.has(masked)) continue;

        seen.add(masked);
        samples.push(masked);
        if (samples.length >= 3) break;
      }
    }

    acc[header] = samples;
    return acc;
  }, {});
}

function buildHeaderSamples(inputFile: UnknownHeaderSampleInput): UnknownHeaderSamples {
  return buildUnknownHeaderSamples([...inputFile.headers], inputFile);
}

function hasDirectHeaderMappings(
  bridgeFile: TemplateBridgeFile | null | undefined,
): bridgeFile is TemplateBridgeFile & { directHeaderMappings: DirectHeaderMapping } {
  return Boolean(
    bridgeFile &&
      bridgeFile.directHeaderMappings &&
      Object.keys(bridgeFile.directHeaderMappings).length > 0,
  );
}

function buildDirectPreviewRowsFromCleanInput(
  inputFile: CleanInputFile,
  bridgeFile: TemplateBridgeFile & { directHeaderMappings: DirectHeaderMapping },
  fixedInput: Record<string, string>,
): PreviewRow[] {
  const exactHeaderIndex = new Map<string, number>();
  const trimmedHeaderIndex = new Map<string, number>();

  inputFile.headers.forEach((header, index) => {
    exactHeaderIndex.set(header, index);
    trimmedHeaderIndex.set(header.trim(), index);
  });

  return inputFile.rows.map((row) => {
    const previewRow: PreviewRow = {};

    for (const courierHeader of bridgeFile.courierHeaders) {
      const sourceHeader = bridgeFile.directHeaderMappings[courierHeader];
      const sourceIndex = sourceHeader
        ? exactHeaderIndex.get(sourceHeader) ?? trimmedHeaderIndex.get(sourceHeader.trim())
        : undefined;
      const orderValue =
        typeof sourceIndex === 'number' ? String(row[sourceIndex] ?? '').trim() : '';
      const fixedValue = String(fixedInput[courierHeader] ?? '').trim();
      let cellValue = orderValue || fixedValue;

      if (isTrackingNumberUploadHeader(courierHeader)) {
        cellValue = sanitizeTrackingNumberForUpload(cellValue);
      }

      previewRow[courierHeader] = cellValue;
    }

    return previewRow;
  });
}

function mergeUnknownHeaders(previous: string[], next: string[]): string[] {
  return [...previous, ...next].filter((header, index, headers) => headers.indexOf(header) === index);
}

function mergeUnknownHeaderSamples(
  previous: UnknownHeaderSamples,
  next: UnknownHeaderSamples,
): UnknownHeaderSamples {
  const merged: UnknownHeaderSamples = { ...previous };

  for (const [header, samples] of Object.entries(next)) {
    const previousSamples = merged[header] ?? [];
    merged[header] = [...previousSamples, ...samples].filter(
      (sample, index, allSamples) => allSamples.indexOf(sample) === index,
    ).slice(0, 3);
  }

  return merged;
}

const isValidCourierTemplate = (template: CourierUploadTemplate | null): boolean => {
  if (template === null) return false;
  if (!Array.isArray(template.headers)) return false;
  if (template.headers.length === 0) return false;
  // name이 비어있지 않은 header가 1개 이상 있을 때만 true
  const nonEmptyHeaders = template.headers.filter(header => header.name && header.name.trim() !== '');
  return nonEmptyHeaders.length > 0;
};

const loadCourierUploadTemplate = (userId: string | null): CourierUploadTemplate | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.template, userId);
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

const saveCourierUploadTemplate = (template: CourierUploadTemplate | null, userId: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (template) {
      writeLocalStorageForUser(ORDER_CONVERT_KEYS.template, userId, JSON.stringify(template));
    } else {
      removeLocalStorageForUser(ORDER_CONVERT_KEYS.template, userId);
    }
  } catch (error) {
    console.error('localStorage에 택배 양식 정보를 저장하는 중 오류 발생:', error);
  }
};

const loadRecentExcelFormats = (userId: string | null): RecentExcelFormat[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.recentFormats, userId);
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
  userId: string | null,
  bridgeFile?: TemplateBridgeFile,
  displayName?: string,
  protectedFromDeletion?: boolean,
  formatId?: string,
) => {
  try {
    let formats = loadRecentExcelFormats(userId);
    const columnOrder = Array.isArray(template.headers) ? template.headers.map((header) => header.name) : [];

    if (formatId) {
      formats = formats.filter((format) => format.id !== formatId);
    }

    const newFormat: RecentExcelFormat = {
      id: formatId ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      columnOrder,
      bridgeFile,
      ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
      ...(protectedFromDeletion ? { protectedFromDeletion: true } : {}),
    };

    const updatedFormats = [newFormat, ...formats];
    writeLocalStorageForUser(ORDER_CONVERT_KEYS.recentFormats, userId, JSON.stringify(updatedFormats));
    setRecentExcelFormats(updatedFormats);
    return newFormat.id;
  } catch (error) {
    console.error('localStorage에 최근 사용 엑셀 양식을 저장하는 중 오류 발생:', error);
    return null;
  }
};

export default function OrderConvertPage() {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const isLoading = useUserStore((state) => state.isLoading);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const updatePoints = useUserStore((state) => state.updatePoints);
  /** 로그인 시 계정별 localStorage 분리 (/api/user/get 의 id 와 동일) */
  const storageUserId = user?.userId ?? null;
  const { data: session, status: authStatus } = useSession();
  /** 온보딩·양식 존재 판단용 — DB(/api/user/get) 대기 없이 NextAuth session.user.id 우선 */
  const templateStorageUserId =
    authStatus === 'authenticated' && session?.user?.id
      ? String(session.user.id)
      : storageUserId;
  const templateScopeUserIds = useMemo(
    () => [templateStorageUserId, storageUserId],
    [templateStorageUserId, storageUserId],
  );
  const authAssetsReady = useAuthAssetsReady();
  const [workspaceStorageHydrated, setWorkspaceStorageHydrated] = useState(false);
  const [isPreviewSessionRestoring, setIsPreviewSessionRestoring] = useState(true);
  const previewSessionEnabled =
    authAssetsReady &&
    workspaceStorageHydrated &&
    (authStatus === 'unauthenticated' || Boolean(storageUserId));
  const isAccountScopedReady = authAssetsReady && workspaceStorageHydrated;
  const isFormStatusChecking = !workspaceStorageHydrated;
  const courierStorageHydratedRef = useRef(false);
  const defaultCjSeedAppliedRef = useRef(false);
  const prevAccountBoundaryRef = useRef<string | undefined>(undefined);

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
  const [isManualTemplateBuilderOpen, setIsManualTemplateBuilderOpen] = useState(false);
  const [manualTemplateHeaders, setManualTemplateHeaders] = useState<string[]>([
    ...MANUAL_TEMPLATE_INITIAL_HEADERS,
  ]);
  const [manualTemplateActiveIndex, setManualTemplateActiveIndex] = useState(0);
  const [manualTemplateExampleQuery, setManualTemplateExampleQuery] = useState('');
  const [isEmptyDataModalOpen, setIsEmptyDataModalOpen] = useState(false);
  const [isSenderModalOpen, setIsSenderModalOpen] = useState(false);
  const [settingsCheckOverlayOpen, setSettingsCheckOverlayOpen] = useState(false);
  const pendingOrderUploadsRef = useRef<PendingOrderUpload[]>([]);
  const fileProcessingTokenRef = useRef(0);
  const [isNoTemplateModalOpen, setIsNoTemplateModalOpen] = useState(false);
  const [noTemplateModalType, setNoTemplateModalType] = useState<'fixed-input' | 'convert'>('fixed-input');
  const [isTemplateOnboardingModalOpen, setIsTemplateOnboardingModalOpen] = useState(false);
  const [dontShowTemplateGuideForWeek, setDontShowTemplateGuideForWeek] = useState(false);
  const [dismissedTemplateGuideThisVisit, setDismissedTemplateGuideThisVisit] = useState(false);
  const [isTemplateChangeReuploadModalOpen, setIsTemplateChangeReuploadModalOpen] = useState(false);
  const templateModalBaselineFormatIdRef = useRef<string | null>(null);
  const hadOrderWorkBeforeTemplateModalRef = useRef(false);
  const [uploadedExcelFile, setUploadedExcelFile] = useState<File | null>(null);
  // 고정 입력 정보 설정 모달: 입력 모드 상태 (버튼 인덱스)
  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number | null>(null);
  // 고정 입력 정보 설정 모달: 각 버튼의 입력값 (인덱스 -> 입력값)
  const [headerInputValues, setHeaderInputValues] = useState<Record<number, string>>({});
  // 고정 헤더 값: 택배사 업로드 파일의 헤더명(key)에 고정값(value) 바인딩
  // ※ 데이터 적용 원칙: 주문 데이터에 보내는 사람 정보가 있으면 → 그 값 우선, 고정 입력 값은 fallback 용도, 주문 원본 데이터는 절대 수정하지 않음
  const [fixedHeaderValues, setFixedHeaderValues] = useState<Record<string, string>>({});
  const [currentFilePreviewData, setCurrentFilePreviewData] = useState<any[]>([]);
  const [orderStandardFile, setOrderStandardFile] = useState<any | null>(null);
  /** 미리보기 rowId → Stage2 표준 행 (고정입력 변경 시 Fill Only 재적용) */
  const [orderStandardRowsByRowId, setOrderStandardRowsByRowId] = useState<
    Record<string, Record<string, string>>
  >({});
  const fixedInputAtModalOpenRef = useRef<Record<string, string>>({});
  const [templateBridgeFile, setTemplateBridgeFile] = useState<TemplateBridgeFile | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRowWithId[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPreviewResetModalOpen, setIsPreviewResetModalOpen] = useState(false);
  const [isBundleShippingModalOpen, setIsBundleShippingModalOpen] = useState(false);
  const [dismissedBundleGroupKeys, setDismissedBundleGroupKeys] = useState<string[]>([]);
  const [bundleShippingButtonAcked, setBundleShippingButtonAcked] = useState(false);
  type BundleShippingUndoSnapshot = {
    previewRows: PreviewRowWithId[];
    userOverrides: Record<string, Record<string, string>>;
    dismissedBundleGroupKeys: string[];
  };
  const [bundleApplyUndo, setBundleApplyUndo] = useState<{
    snapshot: BundleShippingUndoSnapshot;
    summary: BundleShippingApplySummary;
  } | null>(null);
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
  const [isDragging, setIsDragging] = useState(false);
  
  // 텍스트 주문 변환용 상태
  const [textInput, setTextInput] = useState('');
  const [isProcessingTextImage, setIsProcessingTextImage] = useState(false);
  const [errorMessageTextImage, setErrorMessageTextImage] = useState<string | null>(null);
  const [qualityNoticeModal, setQualityNoticeModal] = useState<
    'hidden' | NormalizeQualityNoticeVariant
  >('hidden');
  const [textConvertReviewModal, setTextConvertReviewModal] = useState<{
    originalText: string;
    rows: TextConvertReviewRow[];
  } | null>(null);
  const [textConvertPointsPending, setTextConvertPointsPending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showTextConvertModal, setShowTextConvertModal] = useState(false);
  const [dontShowToday, setDontShowToday] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [requiresAccountModalOpen, setRequiresAccountModalOpen] = useState(false);
  const [screenshotStage, setScreenshotStage] = useState<
    'idle' | 'processing' | 'completed'
  >('idle');

  const [screenshotImagePreview, setScreenshotImagePreview] = useState<string | null>(null);
  const [showTextProcessingModal, setShowTextProcessingModal] = useState(false);
  const [textProcessingSource, setTextProcessingSource] = useState<'screenshot' | 'imageFile'>('screenshot');
  const [downloadModalFileName, setDownloadModalFileName] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "processing" | "done">("idle");
  const [unknownHeadersWarning, setUnknownHeadersWarning] = useState<string[]>([]);
  const [unknownHeaderSamples, setUnknownHeaderSamples] = useState<UnknownHeaderSamples>({});
  const [unknownHeadersExpanded, setUnknownHeadersExpanded] = useState(false);
  const [directMappingModalOpen, setDirectMappingModalOpen] = useState(false);
  const [directMappingSourceHeaders, setDirectMappingSourceHeaders] = useState<string[]>([]);
  const [directMappingSourceSamples, setDirectMappingSourceSamples] = useState<UnknownHeaderSamples>({});
  const [directMappingRenameValues, setDirectMappingRenameValues] = useState<string[]>([]);
  const [directMappingOutputOrder, setDirectMappingOutputOrder] = useState<number[]>([]);
  const [directMappingDraggingSourceIndex, setDirectMappingDraggingSourceIndex] = useState<number | null>(null);
  const [directMappingDragOverOrderIndex, setDirectMappingDragOverOrderIndex] = useState<number | null>(null);
  const [fileProcessingStatus, setFileProcessingStatus] = useState<"idle" | "processing" | "done">("idle");
  /** 대용량 Stage2 청크 호출 시에만 표시 */
  const [stage2ChunkLabel, setStage2ChunkLabel] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [processingDots, setProcessingDots] = useState("");
  const [textProcessingDots, setTextProcessingDots] = useState("");
  const [textConvertStatusLabel, setTextConvertStatusLabel] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // 입력 방식 추적: 사용자가 어떤 방식으로 입력했는지 기록
  const [inputSourceType, setInputSourceType] = useState<'excel' | 'image' | 'text' | null>(null);
  const [sessionInputCounts, setSessionInputCounts] = useState<InputSourceCounts>(
    emptyInputSourceCounts
  );

  const recordWorkspaceInput = useCallback((kind: 'excel' | 'text' | 'image') => {
    setSessionInputCounts((prev) => incrementInputSource(prev, kind));
    setInputSourceType(kind);
  }, []);

  const clearWorkspaceInputTracking = useCallback(() => {
    setSessionInputCounts(emptyInputSourceCounts());
    setInputSourceType(null);
  }, []);

  // 사용자 정보 가져오기 (컴포넌트 마운트 시)
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const courierFileInputRef = useRef<HTMLInputElement | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  /** 텍스트 변환 중복 클릭·사용량 차감 이중 호출 방지 (await 전에 state가 안 올라가는 레이스 대비) */
  const textConvertInFlightRef = useRef(false);
  /** 이미지 OCR 직후 같은 텍스트로 변환 시 텍스트 입력 중복 집계 방지 (수동 편집 시 해제) */
  const pendingImageOcrTextConvertRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const screenshotPasteAreaRef = useRef<HTMLDivElement | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const previewRowsRef = useRef<PreviewRowWithId[]>([]);

  const needsAccount = !user && !isLoading;

  const clearUploadedExcelForUnlock = useCallback(() => {
    setUploadedExcelFile(null);
    setFileProcessingStatus('idle');
    setStage2ChunkLabel(null);
  }, []);
  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock({
    onUploadCancel: clearUploadedExcelForUnlock,
  });

  const settingsCheckOverlayMessage = useMemo(() => {
    if (authStatus === 'loading' || (isLoading && !user)) {
      return '회원 정보를 확인하는 중입니다.';
    }
    return '설정 정보를 확인하는 중입니다.';
  }, [authStatus, isLoading, user]);

  const ensureLoggedInForOrderInput = useCallback((): boolean => {
    if (isAccountScopedReady && user) return true;
    if (authStatus === 'loading' || isLoading || (authStatus === 'authenticated' && !isAccountScopedReady)) {
      setSettingsCheckOverlayOpen(true);
      return false;
    }
    setRequiresAccountModalOpen(true);
    return false;
  }, [user, isLoading, authStatus, isAccountScopedReady]);

  /** 회원·설정 복원 전 파일 업로드는 대기열에 넣고 오버레이 표시 */
  const queueOrderInputUntilReady = useCallback(
    (item: PendingOrderUpload): boolean => {
      if (user && authAssetsReady && workspaceStorageHydrated) {
        return true;
      }
      if (!user && authStatus !== 'loading' && !isLoading) {
        setRequiresAccountModalOpen(true);
        return false;
      }
      pendingOrderUploadsRef.current.push(item);
      setSettingsCheckOverlayOpen(true);
      return false;
    },
    [user, authAssetsReady, workspaceStorageHydrated, authStatus, isLoading],
  );

  useEffect(() => {
    if (!authAssetsReady || !workspaceStorageHydrated) return;

    if (!user) {
      if (authStatus === 'unauthenticated') {
        pendingOrderUploadsRef.current = [];
        setSettingsCheckOverlayOpen(false);
      }
      return;
    }

    const queue = pendingOrderUploadsRef.current.splice(0);
    if (queue.length === 0) {
      setSettingsCheckOverlayOpen(false);
      return;
    }

    setSettingsCheckOverlayOpen(false);

    void (async () => {
      const seenExcelKeys = new Set(
        uploadedFileMeta.map((file) => `${file.name}:${file.size}`),
      );

      for (const item of queue) {
        if (item.kind === 'excel') {
          if (!isValidCourierTemplate(courierUploadTemplate)) {
            setNoTemplateModalType('convert');
            setIsNoTemplateModalOpen(true);
            continue;
          }

          const key = `${item.file.name}:${item.file.size}`;
          if (!seenExcelKeys.has(key)) {
            seenExcelKeys.add(key);
            setUploadedExcelFile(item.file);
            await parseExcelFile(item.file);
          }
        } else {
          await handleImageFileSelect(item.file);
        }
      }
    })();
  }, [authAssetsReady, workspaceStorageHydrated, user, authStatus, courierUploadTemplate]);

  useEffect(() => {
    if (isAccountScopedReady) {
      setSettingsCheckOverlayOpen(false);
    }
  }, [isAccountScopedReady]);

  /** 양식 복원 대기 중: 등록 모달 대신 오버레이만. 완료 후 없으면 등록 모달 */
  const ensureCourierTemplateReady = useCallback(
    (modalType: 'fixed-input' | 'convert'): boolean => {
      if (!isAccountScopedReady) {
        setSettingsCheckOverlayOpen(true);
        return false;
      }
      setSettingsCheckOverlayOpen(false);
      if (!isValidCourierTemplate(courierUploadTemplate)) {
        setNoTemplateModalType(modalType);
        setIsNoTemplateModalOpen(true);
        return false;
      }
      return true;
    },
    [isAccountScopedReady, courierUploadTemplate],
  );

  // 고정 헤더 순서 배열 (courierUploadTemplate.headers 기준)
  const FIXED_HEADER_ORDER = useMemo(() => {
    if (courierUploadTemplate && Array.isArray(courierUploadTemplate.headers) && courierUploadTemplate.headers.length > 0) {
      return courierUploadTemplate.headers.map(header => header.name);
    }
    return [];
  }, [courierUploadTemplate]);

  previewRowsRef.current = previewRows;

  // 정렬은 대용량일 때 Worker로 오프로드
  const sortedRows = useWorkerSortedRows(previewRows, sortConfig, userOverrides);
  const selectedRowSet = useMemo(() => new Set(selectedRows), [selectedRows]);

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

  useEffect(() => {
    const totalRows = previewRows.length;
    if (totalRows === 0 || courierHeaders.length === 0) {
      setRenderedRowCount(0);
      return;
    }

    if (isPreviewExpanded) {
      setRenderedRowCount(totalRows);
      return;
    }

    // renderedRowCount를 의존성에 넣지 않는다 — 넣으면 '추가 조회'로 늘린 직후
    // 같은 effect가 다시 돌며 Math.min(BATCH, total)으로 100으로 되돌아가는 버그가 생긴다.
    setRenderedRowCount((prev) => {
      if (prev >= totalRows) return totalRows;
      // 누적 업로드 시 100건 이하 구간은 자동으로 표시 건수를 확장한다.
      // (예: 5건 이후 10건 추가 -> 15건 표시, 5건 이후 100건 추가 -> 100건 표시)
      if (prev >= PREVIEW_BATCH_SIZE) return Math.min(prev, totalRows);
      return Math.min(PREVIEW_BATCH_SIZE, totalRows);
    });
  }, [previewRows.length, courierHeaders.length, isPreviewExpanded]);

  const hasMorePreviewRows = sortedRows.length > renderedRowCount;

  const bundleShippingDetection = useMemo(
    () => detectBundleShippingGroups(previewRows, courierHeaders, templateBridgeFile, userOverrides),
    [previewRows, courierHeaders, templateBridgeFile, userOverrides],
  );

  const activeBundleShippingGroups = useMemo(
    () =>
      bundleShippingDetection.groups.filter((g) => !dismissedBundleGroupKeys.includes(g.key)),
    [bundleShippingDetection.groups, dismissedBundleGroupKeys],
  );

  const bundleShippingGroupCount = activeBundleShippingGroups.length;
  const bundleShippingRowCount = countBundleShippingDuplicateRows(activeBundleShippingGroups);

  const activeBundleGroupKeysSig = useMemo(
    () => activeBundleShippingGroups.map((g) => g.key).sort().join('\u0001'),
    [activeBundleShippingGroups],
  );

  useEffect(() => {
    if (bundleShippingGroupCount > 0) {
      setBundleShippingButtonAcked(false);
    }
  }, [activeBundleGroupKeysSig, bundleShippingGroupCount]);

  const clonePreviewRows = (rows: PreviewRowWithId[]) =>
    rows.map((r) => ({ rowId: r.rowId, data: { ...r.data } }));

  const handleBundleShippingApply = useCallback(
    (payload: BundleShippingApplyPayload) => {
      setBundleApplyUndo({
        snapshot: {
          previewRows: clonePreviewRows(previewRows),
          userOverrides: structuredClone(userOverrides),
          dismissedBundleGroupKeys: [...dismissedBundleGroupKeys],
        },
        summary: payload.summary,
      });

      const deletedSet = new Set(payload.deletedRowIds);
      setPreviewRows((prev) => prev.filter((row) => !deletedSet.has(row.rowId)));
      setOrderStandardRowsByRowId((prev) =>
        pruneOrderSnapshotsForRowIds(prev, deletedSet),
      );
      setUserOverrides((prev) => {
        const next = { ...prev };
        for (const id of payload.deletedRowIds) {
          delete next[id];
        }
        for (const [rowId, cols] of Object.entries(payload.overrides)) {
          if (deletedSet.has(rowId)) continue;
          next[rowId] = { ...(next[rowId] ?? {}), ...cols };
        }
        return next;
      });
      setSelectedRows((prev) => prev.filter((id) => !deletedSet.has(id)));
      if (payload.ignoredGroupKeys.length > 0) {
        setDismissedBundleGroupKeys((prev) => {
          const merged = new Set([...prev, ...payload.ignoredGroupKeys]);
          return [...merged];
        });
      }
      setBundleShippingButtonAcked(true);
    },
    [previewRows, userOverrides, dismissedBundleGroupKeys],
  );

  const handleUndoBundleShippingApply = useCallback(() => {
    if (!bundleApplyUndo) return;
    const { snapshot } = bundleApplyUndo;
    setPreviewRows(snapshot.previewRows);
    setUserOverrides(snapshot.userOverrides);
    setDismissedBundleGroupKeys(snapshot.dismissedBundleGroupKeys);
    setSelectedRows([]);
    setBundleApplyUndo(null);
    setBundleShippingButtonAcked(false);
  }, [bundleApplyUndo]);

  const resetBundleShippingUi = useCallback(() => {
    setIsBundleShippingModalOpen(false);
    setDismissedBundleGroupKeys([]);
    setBundleShippingButtonAcked(false);
    setBundleApplyUndo(null);
  }, []);

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
  }, [isPreviewExpanded, displayRows.length, courierHeaders.length]);

  const commitCellEdit = useCallback((rowId: string, header: string, value: string) => {
    setUserOverrides((prev) => {
      const row = previewRowsRef.current.find((r) => r.rowId === rowId);
      const base = String(row?.data[header] ?? '');
      const currentOverride = prev[rowId]?.[header];
      const effective = currentOverride !== undefined ? String(currentOverride) : base;
      if (value === effective) return prev;

      return {
        ...prev,
        [rowId]: {
          ...(prev[rowId] ?? {}),
          [header]: value,
        },
      };
    });
  }, []);

  const handlePreviewRowToggleSelect = useCallback((rowId: string, checked: boolean) => {
    setSelectedRows((prev) =>
      checked ? (prev.includes(rowId) ? prev : [...prev, rowId]) : prev.filter((id) => id !== rowId),
    );
  }, []);

  const handlePreviewCellClickStartEdit = useCallback((rowId: string, header: string, displayValue: string) => {
    setEditingValue(displayValue);
    setActiveCell({ rowId, header });
    setEditingCell({ rowId, header });
  }, []);

  const handlePreviewEditingInputChange = useCallback((v: string) => {
    setEditingValue(v);
  }, []);

  const handlePreviewFinishEditUi = useCallback(() => {
    setEditingCell(null);
    setActiveCell(null);
  }, []);

  // NextAuth + /api/user/get 확정 후에만 LS 복원. 실제 계정 경계(A↔B)일 때만 파이프라인(주문·미리보기) 초기화.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!authAssetsReady) {
      setWorkspaceStorageHydrated(false);
      courierStorageHydratedRef.current = false;
      return;
    }

    const boundaryKey = storageUserId ?? '__guest__';
    const guestToUserLogin =
      prevAccountBoundaryRef.current === '__guest__' && boundaryKey !== '__guest__';
    if (
      prevAccountBoundaryRef.current !== undefined &&
      prevAccountBoundaryRef.current !== boundaryKey
    ) {
      const prevScopeUserId =
        prevAccountBoundaryRef.current === '__guest__'
          ? null
          : prevAccountBoundaryRef.current;
      if (guestToUserLogin && storageUserId) {
        migratePreviewWorkspaceGuestToUser('order-convert', storageUserId);
        clearPreviewWorkspace('order-convert', null);
      } else {
        clearAllPreviewWorkspacesForScope(prevScopeUserId);
        void clearWorkspaceFiles('order-convert', prevScopeUserId);
      }
      pendingOrderUploadsRef.current = [];

      if (!guestToUserLogin) {
      isCancelledRef.current = true;
      setPreviewRows([]);
      setOrderStandardRowsByRowId({});
      setCourierHeaders([]);
      setOrderStandardFile(null);
      setTemplateBridgeFile(null);
      setUploadedExcelFile(null);
      setSelectedFiles([]);
      setUploadedFileMeta([]);
      setUserOverrides({});
      setSelectedRows([]);
      resetBundleShippingUi();
      setNewRows(new Set());
      setEditingCell(null);
      setActiveCell(null);
      setEditingValue('');
      setSortConfig(null);
      setUnknownHeadersWarning([]);
      setUnknownHeaderSamples({});
      setDirectMappingModalOpen(false);
      setDirectMappingSourceHeaders([]);
      setDirectMappingSourceSamples({});
      setDirectMappingRenameValues([]);
      setDirectMappingOutputOrder([]);
      setDirectMappingDraggingSourceIndex(null);
      setDirectMappingDragOverOrderIndex(null);
      setFileProcessingStatus('idle');
      setStage2ChunkLabel(null);
      setSelectedFileName(null);
      setDownloadStatus('idle');
      setDownloadModalFileName(null);
      clearWorkspaceInputTracking();
      setTemplateFileSessionId(null);
      setOrderFileSessionId(null);
      setCurrentFilePreviewData([]);
      setIsPreviewExpanded(false);
      setRenderedRowCount(0);
      setPreviewScrollTop(0);
      setTextInput('');
      setSelectedImage(null);
      setImagePreview(null);
      setScreenshotImagePreview(null);
      setErrorMessageTextImage(null);
      setIsProcessingTextImage(false);
      setScreenshotStage('idle');
      setShowTextProcessingModal(false);
      setShowScreenshotModal(false);
      setQualityNoticeModal('hidden');
      setIsDragging(false);
      }
    }
    prevAccountBoundaryRef.current = boundaryKey;

    courierStorageHydratedRef.current = false;
    try {
      let loadedTemplate = loadCourierUploadTemplate(storageUserId);
      if (
        loadedTemplate &&
        isActiveDefaultCjTemplate(loadedTemplate) &&
        isDefaultCjAutoSeedOptOutForUserIds(templateScopeUserIds, ORDER_DEFAULT_CJ_OPT_OUT_KEY)
      ) {
        for (const uid of templateScopeUserIds) {
          saveCourierUploadTemplate(null, uid);
          removeLocalStorageForUser(ORDER_CONVERT_KEYS.bridge, uid);
        }
        loadedTemplate = null;
      }
      setCourierUploadTemplate(loadedTemplate);
      setRecentExcelFormats(loadRecentExcelFormats(storageUserId));
      try {
        const rawFixed = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.fixedHeaders, storageUserId);
        setFixedHeaderValues(rawFixed ? JSON.parse(rawFixed) : {});
      } catch {
        setFixedHeaderValues({});
      }

      const saved = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.bridge, storageUserId);
      if (saved) {
        const parsed = JSON.parse(saved) as TemplateBridgeFile;
        const pcccIndex =
          parsed?.courierHeaders?.findIndex((h) => /개인통관번호|PCCC/i.test(String(h ?? ''))) ??
          -1;
        const pcccMapped =
          pcccIndex >= 0 ? parsed?.mappedBaseHeaders?.[pcccIndex] : null;
        const needsPcccMigration = pcccIndex >= 0 && pcccMapped !== '개인통관번호';

        if (needsPcccMigration) {
          removeLocalStorageForUser(ORDER_CONVERT_KEYS.bridge, storageUserId);
          setTemplateBridgeFile(null);
        } else {
          setTemplateBridgeFile(parsed);
        }
      } else {
        setTemplateBridgeFile(null);
      }
    } catch (error) {
      console.error('[order-convert] 택배 저장소 복원 오류:', error);
    }
    isCancelledRef.current = false;
    courierStorageHydratedRef.current = true;
    setWorkspaceStorageHydrated(true);
  }, [authAssetsReady, storageUserId, templateScopeUserIds]);

  const activeTemplateHeaderNames = useMemo(() => {
    if (!isValidCourierTemplate(courierUploadTemplate) || !courierUploadTemplate) {
      return null;
    }
    return courierUploadTemplate.headers
      .filter((header) => !header.isEmpty && header.name.trim() !== '')
      .map((header) => header.name);
  }, [courierUploadTemplate]);

  const isUsingDefaultCjTemplate = useMemo(
    () => isActiveDefaultCjTemplate(courierUploadTemplate),
    [courierUploadTemplate],
  );

  const filteredManualTemplateHeaderExamples = useMemo(() => {
    const query = manualTemplateExampleQuery.replace(/\s/g, '').trim().toLowerCase();
    if (!query) return MANUAL_TEMPLATE_HEADER_EXAMPLES;
    return MANUAL_TEMPLATE_HEADER_EXAMPLES.filter((example) =>
      example.replace(/\s/g, '').toLowerCase().includes(query),
    );
  }, [manualTemplateExampleQuery]);

  const manualTemplateEnteredHeaders = useMemo(
    () =>
      manualTemplateHeaders
        .map((header, index) => ({
          index,
          name: header.trim(),
        }))
        .filter((header) => header.name !== ''),
    [manualTemplateHeaders],
  );

  useEffect(() => {
    defaultCjSeedAppliedRef.current = false;
  }, [storageUserId]);

  /** 양식 미등록 시 CJ 12열 기본 양식 자동 등록 */
  useEffect(() => {
    if (!authAssetsReady || !workspaceStorageHydrated) return;

    const storedTemplate = loadCourierUploadTemplate(storageUserId);
    const scopeOptOut = isDefaultCjAutoSeedOptOutForUserIds(
      templateScopeUserIds,
      ORDER_DEFAULT_CJ_OPT_OUT_KEY,
    );

    if (isValidCourierTemplate(storedTemplate)) {
      if (isActiveDefaultCjTemplate(storedTemplate) && scopeOptOut) {
        for (const uid of templateScopeUserIds) {
          saveCourierUploadTemplate(null, uid);
          removeLocalStorageForUser(ORDER_CONVERT_KEYS.bridge, uid);
        }
        setCourierUploadTemplate(null);
        setTemplateBridgeFile(null);
        return;
      }

      if (isActiveDefaultCjTemplate(storedTemplate) && !scopeOptOut) {
        const formats = loadRecentExcelFormats(storageUserId);
        const hasDefaultEntry = formats.some((format) => isDefaultCjSeedFormatId(format.id));
        if (!hasDefaultEntry) {
          const seed = buildDefaultCjCourierSeed();
          const updatedFormats = [
            seed.recentFormat,
            ...formats.filter((format) => format.id !== DEFAULT_CJ_FORMAT_ID),
          ];
          writeLocalStorageForUser(
            ORDER_CONVERT_KEYS.recentFormats,
            storageUserId,
            JSON.stringify(updatedFormats),
          );
          setRecentExcelFormats(updatedFormats);
        }
      }
      return;
    }

    if (scopeOptOut) {
      return;
    }

    if (defaultCjSeedAppliedRef.current) return;
    defaultCjSeedAppliedRef.current = true;

    const seed = buildDefaultCjCourierSeed();
    writeLocalStorageForUser(
      ORDER_CONVERT_KEYS.template,
      storageUserId,
      JSON.stringify(seed.template),
    );
    writeLocalStorageForUser(
      ORDER_CONVERT_KEYS.bridge,
      storageUserId,
      JSON.stringify(seed.bridgeFile),
    );

    const updatedFormats = [
      seed.recentFormat,
      ...loadRecentExcelFormats(storageUserId).filter(
        (format) => format.id !== DEFAULT_CJ_FORMAT_ID,
      ),
    ];
    writeLocalStorageForUser(
      ORDER_CONVERT_KEYS.recentFormats,
      storageUserId,
      JSON.stringify(updatedFormats),
    );

    setCourierUploadTemplate(seed.template);
    setTemplateBridgeFile(seed.bridgeFile);
    setRecentExcelFormats(updatedFormats);
    setTempSelectedFormatId(DEFAULT_CJ_FORMAT_ID);
  }, [authAssetsReady, workspaceStorageHydrated, storageUserId, templateScopeUserIds]);

  const handlePreviewSessionRestored = useCallback(() => {
    setFileProcessingStatus('done');
  }, []);

  const handleTemplateBridgeChanged = useCallback(() => {
    setPreviewRows([]);
    setOrderStandardRowsByRowId({});
    setCourierHeaders([]);
  }, []);

  const getFallbackCourierHeaders = useCallback((): string[] => {
    if (templateBridgeFile?.courierHeaders?.length) {
      return templateBridgeFile.courierHeaders;
    }
    if (typeof window === 'undefined') return [];
    try {
      const saved = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.bridge, storageUserId);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as TemplateBridgeFile;
      return Array.isArray(parsed.courierHeaders) ? parsed.courierHeaders : [];
    } catch {
      return [];
    }
  }, [templateBridgeFile, storageUserId]);

  const getActiveTemplateBridgeFile = useCallback((): TemplateBridgeFile | null => {
    if (templateBridgeFile?.courierHeaders?.length) {
      return templateBridgeFile;
    }
    if (typeof window === 'undefined') return null;
    try {
      const saved = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.bridge, storageUserId);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as TemplateBridgeFile;
      return Array.isArray(parsed.courierHeaders) && parsed.courierHeaders.length > 0
        ? parsed
        : null;
    } catch {
      return null;
    }
  }, [templateBridgeFile, storageUserId]);

  useEffect(() => {
    if (previewSessionEnabled || !authAssetsReady || !workspaceStorageHydrated) return;
    if (authStatus === 'loading') return;
    setIsPreviewSessionRestoring(false);
  }, [previewSessionEnabled, authAssetsReady, workspaceStorageHydrated, authStatus]);

  useEffect(() => {
    if (!previewSessionEnabled) return;
    if (previewRows.length > 0 && courierHeaders.length === 0) {
      const headers = getFallbackCourierHeaders();
      if (headers.length > 0) {
        setCourierHeaders(headers);
      }
    }
  }, [
    previewSessionEnabled,
    previewRows.length,
    courierHeaders.length,
    getFallbackCourierHeaders,
    templateBridgeFile,
  ]);

  usePreviewWorkspaceSession({
    pageKey: 'order-convert',
    enabled: previewSessionEnabled,
    storageUserId,
    previewRows,
    userOverrides,
    courierHeaders,
    sortConfig,
    setPreviewRows,
    setUserOverrides,
    setCourierHeaders,
    setSortConfig,
    getFallbackCourierHeaders,
    fallbackCourierHeaders: templateBridgeFile?.courierHeaders ?? [],
    selectedFileName,
    uploadedFileMeta: uploadedFileMeta.map((m) => ({
      name: m.name,
      size: m.size,
      lastModified: 0,
      type: '',
    })),
    textInput,
    inputSourceType,
    sessionInputCounts,
    setSelectedFileName,
    setUploadedFileMeta: (meta) =>
      setUploadedFileMeta(meta.map(({ name, size }) => ({ name, size }))),
    setTextInput,
    setInputSourceType,
    setSessionInputCounts,
    onSessionRestored: (snap) => {
      if (snap.previewRows.length > 0) handlePreviewSessionRestored();
    },
    onRestoreSettled: (hadPreview) => {
      setIsPreviewSessionRestoring(false);
      if (!hadPreview) {
        setFileProcessingStatus('idle');
      }
    },
  });

  useClearPreviewOnBridgeChange(templateBridgeFile, handleTemplateBridgeChanged);

  // SPA 이동 후에도 주문 엑셀·이미지 파일 복구 (IndexedDB)
  useEffect(() => {
    if (!previewSessionEnabled || typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      const slots: { slot: string; file: File }[] = [];
      if (uploadedExcelFile) slots.push({ slot: 'orderExcel', file: uploadedExcelFile });
      if (selectedImage) slots.push({ slot: 'selectedImage', file: selectedImage });
      void putWorkspaceFiles('order-convert', storageUserId, slots);
    }, 600);
    return () => window.clearTimeout(t);
  }, [previewSessionEnabled, storageUserId, uploadedExcelFile, selectedImage]);

  useEffect(() => {
    if (!previewSessionEnabled || isPreviewSessionRestoring) return;
    if (typeof window === 'undefined') return;
    if (uploadedExcelFile) return;
    if (uploadedFileMeta.length === 0) return;

    let cancelled = false;
    void (async () => {
      const files = await loadWorkspaceFiles('order-convert', storageUserId);
      if (cancelled) return;
      const order = files.orderExcel;
      const m0 = uploadedFileMeta[0];
      if (order && m0 && order.name === m0.name && order.size === m0.size) {
        setUploadedExcelFile(order);
        if (previewRows.length > 0) {
          setFileProcessingStatus('done');
        }
      }
      const img = files.selectedImage;
      if (img && inputSourceType === 'image') {
        setSelectedImage(img);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    previewSessionEnabled,
    isPreviewSessionRestoring,
    storageUserId,
    uploadedFileMeta,
    uploadedExcelFile,
    previewRows.length,
    inputSourceType,
  ]);

  const orderTemplateCourierHeaderKey =
    templateBridgeFile?.courierHeaders?.join('\x1e') ?? '';
  useEffect(() => {
    if (!templateBridgeFile?.courierHeaders?.length) return;
    setFixedHeaderValues((prev) => {
      const pruned = pruneFixedInputToCourierKeys(prev, templateBridgeFile);
      if (Object.keys(pruned).length === Object.keys(prev).length) {
        const same = Object.keys(pruned).every((k) => pruned[k] === prev[k]);
        if (same && Object.keys(prev).every((k) => k in pruned)) return prev;
      }
      return pruned;
    });
  }, [orderTemplateCourierHeaderKey, templateBridgeFile]);

  // fixedHeaderValues를 localStorage에 저장 (복원 후에만 저장해 계정 전환 시 오쓰기 방지)
  useEffect(() => {
    if (typeof window === 'undefined' || !courierStorageHydratedRef.current || !authAssetsReady) return;
    const toStore = templateBridgeFile
      ? pruneFixedInputToCourierKeys(fixedHeaderValues, templateBridgeFile)
      : fixedHeaderValues;
    try {
      writeLocalStorageForUser(
        ORDER_CONVERT_KEYS.fixedHeaders,
        storageUserId,
        JSON.stringify(toStore),
      );
    } catch (error) {
      console.error('localStorage에 고정 헤더 값을 저장하는 중 오류 발생:', error);
    }
  }, [fixedHeaderValues, storageUserId, authAssetsReady, templateBridgeFile]);

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

  const clearOrderInputForTemplateChange = useCallback(() => {
    setUploadedExcelFile(null);
    setOrderStandardFile(null);
    setUploadedFileMeta([]);
    setSelectedFiles([]);
    setSelectedFileName(null);
    setFileProcessingStatus('idle');
    setStage2ChunkLabel(null);
    setUnknownHeadersWarning([]);
    setUnknownHeaderSamples({});
    setDirectMappingModalOpen(false);
    setDirectMappingSourceHeaders([]);
    setDirectMappingSourceSamples({});
    setDirectMappingRenameValues([]);
    setDirectMappingOutputOrder([]);
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
    setTextInput('');
    clearWorkspaceInputTracking();
  }, [clearWorkspaceInputTracking]);

  const handleOpenCourierTemplateModal = () => {
    const formats = loadRecentExcelFormats(storageUserId);
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

    templateModalBaselineFormatIdRef.current = matchedFormatId;
    hadOrderWorkBeforeTemplateModalRef.current =
      Boolean(uploadedExcelFile) ||
      previewRows.length > 0 ||
      Boolean(orderStandardFile) ||
      textInput.trim().length > 0 ||
      uploadedFileMeta.length > 0;

    setTempSelectedFormatId(matchedFormatId);
    setIsCourierTemplateModalOpen(true);
  };

  const handleCloseCourierTemplateModal = () => {
    setIsCourierTemplateModalOpen(false);
  };

  const handleConfirmCourierTemplateModal = () => {
    const formatChanged = tempSelectedFormatId !== templateModalBaselineFormatIdRef.current;
    const shouldNotifyReupload = formatChanged && hadOrderWorkBeforeTemplateModalRef.current;

    setIsCourierTemplateModalOpen(false);

    if (shouldNotifyReupload) {
      clearOrderInputForTemplateChange();
      setIsTemplateChangeReuploadModalOpen(true);
    }
  };

  const handleTemplateFileClick = () => {
    if (courierFileInputRef.current) {
      courierFileInputRef.current.click();
    }
  };

  const handleManualTemplateHeaderChange = (index: number, value: string) => {
    setManualTemplateHeaders((prev) => prev.map((header, headerIndex) => (
      headerIndex === index ? value : header
    )));
  };

  const handleAddManualTemplateHeader = () => {
    setManualTemplateHeaders((prev) => {
      setManualTemplateActiveIndex(prev.length);
      return [...prev, ''];
    });
  };

  const handleRemoveManualTemplateHeader = (index: number) => {
    setManualTemplateHeaders((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, headerIndex) => headerIndex !== index);
      setManualTemplateActiveIndex((current) => Math.min(current, next.length - 1));
      return next;
    });
  };

  const handleInsertManualTemplateExample = (example: string) => {
    setManualTemplateHeaders((prev) => {
      const targetIndex = Math.min(manualTemplateActiveIndex, Math.max(prev.length - 1, 0));
      return prev.map((header, headerIndex) => (
        headerIndex === targetIndex ? example : header
      ));
    });
  };

  const handleCreateManualTemplate = () => {
    const headers = manualTemplateHeaders.map((header) => header.trim()).filter(Boolean);
    if (headers.length === 0) {
      alert('헤더명을 1개 이상 입력해 주세요.');
      return;
    }

    const seenHeaders = new Set<string>();
    const duplicateHeader = headers.find((header) => {
      const normalized = header.replace(/\s/g, '').toLowerCase();
      if (seenHeaders.has(normalized)) return true;
      seenHeaders.add(normalized);
      return false;
    });

    if (duplicateHeader) {
      alert(`중복된 헤더명이 있습니다: ${duplicateHeader}`);
      return;
    }

    const manualTemplateSessionId = `manual-${crypto.randomUUID()}`;
    const bridgeFile = buildTrialBridgeFile(headers);
    const builtTemplate = buildCourierTemplateFromHeaders(headers);
    const template: CourierUploadTemplate = {
      courierType: null,
      headers: builtTemplate.headers,
      requiresSender:
        builtTemplate.requiresSender ||
        builtTemplate.headers.some((header) => !header.isEmpty && isSenderColumn(header.name)),
    };

    setTemplateFileSessionId(manualTemplateSessionId);
    setCurrentFilePreviewData([]);
    setOrderStandardFile(null);
    setUploadedFileMeta([]);
    setTemplateBridgeFile(bridgeFile);

    if (typeof window !== 'undefined') {
      try {
        writeLocalStorageForUser(
          ORDER_CONVERT_KEYS.bridge,
          storageUserId,
          JSON.stringify(bridgeFile),
        );
      } catch (error) {
        console.error('localStorage에 bridgeFile을 저장하는 중 오류 발생:', error);
      }
    }

    const newFormatId = saveRecentExcelFormat(
      template,
      setRecentExcelFormats,
      storageUserId,
      bridgeFile,
      '직접 만든 업로드 양식',
    );

    setCourierUploadTemplate(template);
    saveCourierUploadTemplate(template, storageUserId);

    if (newFormatId) {
      setTempSelectedFormatId(newFormatId);
      setShowRecentTemplate(true);
    }

    logTemplateHeaderUpload(
      buildTemplateHeaderLogPayload(bridgeFile, {
        page: 'order-convert',
        fileSessionId: manualTemplateSessionId,
        templateId: newFormatId ?? undefined,
        templateName: '직접 만든 업로드 양식',
      }),
    );

    setIsManualTemplateBuilderOpen(false);
    setManualTemplateHeaders([...MANUAL_TEMPLATE_INITIAL_HEADERS]);
    setManualTemplateActiveIndex(0);
    setManualTemplateExampleQuery('');
    setRegistrationSuccessMessage('내 출력 양식 만들기가 완료되었습니다');
    setTimeout(() => {
      setRegistrationSuccessMessage(null);
    }, 3500);
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

      // Stage1 성공 시 bridgeFile을 localStorage에 저장 (계정별)
      if (typeof window !== 'undefined') {
        try {
          writeLocalStorageForUser(
            ORDER_CONVERT_KEYS.bridge,
            storageUserId,
            JSON.stringify(templateResult.bridgeFile),
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
      const newFormatId = saveRecentExcelFormat(
        template,
        setRecentExcelFormats,
        storageUserId,
        templateResult.bridgeFile,
      );
      setCourierUploadTemplate(template);
      saveCourierUploadTemplate(template, storageUserId);

      if (newFormatId) {
        setTempSelectedFormatId(newFormatId);
      }

      logTemplateHeaderUpload(
        buildTemplateHeaderLogPayload(templateResult.bridgeFile, {
          page: 'order-convert',
          fileSessionId: newTemplateSessionId,
          templateId: newFormatId ?? undefined,
          courierName: template.courierType ?? undefined,
        }),
      );

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
      const formats = loadRecentExcelFormats(storageUserId);
      const updatedFormats = formats.map((format) =>
        format.id === formatId ? { ...format, displayName: displayName.trim() || undefined } : format,
      );
      writeLocalStorageForUser(ORDER_CONVERT_KEYS.recentFormats, storageUserId, JSON.stringify(updatedFormats));
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

    if (formatId !== tempSelectedFormatId) {
      clearOrderInputForTemplateChange();
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
    saveCourierUploadTemplate(template, storageUserId);

    // 템플릿 변경 시 메타 초기화
    setUploadedFileMeta([]);

    // 3. 선택된 템플릿의 bridgeFile 적용
    if (selected.bridgeFile) {
      // setTemplateBridgeFile 실행 - 새 객체로 복사하여 전달 (React 객체 동일성 비교 문제 해결)
      setTemplateBridgeFile(JSON.parse(JSON.stringify(selected.bridgeFile)));
      
      // localStorage(bridge)도 함께 갱신
      if (typeof window !== 'undefined') {
        try {
          writeLocalStorageForUser(
            ORDER_CONVERT_KEYS.bridge,
            storageUserId,
            JSON.stringify(selected.bridgeFile),
          );
        } catch (error) {
          console.error('localStorage에 bridgeFile을 저장하는 중 오류 발생:', error);
        }
      }
    }
  };

  const handleOpenDirectMappingModal = () => {
    const activeBridge = getActiveTemplateBridgeFile();
    if (!activeBridge?.courierHeaders?.length) {
      alert('먼저 택배 업로드 양식 또는 내 출력 양식을 선택해 주세요.');
      return;
    }

    if (directMappingSourceHeaders.length === 0) {
      alert('주문파일 헤더를 확인할 수 없습니다. 주문파일을 다시 업로드해 주세요.');
      return;
    }

    setDirectMappingRenameValues([...directMappingSourceHeaders]);
    setDirectMappingOutputOrder([]);
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
    setDirectMappingModalOpen(true);
  };

  const handleDirectMappingRenameChange = (sourceIndex: number, value: string) => {
    setDirectMappingRenameValues((prev) =>
      prev.map((header, index) => (index === sourceIndex ? value : header)),
    );
  };

  const handleMoveDirectMappingOutputHeader = (sourceIndex: number, direction: -1 | 1) => {
    setDirectMappingOutputOrder((prev) => {
      const currentIndex = prev.indexOf(sourceIndex);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex]!, next[currentIndex]!];
      return next;
    });
  };

  const moveDirectMappingOutputHeaderTo = (sourceIndex: number, targetOrderIndex: number) => {
    setDirectMappingOutputOrder((prev) => {
      const currentIndex = prev.indexOf(sourceIndex);
      if (currentIndex < 0) {
        const insertIndex = Math.min(Math.max(targetOrderIndex, 0), prev.length);
        const next = [...prev];
        next.splice(insertIndex, 0, sourceIndex);
        return next;
      }
      if (
        targetOrderIndex < 0 ||
        targetOrderIndex >= prev.length ||
        currentIndex === targetOrderIndex
      ) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetOrderIndex, 0, moved!);
      return next;
    });
  };

  const handleDirectMappingDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    sourceIndex: number,
  ) => {
    setDirectMappingDraggingSourceIndex(sourceIndex);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(sourceIndex));
  };

  const handleDirectMappingDragOver = (
    event: React.DragEvent<HTMLTableCellElement>,
    orderIndex: number,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDirectMappingDragOverOrderIndex(orderIndex);
  };

  const handleDirectMappingDrop = (
    event: React.DragEvent<HTMLTableCellElement>,
    targetOrderIndex: number,
  ) => {
    event.preventDefault();
    const rawSourceIndex = event.dataTransfer.getData('text/plain');
    const sourceIndex = Number.isFinite(Number(rawSourceIndex))
      ? Number(rawSourceIndex)
      : directMappingDraggingSourceIndex;

    if (typeof sourceIndex === 'number') {
      moveDirectMappingOutputHeaderTo(sourceIndex, targetOrderIndex);
    }

    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
  };

  const handleDirectMappingDragEnd = () => {
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
  };

  const handleCreateDirectMappingFormat = () => {
    const activeBridge = getActiveTemplateBridgeFile();
    if (!activeBridge?.courierHeaders?.length) {
      alert('등록할 출력 양식을 찾을 수 없습니다.');
      return;
    }

    const finalColumns = directMappingOutputOrder
      .map((sourceIndex) => ({
        sourceHeader: directMappingSourceHeaders[sourceIndex] ?? '',
        outputHeader: directMappingRenameValues[sourceIndex]?.trim() ?? '',
      }));

    if (finalColumns.length === 0) {
      alert('최종 출력에 포함할 항목을 1개 이상 남겨 주세요.');
      return;
    }

    const emptyColumn = finalColumns.find((column) => !column.outputHeader);
    if (emptyColumn) {
      alert('2번 행의 변경할 헤더명을 모두 입력해 주세요.');
      return;
    }

    const seenHeaders = new Set<string>();
    const duplicateHeader = finalColumns.find((column) => {
      const normalized = column.outputHeader.replace(/\s/g, '').toLowerCase();
      if (seenHeaders.has(normalized)) return true;
      seenHeaders.add(normalized);
      return false;
    });

    if (duplicateHeader) {
      alert(`중복된 최종 출력 헤더가 있습니다: ${duplicateHeader.outputHeader}`);
      return;
    }

    const finalHeaders = finalColumns.map((column) => column.outputHeader);
    const directHeaderMappings = finalColumns.reduce<DirectHeaderMapping>((acc, column) => {
      acc[column.outputHeader] = column.sourceHeader || null;
      return acc;
    }, {});

    const directBridgeFile: TemplateBridgeFile = {
      ...activeBridge,
      courierHeaders: finalHeaders,
      mappedBaseHeaders: finalHeaders.map(() => null),
      unknownHeaders: [],
      directHeaderMappings,
      directSourceHeaders: [...directMappingSourceHeaders],
    };
    const template = buildCourierTemplateFromHeaders(finalHeaders);
    const formatName = '직접 연결 양식';
    const directFormatId = saveRecentExcelFormat(
      template,
      setRecentExcelFormats,
      storageUserId,
      directBridgeFile,
      formatName,
    );

    setTemplateBridgeFile(directBridgeFile);
    setCourierUploadTemplate(template);
    saveCourierUploadTemplate(template, storageUserId);
    if (directFormatId) {
      setTempSelectedFormatId(directFormatId);
      setShowRecentTemplate(true);
    }

    if (typeof window !== 'undefined') {
      try {
        writeLocalStorageForUser(
          ORDER_CONVERT_KEYS.bridge,
          storageUserId,
          JSON.stringify(directBridgeFile),
        );
      } catch (error) {
        console.error('localStorage에 직접 연결 bridgeFile을 저장하는 중 오류 발생:', error);
      }
    }

    clearPreviewWorkspace('order-convert', storageUserId);
    void clearWorkspaceFiles('order-convert', storageUserId);
    resetBundleShippingUi();
    setPreviewRows([]);
    setOrderStandardRowsByRowId({});
    setUserOverrides({});
    setSortConfig(null);
    setUnknownHeadersWarning([]);
    setUnknownHeaderSamples({});
    setDirectMappingModalOpen(false);
    setDirectMappingSourceHeaders([]);
    setDirectMappingSourceSamples({});
    setDirectMappingRenameValues([]);
    setDirectMappingOutputOrder([]);
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
    setSelectedFileName(null);
    setSelectedRows([]);
    setNewRows(new Set());
    setSelectedFiles([]);
    setUploadedExcelFile(null);
    setUploadedFileMeta([]);
    clearWorkspaceInputTracking();
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (excelFileInputRef.current) excelFileInputRef.current.value = '';

    setIsTemplateChangeReuploadModalOpen(true);
    setRegistrationSuccessMessage('직접 연결 양식이 등록되었습니다. 주문파일을 다시 첨부해 주세요.');
    setTimeout(() => {
      setRegistrationSuccessMessage(null);
    }, 5000);
  };

  const handleDeleteFormat = (formatId: string) => {
    const formats = loadRecentExcelFormats(storageUserId);
    const formatToDelete = formats.find((format) => format.id === formatId);
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    try {
      if (formatToDelete && isDefaultCjSeedFormat(formatToDelete)) {
        setDefaultCjAutoSeedOptOutForUserIds(templateScopeUserIds, ORDER_DEFAULT_CJ_OPT_OUT_KEY);
        for (const uid of templateScopeUserIds) {
          saveCourierUploadTemplate(null, uid);
          removeLocalStorageForUser(ORDER_CONVERT_KEYS.bridge, uid);
        }
        setCourierUploadTemplate(null);
        setTemplateBridgeFile(null);
      } else if (formatToDelete && courierUploadTemplate && Array.isArray(courierUploadTemplate.headers)) {
        const currentHeaders = courierUploadTemplate.headers
          .filter((header) => !header.isEmpty && header.name.trim() !== '')
          .map((header) => header.name);
        const formatHeaders = formatToDelete.columnOrder || [];
        
        // 헤더 배열이 일치하는지 확인
        if (currentHeaders.length === formatHeaders.length &&
            currentHeaders.every((header, index) => header === formatHeaders[index])) {
          // 현재 사용 중인 템플릿이면 초기화
          setCourierUploadTemplate(null);
          saveCourierUploadTemplate(null, storageUserId);
          // bridgeFile도 함께 삭제
          if (typeof window !== 'undefined') {
            try {
              removeLocalStorageForUser(ORDER_CONVERT_KEYS.bridge, storageUserId);
              setTemplateBridgeFile(null);
            } catch (error) {
              console.error('localStorage에서 bridgeFile을 삭제하는 중 오류 발생:', error);
            }
          }
        }
      }
      
      const updatedFormats = formats.filter((format) => format.id !== formatId);
      writeLocalStorageForUser(ORDER_CONVERT_KEYS.recentFormats, storageUserId, JSON.stringify(updatedFormats));
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
    if (!ensureCourierTemplateReady('fixed-input')) return;
    fixedInputAtModalOpenRef.current = { ...fixedHeaderValues };
    // 택배 업로드 양식이 있는 경우 고정 입력 헤더 설정 모달 열기
    setIsSenderModalOpen(true);
  };

  const applyFixedInputChangeToPreview = useCallback(() => {
    if (!templateBridgeFile || previewRows.length === 0) return;
    setPreviewRows(
      reapplyFixedInputToPreviewRows({
        previewRows,
        orderSnapshotsByRowId: orderStandardRowsByRowId,
        template: templateBridgeFile,
        fixedInput: fixedHeaderValues,
        previousFixedInput: fixedInputAtModalOpenRef.current,
        userOverrides,
      }),
    );
  }, [
    templateBridgeFile,
    previewRows,
    orderStandardRowsByRowId,
    fixedHeaderValues,
    userOverrides,
  ]);

  const handleCloseSenderModal = () => {
    setIsSenderModalOpen(false);
    applyFixedInputChangeToPreview();
  };

  const handleCloseNoTemplateModal = () => {
    setIsNoTemplateModalOpen(false);
  };

  const readDefaultCjIntroSuppressUntil = useCallback((): number | null => {
    const raw = readLocalStorageWithLegacyMigrate(
      DEFAULT_CJ_INTRO_SUPPRESS_KEY,
      templateStorageUserId,
    );
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }, [templateStorageUserId]);

  const writeDefaultCjIntroSuppressUntil = useCallback(
    (expiresAt: number | null) => {
      if (expiresAt === null) {
        removeLocalStorageForUser(DEFAULT_CJ_INTRO_SUPPRESS_KEY, templateStorageUserId);
        return;
      }
      writeLocalStorageForUser(
        DEFAULT_CJ_INTRO_SUPPRESS_KEY,
        templateStorageUserId,
        String(expiresAt),
      );
    },
    [templateStorageUserId],
  );

  const handleCloseTemplateOnboardingModal = useCallback(() => {
    setDefaultCjIntroAcknowledged(templateStorageUserId, ORDER_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY);
    if (dontShowTemplateGuideForWeek) {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      writeDefaultCjIntroSuppressUntil(Date.now() + oneWeekMs);
    }
    setDismissedTemplateGuideThisVisit(true);
    setIsTemplateOnboardingModalOpen(false);
    setDontShowTemplateGuideForWeek(false);
  }, [dontShowTemplateGuideForWeek, templateStorageUserId, writeDefaultCjIntroSuppressUntil]);

  const handleGoTemplateRegistrationFromOnboarding = useCallback(() => {
    setDefaultCjIntroAcknowledged(templateStorageUserId, ORDER_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY);
    setDismissedTemplateGuideThisVisit(true);
    setIsTemplateOnboardingModalOpen(false);
    setDontShowTemplateGuideForWeek(false);
    handleOpenCourierTemplateModal();
  }, [templateStorageUserId]);

  const handleOpenCourierTemplateFromNoTemplateModal = () => {
    setIsNoTemplateModalOpen(false);
    handleOpenCourierTemplateModal();
  };

  // 기본 CJ 양식 사용 중일 때 첫 안내 모달
  useLayoutEffect(() => {
    if (!authAssetsReady || !workspaceStorageHydrated) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    if (!isUsingDefaultCjTemplate) {
      setIsTemplateOnboardingModalOpen(false);
      setDismissedTemplateGuideThisVisit(false);
      return;
    }
    if (dismissedTemplateGuideThisVisit) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    if (
      isDefaultCjIntroAcknowledged(templateStorageUserId, ORDER_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY)
    ) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    const suppressUntil = readDefaultCjIntroSuppressUntil();
    if (suppressUntil && suppressUntil > Date.now()) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    setIsTemplateOnboardingModalOpen(true);
  }, [
    authAssetsReady,
    workspaceStorageHydrated,
    isUsingDefaultCjTemplate,
    dismissedTemplateGuideThisVisit,
    readDefaultCjIntroSuppressUntil,
    templateStorageUserId,
  ]);

  const processOrderInputFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (!ensureLoggedInForOrderInput()) return;

    const supportedFiles = files.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileType = file.type || '';
      return (
        extension === 'xlsx' ||
        extension === 'xls' ||
        extension === 'zip' ||
        extension === 'jpg' ||
        extension === 'jpeg' ||
        extension === 'png' ||
        extension === 'gif' ||
        extension === 'webp' ||
        fileType.startsWith('image/')
      );
    });
    setSelectedFiles(supportedFiles);

    const seenExcelKeys = new Set(
      previewRows.length > 0
        ? uploadedFileMeta.map((file) => `${file.name}:${file.size}`)
        : [],
    );
    const excelFiles: File[] = [];
    let duplicateExcelCount = 0;
    const unsupportedFileNames: string[] = [];

    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileType = file.type || '';

      if (extension === 'xlsx' || extension === 'xls' || extension === 'zip') {
        const key = `${file.name}:${file.size}`;
        if (seenExcelKeys.has(key)) {
          duplicateExcelCount += 1;
          continue;
        }

        seenExcelKeys.add(key);
        if (!queueOrderInputUntilReady({ kind: 'excel', file })) continue;
        if (!ensureCourierTemplateReady('convert')) return;

        setUploadedExcelFile(file);
        excelFiles.push(file);
        continue;
      }

      if (
        extension === 'jpg' ||
        extension === 'jpeg' ||
        extension === 'png' ||
        extension === 'gif' ||
        extension === 'webp' ||
        fileType.startsWith('image/')
      ) {
        if (!queueOrderInputUntilReady({ kind: 'image', file })) continue;
        await handleImageFileSelect(file);
        continue;
      }

      unsupportedFileNames.push(file.name);
    }

    if (excelFiles.length === 1) {
      await parseExcelFile(excelFiles[0]);
    } else if (excelFiles.length > 1) {
      const chunks = (
        await Promise.all(
          excelFiles.map((file) => parseExcelFile(file, { appendPreview: false })),
        )
      ).filter((chunk): chunk is ParsedExcelPreviewChunk => Boolean(chunk));

      if (chunks.length > 0) {
        const rowsToAdd = chunks.flatMap((chunk) => chunk.previewRows);
        const rowIdsToAdd = chunks.flatMap((chunk) => chunk.rowIds);
        const mergedUnknownHeaders = chunks.reduce<string[]>(
          (acc, chunk) => mergeUnknownHeaders(acc, chunk.unknownHeaders),
          [],
        );
        const mergedUnknownHeaderSamples = chunks.reduce<UnknownHeaderSamples>(
          (acc, chunk) => mergeUnknownHeaderSamples(acc, chunk.unknownHeaderSamples),
          {},
        );
        const finalRows = rowsToAdd.length;
        if (mergedUnknownHeaders.length > 0) {
          setUnknownHeadersWarning((prev) => mergeUnknownHeaders(prev, mergedUnknownHeaders));
          setUnknownHeaderSamples((prev) =>
            mergeUnknownHeaderSamples(prev, mergedUnknownHeaderSamples),
          );
        }
        setPreviewRows((prev) => [...rowsToAdd, ...prev]);
        setOrderStandardRowsByRowId((prev) =>
          chunks.reduce(
            (acc, chunk) =>
              registerOrderSnapshotsForPreviewChunk(acc, chunk.rowIds, chunk.standardRows),
            prev,
          ),
        );
        setNewRows((prev) => {
          const updated = new Set(prev);
          rowIdsToAdd.forEach((id) => updated.add(id));
          return updated;
        });
        setTimeout(() => {
          setNewRows((prev) => {
            const updated = new Set(prev);
            rowIdsToAdd.forEach((id) => updated.delete(id));
            return updated;
          });
        }, 3000);
        setCourierHeaders(chunks[chunks.length - 1].courierHeaders);
        setUploadedFileMeta((prev) => [
          ...chunks.map((chunk) => ({ name: chunk.file.name, size: chunk.file.size })),
          ...prev,
        ]);
        setStage2ChunkLabel(null);
        setFileProcessingStatus("done");
        const completionToken = fileProcessingTokenRef.current;
        setTimeout(() => {
          if (fileProcessingTokenRef.current === completionToken) {
            setFileProcessingStatus("idle");
          }
        }, 1500);
      } else {
        setStage2ChunkLabel(null);
        setFileProcessingStatus("idle");
      }
    }

    if (duplicateExcelCount > 0) {
      alert(`${duplicateExcelCount}개 파일은 이미 업로드되어 건너뛰었습니다.`);
    }

    if (unsupportedFileNames.length > 0) {
      const sample = unsupportedFileNames.slice(0, 5).join(', ');
      const suffix = unsupportedFileNames.length > 5 ? ` 외 ${unsupportedFileNames.length - 5}개` : '';
      alert(`지원하지 않는 파일 형식입니다: ${sample}${suffix}`);
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    void processOrderInputFiles(files);
    // input 초기화하여 같은 파일을 다시 선택할 수 있도록 함
    if (e.target) {
      e.target.value = '';
    }
  };

  // 이미지 파일 선택 및 OCR 자동 실행 (이미지 변환)
  const handleImageFileSelect = async (file: File) => {
    if (!ensureLoggedInForOrderInput()) return;

    setSelectedImage(file);
    recordWorkspaceInput('image');
    setErrorMessageTextImage(null);

    // 텍스트 정리 중 모달 열기 (이미지 파일로 표시)
    setTextProcessingSource('imageFile');
    setShowTextProcessingModal(true);
    setScreenshotStage('processing');

    try {
      setIsProcessingTextImage(true);

      const ocrText = await extractTextFromImage(file);

      setTextInput(ocrText);
      pendingImageOcrTextConvertRef.current = true;

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
    recordWorkspaceInput('image');
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

        setTextInput(extractedText);
        pendingImageOcrTextConvertRef.current = true;

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
  
  const formatNextRechargeDate = (dateLike?: string | null): string => {
    if (!dateLike) return '다음 충전일 미정';
    const parsed = new Date(dateLike);
    if (Number.isNaN(parsed.getTime())) return '다음 충전일 미정';
    return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, '0')}.${String(parsed.getDate()).padStart(2, '0')}`;
  };

  const buildInsufficientPointsMessage = (
    plan: 'FREE' | 'PRO' | 'YEARLY',
    nextPointDate?: string | null,
    feedbackTrialEndsAt?: string | null,
    adminTrialEndsAt?: string | null,
  ): string => {
    const nextDateLabel = formatNextRechargeDate(nextPointDate);
    if (!hasProEntitlementClient(plan, feedbackTrialEndsAt, adminTrialEndsAt)) {
      return `사용량이 부족합니다.\n다음 충전일(${nextDateLabel})까지 기다리거나 플랜 업그레이드 후 이용해 주세요.`;
    }
    return `사용량이 부족합니다.\n다음 충전일(${nextDateLabel})까지 기다려 주세요.`;
  };

  // 사용량 차감 헬퍼 함수
  const usePoints = async (
    amount: number,
    type: 'text' | 'download',
    options?: { redirectOnAuthRequired?: boolean },
  ): Promise<boolean> => {
    const redirectOnAuthRequired = options?.redirectOnAuthRequired ?? true;
    // 현재 사용자 정보 가져오기 (최신 상태)
    let currentUser = useUserStore.getState().user;
    
    if (!currentUser) {
      // 사용자 정보 다시 가져오기 시도
      try {
        await fetchUser();
        currentUser = useUserStore.getState().user;
        if (!currentUser) {
          if (redirectOnAuthRequired) {
            alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
            router.push('/auth/login');
          }
          return false;
        }
      } catch (error) {
        console.error('[usePoints] 사용자 정보 가져오기 실패:', error);
        if (redirectOnAuthRequired) {
          alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
          router.push('/auth/login');
        }
        return false;
      }
    }

    // 잔액이 충분하면 sync·월간지급 대기 없이 바로 차감 API 호출
    if (currentUser.points < amount) {
      await useUserStore.getState().prepareForPointCharge(amount);
      currentUser = useUserStore.getState().user;
      if (!currentUser) {
        if (redirectOnAuthRequired) {
          alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
          router.push('/auth/login');
        }
        return false;
      }
    }

    // 사용량 부족 확인
    if (currentUser.points < 1) {
      alert(
        buildInsufficientPointsMessage(
          currentUser.plan,
          currentUser.nextPointDate ?? currentUser.lastMonthlyGrant ?? null,
          currentUser.feedbackTrialEndsAt,
          currentUser.adminTrialEndsAt,
        ),
      );
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
          alert(
            buildInsufficientPointsMessage(
              currentUser.plan,
              (data.nextPointDate as string | null | undefined) ?? currentUser.nextPointDate ?? currentUser.lastMonthlyGrant ?? null,
              currentUser.feedbackTrialEndsAt,
              currentUser.adminTrialEndsAt,
            ),
          );
          return false;
        }
        throw new Error(data.error || '사용량 차감 실패');
      }

      const result = await response.json();
      if (result.success && result.user) {
        // Zustand store 업데이트
        updatePoints(result.user.points, result.user.monthlyPoints, result.user.nextPointDate);
        if (result.user.points === 0) {
          alert(`이번 작업으로 사용량이 모두 소진되었습니다.\n다음 충전일: ${formatNextRechargeDate(result.user.nextPointDate ?? currentUser.nextPointDate ?? currentUser.lastMonthlyGrant ?? null)}`);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('[OrderConvertPage] 사용량 차감 중 오류:', error);
      return false;
    }
  };

  // 텍스트 주문 변환 처리 (실제 변환 로직)
  const rollbackTextConvertPreviewRows = useCallback((rowIds: string[]) => {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    setPreviewRows((prev) => prev.filter((row) => !idSet.has(row.rowId)));
    setOrderStandardRowsByRowId((prev) => pruneOrderSnapshotsForRowIds(prev, idSet));
    setNewRows((prev) => {
      const updated = new Set(prev);
      rowIds.forEach((id) => updated.delete(id));
      return updated;
    });
  }, []);

  const handleTextConvert = async () => {
    if (textConvertInFlightRef.current || isProcessingTextImage || textConvertReviewModal !== null) {
      return;
    }
    setErrorMessageTextImage(null);

    if (!ensureCourierTemplateReady('convert')) return;

    const trimmed = textInput.trim();
    if (!trimmed) {
      setErrorMessageTextImage('변환할 텍스트를 입력해 주세요.');
      return;
    }

    const textLength = trimmed.length;

    if (!user) {
      setRequiresAccountModalOpen(true);
      return;
    }

    if (user.points < 1) {
      setErrorMessageTextImage('사용량이 부족합니다');
      return;
    }

    textConvertInFlightRef.current = true;
    setIsProcessingTextImage(true);
    setTextConvertStatusLabel(null);
    setStage2ChunkLabel(null);
    try {
      if (pendingImageOcrTextConvertRef.current) {
        pendingImageOcrTextConvertRef.current = false;
      } else {
        recordWorkspaceInput('text');
      }

      setTextConvertStatusLabel('주문 텍스트 분석 중…');
      const adapterResult = await runTextToCleanInputAdapter(trimmed);
      const { normalizeMeta: _normalizeMeta, ...cleanInputFile } = adapterResult;
      if (!cleanInputFile.rows.length) {
        setQualityNoticeModal('convert_failed');
        return;
      }

      const fileSessionId = crypto.randomUUID();
      setTextConvertStatusLabel('택배 양식에 맞추는 중…');
      const pipelineResult = await runUnifiedInputOrderPipelines({
        cleanInputFile: {
          ...cleanInputFile,
          headers: [...cleanInputFile.headers],
          rows: cleanInputFile.rows.map((r) => [...r]),
        },
        templateBridgeFile,
        fixedHeaderValues,
        fileSessionId,
        onStage2ChunkProgress: (completed, total) => {
          if (total > 1) {
            setStage2ChunkLabel(`서버 변환 ${completed}/${total}`);
          }
        },
      });

      if (!pipelineResult.mergeResult) {
        setErrorMessageTextImage('텍스트 주문 변환에 실패했습니다. 다시 시도해주세요.');
        return;
      }

      const appendResult = handleUnifiedPipelinesCompleted(pipelineResult, cleanInputFile);
      if (!appendResult) {
        setErrorMessageTextImage('텍스트 주문 변환에 실패했습니다. 다시 시도해주세요.');
        return;
      }

      setTextInput('');
      setTextConvertPointsPending(true);
      setTextConvertReviewModal({
        originalText: trimmed,
        rows: buildTextConvertReviewRows(
          appendResult.newRowIds,
          appendResult.previewRows,
          appendResult.courierHeaders,
          templateBridgeFile?.mappedBaseHeaders,
        ),
      });

      const rowIdsToRollback = appendResult.newRowIds;
      void (async () => {
        let pendingReleasedByTimeout = false;
        const pendingReleaseTimer = window.setTimeout(() => {
          pendingReleasedByTimeout = true;
          setTextConvertPointsPending(false);
          void fetchUser();
        }, 15_000);

        const pointsDeducted = await usePoints(textLength, 'text', {
          redirectOnAuthRequired: false,
        });
        window.clearTimeout(pendingReleaseTimer);
        if (!pointsDeducted) {
          if (!pendingReleasedByTimeout) {
            rollbackTextConvertPreviewRows(rowIdsToRollback);
            setTextConvertReviewModal(null);
          } else {
            void fetchUser();
          }
          setTextConvertPointsPending(false);
          return;
        }
        setTextConvertPointsPending(false);
      })();
    } catch (error) {
      console.error('[OrderConvertPage] 텍스트 주문 변환 중 오류:', error);
      const noticeKind = resolveNormalizeQualityNotice(error, isLikelyClientNetworkError);
      if (noticeKind) {
        setQualityNoticeModal(noticeKind);
        setErrorMessageTextImage(null);
      } else {
        setErrorMessageTextImage(
          error instanceof Error ? error.message : '텍스트를 변환하는 중 알 수 없는 오류가 발생했습니다.',
        );
      }
    } finally {
      setIsProcessingTextImage(false);
      setTextConvertStatusLabel(null);
      setStage2ChunkLabel(null);
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
    void processOrderInputFiles(files);
  };

  const parseExcelFile = async (
    file: File,
    options?: { appendPreview?: boolean },
  ): Promise<ParsedExcelPreviewChunk | null> => {
    const appendPreview = options?.appendPreview ?? true;
    const processingToken = fileProcessingTokenRef.current + 1;
    fileProcessingTokenRef.current = processingToken;
    setFileProcessingStatus("processing");
    setStage2ChunkLabel(null);
    recordWorkspaceInput('excel');
    
    const newOrderSessionId = crypto.randomUUID();
    setOrderFileSessionId(newOrderSessionId);

    if (!user) {
      setFileProcessingStatus('idle');
      setRequiresAccountModalOpen(true);
      return null;
    }

    // 중복 검사 로직
    if (appendPreview && previewRows.length > 0 && uploadedFileMeta.some(
      f => f.name === file.name && f.size === file.size
    )) {
      alert('이미 업로드된 파일입니다.');
      setFileProcessingStatus("idle");
      return null;
    }

    try {
    let buffer: ArrayBuffer;
    try {
      buffer = await unlockExcelFile(file);
    } catch (unlockError) {
      if (unlockError instanceof ExcelUnlockCancelledError) {
        setFileProcessingStatus('idle');
        return null;
      }
      throw unlockError;
    }
    const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);

    const filteredRows = filterNonEmptyRows(rawData);
    const headerIndex = detectHeaderRowIndex(filteredRows);
    const alignedRawData = alignRowsFromHeader(filteredRows, headerIndex);

    // ExcelPreprocessPipeline(Stage0)을 통과하여 CleanInputFile 생성
    const preprocessPipeline = new ExcelPreprocessPipeline();
    const cleanInputFile = preprocessPipeline.run(alignedRawData);
    setDirectMappingSourceHeaders([...cleanInputFile.headers]);
    setDirectMappingSourceSamples(buildHeaderSamples(cleanInputFile));

    const activeTemplateBridgeFile = getActiveTemplateBridgeFile();
    if (!activeTemplateBridgeFile) {
      setStage2ChunkLabel(null);
      setFileProcessingStatus('idle');
      setNoTemplateModalType('convert');
      setIsNoTemplateModalOpen(true);
      return null;
    }

    if (hasDirectHeaderMappings(activeTemplateBridgeFile)) {
      const directPreviewRows = buildDirectPreviewRowsFromCleanInput(
        cleanInputFile,
        activeTemplateBridgeFile,
        fixedHeaderValues,
      );
      const newRowIds = directPreviewRows.map(() => crypto.randomUUID());
      const previewRowsWithIds = directPreviewRows.map((row, index) => ({
        rowId: newRowIds[index]!,
        data: row,
      }));
      const metrics = {
        fileName: file.name,
        originalRows: Math.max(0, alignedRawData.length - 1),
        baseHeaderMatchedRows: directPreviewRows.length,
        stage1Rows: cleanInputFile.rows?.length ?? 0,
        stage2Rows: directPreviewRows.length,
        stage3Rows: directPreviewRows.length,
        stage4Rows: previewRowsWithIds.length,
      };

      setUnknownHeadersWarning([]);
      setUnknownHeaderSamples({});
      setOrderStandardFile(null);

      if (appendPreview) {
        setPreviewRows((prev) => [
          ...previewRowsWithIds,
          ...prev,
        ]);
        setOrderStandardRowsByRowId((prev) =>
          registerOrderSnapshotsForPreviewChunk(prev, newRowIds, directPreviewRows),
        );
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
        setCourierHeaders(activeTemplateBridgeFile.courierHeaders);
        setUploadedFileMeta((prev) => [
          { name: file.name, size: file.size },
          ...prev,
        ]);
        setStage2ChunkLabel(null);
        setFileProcessingStatus('done');
        setTimeout(() => {
          if (fileProcessingTokenRef.current === processingToken) {
            setFileProcessingStatus('idle');
          }
        }, 1500);
      }

      return {
        file,
        rowIds: newRowIds,
        previewRows: previewRowsWithIds,
        standardRows: directPreviewRows,
        courierHeaders: activeTemplateBridgeFile.courierHeaders,
        unknownHeaders: [],
        unknownHeaderSamples: {},
        metrics,
      };
    }

    // Stage2 실행 (대용량 시 행 청크로 서버 API 순차 호출)
    const { orderStandardFile: stage2Result, headerMapping } = await fetchOrderPipelineStage2(
      cleanInputFile,
      newOrderSessionId,
      {
        onChunkProgress: (completed, total) => {
          if (total > 1) {
            setStage2ChunkLabel(`서버 변환 ${completed}/${total}`);
          } else {
            setStage2ChunkLabel(null);
          }
        },
      },
    );

    if (headerMapping) {
      logTemplateHeaderUpload(
        buildOrderFileHeaderLogPayload(cleanInputFile.headers, headerMapping, {
          page: 'order-convert',
          fileSessionId: newOrderSessionId,
          courierName: courierUploadTemplate?.courierType ?? undefined,
        }),
      );
    }

    if (isExcloudPipelineDebugClient()) {
      try {
        const pcccBaseHeader = '개인통관번호';
        const includes =
          Array.isArray(stage2Result?.baseHeaders) &&
          stage2Result.baseHeaders.includes(pcccBaseHeader);
        const row0 = String(stage2Result?.rows?.[0]?.[pcccBaseHeader] ?? '');

        console.log(
          `[EXCLOAD][DEBUG][PCCC] Stage2 baseHeadersHas=${includes} row0=${row0}`,
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
    }

    const stage2UnknownHeaders = Array.isArray(stage2Result.unknownHeaders)
      ? stage2Result.unknownHeaders
      : [];
    const stage2UnknownHeaderSamples =
      stage2UnknownHeaders.length > 0
        ? buildUnknownHeaderSamples(stage2UnknownHeaders, cleanInputFile)
        : {};

    // unknownHeaders 처리
    if (appendPreview) {
      if (stage2UnknownHeaders.length > 0) {
        setUnknownHeadersWarning((prev) => mergeUnknownHeaders(prev, stage2UnknownHeaders));
        setUnknownHeaderSamples((prev) =>
          mergeUnknownHeaderSamples(prev, stage2UnknownHeaderSamples),
        );
      }
    }
    
    // orderStandardFile 상태는 유지하되, 누적하지 않음 (파일 단위 처리)
    if (appendPreview) {
      setOrderStandardFile(stage2Result);
    }
    
    // Stage3 실행 (handleExcelUpload 내부에서만 실행)
    if (activeTemplateBridgeFile) {
      const stage3Result = await runMergePipeline({
        template: activeTemplateBridgeFile,
        orderData: stage2Result, // ❗ 누적 전체 아님, 현재 파일의 stage2Result만 전달
        fixedInput: fixedHeaderValues,
      });

      if (isExcloudPipelineDebugClient()) {
        try {
          const pcccCourierHeader =
            stage3Result?.courierHeaders?.find((h) =>
              /개인통관번호|PCCC/i.test(String(h)),
            ) ?? null;
          const previewRow0 = pcccCourierHeader
            ? String(stage3Result?.previewRows?.[0]?.[pcccCourierHeader] ?? '')
            : '';

          const idx = pcccCourierHeader
            ? activeTemplateBridgeFile.courierHeaders.indexOf(pcccCourierHeader)
            : -1;
          const mappedBaseHeader =
            idx >= 0 ? activeTemplateBridgeFile.mappedBaseHeaders[idx] ?? null : null;

          console.log(
            `[EXCLOAD][DEBUG][PCCC] Stage3 courierHeader=${pcccCourierHeader} mappedBase=${mappedBaseHeader} previewRow0=${previewRow0}`,
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
      }
      
      // previewRows 상단 prepend 구조 적용
      const newRowIds = stage3Result.previewRows.map(() => crypto.randomUUID());
      const previewRowsWithIds = stage3Result.previewRows.map((row, index) => ({
          rowId: newRowIds[index],
          data: row
        }));
      const metrics = {
        fileName: file.name,
        originalRows: Math.max(0, alignedRawData.length - 1),
        baseHeaderMatchedRows: stage2Result.rows?.length ?? 0,
        stage1Rows: cleanInputFile.rows?.length ?? 0,
        stage2Rows: stage2Result.rows?.length ?? 0,
        stage3Rows: stage3Result.previewRows.length,
        stage4Rows: previewRowsWithIds.length,
      };

      if (appendPreview) {
        setPreviewRows(prev => [
          ...previewRowsWithIds,
          ...prev
        ]);
        setOrderStandardRowsByRowId((prev) =>
          registerOrderSnapshotsForPreviewChunk(prev, newRowIds, stage2Result.rows ?? []),
        );
        
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
        setStage2ChunkLabel(null);
        setFileProcessingStatus("done");
        setTimeout(() => {
          if (fileProcessingTokenRef.current === processingToken) {
            setFileProcessingStatus("idle");
          }
        }, 1500);
      }
      
      if (appendPreview) {
        setCourierHeaders(stage3Result.courierHeaders);
      }

      // Stage3 성공 후 메타데이터 저장
      if (appendPreview) {
        setUploadedFileMeta(prev => [
          { name: file.name, size: file.size },
          ...prev
        ]);
      }

      return {
        file,
        rowIds: newRowIds,
        previewRows: previewRowsWithIds,
        standardRows: stage2Result.rows ?? [],
        courierHeaders: stage3Result.courierHeaders,
        unknownHeaders: stage2UnknownHeaders,
        unknownHeaderSamples: stage2UnknownHeaderSamples,
        metrics,
      };
    } else {
      console.warn('[UI] Stage3 실행 불가: templateBridgeFile이 없습니다.');
    }
    
    if (typeof window !== 'undefined') {
      (window as any).__lastOrderResult = stage2Result;
      (window as any).__lastOrderFile = file.name;
    }
    return null;
    } catch (error) {
      console.error('[OrderConvertPage] parseExcelFile', error);
      setStage2ChunkLabel(null);
      setFileProcessingStatus("idle");
      alert(
        error instanceof Error
          ? error.message
          : '엑셀 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      );
      return null;
    }
  };

  const handleUnifiedPipelinesCompleted = (
    result: UnifiedInputPipelineResult,
    cleanInputFile?: UnknownHeaderSampleInput,
  ) => {
    if (!result.mergeResult) {
      return null;
    }

    // unknownHeaders 처리
    if (result.orderStandardFile?.unknownHeaders?.length > 0) {
      setUnknownHeadersWarning((prev) =>
        mergeUnknownHeaders(prev, result.orderStandardFile.unknownHeaders),
      );
      setUnknownHeaderSamples((prev) =>
        mergeUnknownHeaderSamples(
          prev,
          buildUnknownHeaderSamples(result.orderStandardFile.unknownHeaders, cleanInputFile),
        ),
      );
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
    setOrderStandardFile(result.orderStandardFile);
    setOrderStandardRowsByRowId((prev) =>
      registerOrderSnapshotsForPreviewChunk(
        prev,
        newRowIds,
        result.orderStandardFile?.rows ?? [],
      ),
    );
    
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

    return {
      newRowIds,
      previewRows: mergedPreviewRows,
      courierHeaders: mergedCourierHeaders,
    };
  };

  const handleTextConvertReviewConfirm = useCallback(() => {
    setTextConvertReviewModal(null);
    setTextConvertPointsPending(false);
  }, []);

  const handleTextConvertReviewApply = useCallback(
    (overrides: Record<string, Record<string, string>>) => {
      setUserOverrides((prev) => {
        const next = { ...prev };
        for (const [rowId, rowEdits] of Object.entries(overrides)) {
          next[rowId] = {
            ...(next[rowId] ?? {}),
            ...rowEdits,
          };
        }
        return next;
      });
    },
    [],
  );

  const handleDownloadPreview = async () => {
    if (!courierHeaders || courierHeaders.length === 0) {
      alert("택배사 양식을 먼저 등록해주세요.");
      return;
    }

    if (!sortedRows || sortedRows.length === 0) {
      alert("다운로드할 주문 데이터가 없습니다.");
      return;
    }

    if (user && shouldChargeDownloadPoints(user.plan, user.feedbackTrialEndsAt, user.adminTrialEndsAt)) {
      if (user.points < 1) {
        await useUserStore.getState().prepareForPointCharge(1000);
        const latestUser = useUserStore.getState().user;
        if (latestUser && latestUser.points < 1) {
          alert(
            buildInsufficientPointsMessage(
              latestUser.plan,
              latestUser.nextPointDate ?? latestUser.lastMonthlyGrant ?? null,
              latestUser.feedbackTrialEndsAt,
              latestUser.adminTrialEndsAt,
            ),
          );
          return;
        }
      }
    }

    if (!user) {
      alert('로그인이 필요합니다.');
      router.push('/auth/login');
      return;
    }

    setDownloadStatus("processing");

    try {
      const excelData = buildPreviewDownloadAoA(courierHeaders, sortedRows, userOverrides);
      const wb = createPreviewDownloadWorkbook(excelData);
      const fileName = buildPreviewDownloadFileName();

      if (shouldChargeDownloadPoints(user.plan, user.feedbackTrialEndsAt, user.adminTrialEndsAt)) {
        const pointsDeducted = await usePoints(1000, 'download');
        if (!pointsDeducted) {
          setDownloadStatus("idle");
          return;
        }
      }

      XLSX.writeFile(wb, fileName);

        // 히스토리 세션 저장
        try {
          const { addSession } = useHistoryStore.getState();
          
          const inputSources = normalizeInputSourcesForSession(
            sessionInputCounts,
            inputSourceType
          );
          const sourceType: SourceType = primarySourceTypeFromCounts(inputSources);
          
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
            inputSources,
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

          clearPreviewWorkspace('order-convert', storageUserId);
          void clearWorkspaceFiles('order-convert', storageUserId);

          // 🔥 기존 초기화 유지
          setPreviewRows([]);
          setOrderStandardRowsByRowId({});
          setUserOverrides({});
          setSortConfig(null);
          setUnknownHeadersWarning([]);
          setUnknownHeaderSamples({});
          setDirectMappingModalOpen(false);
          setDirectMappingSourceHeaders([]);
          setDirectMappingSourceSamples({});
          setDirectMappingRenameValues([]);
          setDirectMappingOutputOrder([]);
          setDirectMappingDraggingSourceIndex(null);
          setDirectMappingDragOverOrderIndex(null);
          setSelectedFileName(null);
          resetBundleShippingUi();

          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }

          // ✅ 다운로드 완료 후 업로드 파일 상태 초기화
          setSelectedFiles([]);
          setUploadedExcelFile(null);
          setUploadedFileMeta([]);
          clearWorkspaceInputTracking();
          setSelectedImage(null); // 이미지 초기화
        }, 3000);
    } catch (error) {
      console.error("다운로드 오류:", error);
      alert('다운로드 파일을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setDownloadStatus("idle");
    }
  };

  const applyFullPreviewWorkspaceReset = useCallback(() => {
    clearPreviewWorkspace('order-convert', storageUserId);
    void clearWorkspaceFiles('order-convert', storageUserId);
    resetBundleShippingUi();
    setPreviewRows([]);
    setOrderStandardRowsByRowId({});
    setCourierHeaders([]);
    setUserOverrides({});
    setSortConfig(null);
    setUnknownHeadersWarning([]);
    setUnknownHeaderSamples({});
    setDirectMappingModalOpen(false);
    setDirectMappingSourceHeaders([]);
    setDirectMappingSourceSamples({});
    setDirectMappingRenameValues([]);
    setDirectMappingOutputOrder([]);
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
    setSelectedFileName(null);
    setSelectedRows([]);
    setNewRows(new Set());
    setEditingCell(null);
    setActiveCell(null);
    setImagePreview(null);
    setScreenshotImagePreview(null);
    setTextInput('');
    setScreenshotStage('idle');
    setErrorMessageTextImage(null);
    setCurrentFilePreviewData([]);
    setOrderStandardFile(null);
    setSelectedFiles([]);
    setUploadedExcelFile(null);
    setUploadedFileMeta([]);
    clearWorkspaceInputTracking();
    setSelectedImage(null);
    setStage2ChunkLabel(null);
    setFileProcessingStatus('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    if (courierFileInputRef.current) courierFileInputRef.current.value = '';
    setIsPreviewResetModalOpen(false);
  }, [resetBundleShippingUi, clearWorkspaceInputTracking, storageUserId]);

  return (
    <>
      <WorkspaceSettingsCheckingOverlay
        open={settingsCheckOverlayOpen}
        message={settingsCheckOverlayMessage}
      />

      {/* 삭제 확인 모달 */}
      <BundleShippingModal
        open={isBundleShippingModalOpen}
        groups={activeBundleShippingGroups}
        courierHeaders={courierHeaders}
        previewRows={previewRows}
        userOverrides={userOverrides}
        onClose={() => setIsBundleShippingModalOpen(false)}
        onApply={handleBundleShippingApply}
      />

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-[400px] p-6">
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
                  const deleted = selectedRows;
                  setPreviewRows((prev) =>
                    prev.filter((row) => !deleted.includes(row.rowId)),
                  );
                  setOrderStandardRowsByRowId((prev) =>
                    pruneOrderSnapshotsForRowIds(prev, deleted),
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
              첨부·주문 정보와 미리보기를 비우고 처음 화면 상태로 되돌립니다.
            </p>
            <p className="text-sm text-gray-500 dark:text-zinc-500 mb-6">
              등록한 택배 양식·고정 입력은 그대로 둡니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setIsPreviewResetModalOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
                onClick={applyFullPreviewWorkspaceReset}
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pt-1.5 pb-4 bg-zinc-50 dark:bg-black">
      <main className="max-w-[1200px] mx-auto px-3 sm:px-5 lg:px-8">
        {/* Hero 섹션 - 세로 흐름 구조 (주문변환 UI 껍데기) */}
        <section className="relative pt-1 pb-3">
          <h1 className="mb-2 text-center text-lg font-semibold text-gray-900 sm:text-xl">
            택배주문변환
          </h1>
          <p className="mb-3 text-center text-sm leading-relaxed text-gray-600 px-2">
            쇼핑몰 주문 엑셀을 택배사 업로드 양식에 맞게 정리하고 변환할 수 있습니다.
            엑셀·텍스트·이미지로 받은 주문을 택배 엑셀 변환으로 자동 처리합니다.
          </p>
          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 좌·우 200px 슬롯 고정 → 가운데 flex-1 (한쪽만 있을 때는 반대쪽 빈 슬롯으로 대칭) */}
            <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-start">
                <button
                  type="button"
                  onClick={() => router.push('/order/fetch')}
                  className="flex h-[38px] w-full items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-semibold text-white shadow-md transition hover:bg-green-700 sm:w-[200px]"
                >
                  즐겨찾는 쇼핑몰
                </button>
              </div>
              <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-end">
                {user ? (
                  <div className="flex h-[38px] w-full min-w-0 items-center justify-end gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-sky-600 px-3 text-white shadow-md sm:w-[200px]">
                    <Coins className="h-4 w-4 shrink-0" />
                    <span className="shrink-0 text-sm font-medium">잔여 사용량</span>
                    <span className="min-w-0 truncate text-sm font-bold tabular-nums" title={String(user.points)}>
                      :{user.points.toLocaleString()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 통합 입력 카드 - 하나의 파란색 테두리 카드에서 파일선택(왼쪽) + 텍스트입력(오른쪽) */}
            <div className="w-full border-2 border-blue-500 rounded-xl bg-white p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                {/* 왼쪽: 파일선택 영역 (엑셀 + 이미지 드래그존) */}
                <div 
                  className="w-full lg:w-1/2 flex flex-col"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-base font-semibold text-gray-900 shrink-0">파일선택</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      주문엑셀·이미지 파일을 선택하거나 이 영역에 끌어다 놓아 주세요
                    </p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!ensureLoggedInForOrderInput()) return;
                        fileInputRef.current?.click();
                      }
                    }}
                    onClick={() => {
                      if (!ensureLoggedInForOrderInput()) return;
                      fileInputRef.current?.click();
                    }}
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
                      {(selectedFiles.length > 0 || uploadedExcelFile || uploadedFileMeta.length > 0 || selectedFileName) && (
                        <div className="flex items-center justify-center gap-3 mt-2 text-sm text-gray-600">
                          <span>
                              📄 선택된 파일:{' '}
                              {selectedFiles[0]?.name ??
                                uploadedExcelFile?.name ??
                                selectedFileName ??
                                uploadedFileMeta[0]?.name ??
                                ''}
                              {selectedFiles.length > 1
                                ? ` 외 ${selectedFiles.length - 1}개`
                                : selectedFiles.length === 0 && uploadedFileMeta.length > 1
                                  ? ` 외 ${uploadedFileMeta.length - 1}개`
                                  : ''}
                            </span>

                            <span className="w-[110px] text-right inline-block">
                              {fileProcessingStatus === "processing" && (
                                <span className="inline-flex flex-col items-end gap-0.5 text-blue-600 font-medium">
                                  <span className="inline-flex items-center justify-end gap-2">
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                    <span>변환 중{processingDots}</span>
                                  </span>
                                  {stage2ChunkLabel ? (
                                    <span className="text-[11px] font-normal text-blue-500/90">
                                      {stage2ChunkLabel}
                                    </span>
                                  ) : null}
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
                  </div>
                  <input
                    ref={fileInputRef}
                    id="unified-file-input"
                    type="file"
                    accept=".xlsx,.xls,.png,.jpg,.jpeg,.gif"
                    multiple
                    onChange={handleExcelFileChange}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="w-full mt-2.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    onClick={() => {
                      if (!ensureLoggedInForOrderInput()) return;
                      setShowScreenshotModal(true);
                    }}
                  >
                    캡처화면 주문변환 (스크린샷 주문 변환)
                  </button>
                </div>

                {/* 오른쪽: 텍스트 주문입력 영역 (lg에서 좌측 파일 영역과 동일 높이·하단 버튼 정렬) */}
                <div className="flex min-h-0 w-full flex-col border-l-0 border-gray-200 pl-0 lg:w-1/2 lg:border-l lg:pl-5">
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-base font-semibold text-gray-900 shrink-0">텍스트 주문입력</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣어주세요
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    <textarea
                      ref={textInputRef}
                      className="min-h-[180px] w-full flex-1 basis-0 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
                      placeholder={
                        needsAccount
                          ? '로그인 후 주문 내용을 붙여넣을 수 있어요.'
                          : '예) 홍길동 010-1234-5766   무선마우스 2개\n' +
                            '서울시 강남구 테헤란로 123  문앞에 놓아주세요'
                      }
                      value={textInput}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        pendingImageOcrTextConvertRef.current = false;
                        if (
                          user &&
                          !hasProEntitlementClient(user.plan, user.feedbackTrialEndsAt, user.adminTrialEndsAt) &&
                          newValue.length > FREE_TEXT_INPUT_MAX_CHARS
                        ) {
                          alert(`무료 회원은 최대 ${FREE_TEXT_INPUT_MAX_CHARS.toLocaleString('ko-KR')}자까지 입력할 수 있습니다.`);
                          return;
                        }
                        setTextInput(newValue);
                      }}
                      disabled={needsAccount || isProcessingTextImage}
                    />
                    <button
                      type="button"
                      className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!ensureLoggedInForOrderInput()) return;
                        if (!ensureCourierTemplateReady('convert')) return;
                        const today = new Date().toDateString();
                        const saved = localStorage.getItem("hideTextConvertModal");

                        if (saved === today) {
                          handleTextConvert(); // 바로 실행
                        } else {
                          setShowTextConvertModal(true);
                        }
                      }}
                      disabled={needsAccount || isProcessingTextImage || !textInput.trim()}
                    >
                      {isProcessingTextImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            {textConvertStatusLabel ?? stage2ChunkLabel ?? `변환 중${textProcessingDots}`}
                          </span>
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
              {/* 미리보기: 그리드로 제목(1열) / 버튼·건수안내·편집안내(2열, 펼치기 시작점 정렬) */}
              <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 items-start">
                <h3 className="row-start-1 col-start-1 self-center text-lg font-semibold">미리보기</h3>

                <div className="row-start-1 col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  {previewRows.length > 0 && courierHeaders.length > 0 && (
                    <button
                      type="button"
                      className={`${PREVIEW_TOOLBAR_BTN} border-gray-300 bg-white text-gray-800 hover:bg-gray-100`}
                      onClick={() => setIsPreviewExpanded(prev => !prev)}
                    >
                      {isPreviewExpanded ? '닫기' : '펼치기'}
                    </button>
                  )}

                  {previewRows.length > 0 && courierHeaders.length > 0 && (
                    <button
                      type="button"
                      className={`${PREVIEW_TOOLBAR_BTN} border-amber-500/80 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70`}
                      onClick={() => setIsPreviewResetModalOpen(true)}
                    >
                      미리보기 초기화
                    </button>
                  )}

                  {previewRows.length > 0 && courierHeaders.length > 0 && selectedRows.length > 0 && (
                    <button
                      type="button"
                      className={`${PREVIEW_TOOLBAR_BTN} border-red-600 bg-red-600 text-white hover:bg-red-700`}
                      onClick={() => {
                        setIsDeleteModalOpen(true);
                      }}
                    >
                      선택 삭제
                    </button>
                  )}

                  {previewRows.length > 0 &&
                    courierHeaders.length > 0 &&
                    bundleShippingDetection.columns &&
                    (bundleApplyUndo ? (
                      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                        <div
                          className={`${PREVIEW_TOOLBAR_BTN} whitespace-nowrap border-violet-400/70 bg-violet-50 font-normal text-violet-950`}
                        >
                          묶음 : 삭제{' '}
                          <b className="font-medium text-red-600">
                            {bundleApplyUndo.summary.deletedRowCount}
                          </b>
                          건 · 개별배송{' '}
                          <b className="font-medium">{bundleApplyUndo.summary.individualGroupCount}</b>
                          그룹 · 묶음결정{' '}
                          <b className="font-medium">{bundleApplyUndo.summary.bundleDoneGroupCount}</b>그룹
                        </div>
                        <button
                          type="button"
                          className={`${PREVIEW_TOOLBAR_BTN} border-gray-300 bg-white text-gray-800 hover:bg-gray-100`}
                          onClick={handleUndoBundleShippingApply}
                        >
                          묶음배송 적용취소
                        </button>
                      </div>
                    ) : (
                      bundleShippingGroupCount > 0 && (
                        <button
                          type="button"
                          className={`${PREVIEW_TOOLBAR_BTN} border-violet-500/80 bg-violet-50 text-violet-900 hover:bg-violet-100 ${
                            !bundleShippingButtonAcked
                              ? 'animate-pulse ring-2 ring-violet-400/80'
                              : ''
                          }`}
                          onClick={() => {
                            setBundleShippingButtonAcked(true);
                            setIsBundleShippingModalOpen(true);
                          }}
                        >
                          묶음배송가능건확인 ({bundleShippingGroupCount}그룹 ·{' '}
                          {bundleShippingRowCount}건)
                        </button>
                      )
                    ))}
                </div>

                {previewRows.length > 0 && courierHeaders.length > 0 && (
                  <p className="row-start-2 col-start-2 min-w-0 text-sm text-gray-500">
                    ✔ 셀을 클릭하면 수정할 수 있습니다.{' '}
                    ✔ 주소, 상품 등을 클릭하면 오름/내림차순 정렬됩니다.{' '}
                    ✔ 체크박스로 선택 후 삭제할 수 있습니다.
                  </p>
                )}

                {previewRows.length > 0 && courierHeaders.length > 0 && !isPreviewExpanded && (
                  <div className="row-start-3 col-start-2 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug sm:leading-tight">
                    <span className="text-black sm:whitespace-normal">
                      주문 건수·PC/인터넷 환경에 따라 처리 시간이 다소 걸릴 수 있습니다.
                    </span>
                    <span className="font-medium text-blue-600 sm:whitespace-nowrap">
                      총 {sortedRows.length.toLocaleString()}건 중 {Math.min(renderedRowCount, sortedRows.length).toLocaleString()}건 표시 중
                    </span>
                    {hasMorePreviewRows && (
                      <>
                        <button
                          type="button"
                          className={`${PREVIEW_TOOLBAR_BTN} border-gray-300 bg-white text-gray-800 hover:bg-gray-100`}
                          onClick={() =>
                            setRenderedRowCount((prev) =>
                              Math.min(prev + PREVIEW_BATCH_SIZE, sortedRows.length),
                            )
                          }
                        >
                          추가 조회 (다음 {PREVIEW_BATCH_SIZE}건)
                        </button>
                        <button
                          type="button"
                          className={`${PREVIEW_TOOLBAR_BTN} border-gray-300 bg-white text-gray-800 hover:bg-gray-100`}
                          onClick={() => setRenderedRowCount(sortedRows.length)}
                        >
                          전체 보기
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {previewSessionEnabled &&
            isPreviewSessionRestoring &&
            (previewRows.length === 0 || courierHeaders.length === 0) ? (
              <div className="min-h-[192px] flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <p>이전 작업 내용을 불러오는 중입니다…</p>
              </div>
            ) : previewRows.length === 0 || courierHeaders.length === 0 ? (
              <div className="min-h-[192px] flex items-center justify-center px-4 text-center text-sm leading-relaxed text-gray-400">
                <p>
                  주문을 가져오면 변환결과가 여기에 표시됩니다
                  <br />
                  파일 크기·주문 건수·PC/인터넷 환경에 따라 처리 시간이 다소 걸릴 수 있습니다.
                </p>
              </div>
            ) : (
              <>
                {/* unknownHeaders 경고 박스 */}
                {unknownHeadersWarning.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 p-4 rounded-lg text-sm text-amber-800 mx-6 mb-4">
                    <p className="font-semibold mb-2">
                      주문파일의 일부 헤더를 택배 업로드양식의 어느 항목에 넣어야 할지 판단하지 못했습니다.
                    </p>

                    <p className="mb-3 leading-relaxed">
                      아래 항목은 주문 관리에는 필요할 수 있지만, 현재 택배 업로드양식에 넣을 항목으로 확인되지 않았습니다.
                      <br />
                      택배사 업로드에 필요한 정보인지 확인해 주세요.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setUnknownHeadersExpanded((prev) => !prev)}
                        className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        {unknownHeadersExpanded
                          ? '자동 변환되지 않은 헤더 접기'
                          : `자동 변환되지 않은 헤더 ${unknownHeadersWarning.length}개 보기`}
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenDirectMappingModal}
                        className="rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        직접 연결해서 계속하기
                      </button>
                    </div>

                    {unknownHeadersExpanded && (
                      <div className="mt-3">
                        <div className="mb-2 text-blue-600 font-semibold text-base">
                          자동 변환되지 않은 헤더
                        </div>

                        <div className="mb-3 space-y-2">
                          {unknownHeadersWarning.map((header) => {
                            const samples = unknownHeaderSamples[header] ?? [];
                            return (
                              <div
                                key={header}
                                className="rounded-md border border-amber-200 bg-white/70 px-3 py-2"
                              >
                                <div className="font-semibold text-blue-700">
                                  {header}
                                </div>
                                <div className="mt-1 text-xs leading-relaxed text-amber-800">
                                  예시 값: {samples.length > 0 ? samples.join(' / ') : '값 없음'}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <p className="mb-3 text-xs leading-relaxed text-amber-700">
                          ※ 표시된 내용은 확인을 돕기 위한 예시이며, 개인정보는 일부 가려서 보여드립니다.
                        </p>

                        <div className="text-xs text-amber-700 leading-relaxed">
                          <strong>필요한 정보라면</strong><br />
                          택배사 업로드양식에 해당 정보를 넣을 칸이 있는지 확인한 뒤, 미리보기에서 알맞은
                          항목으로 지정하거나 원본 엑셀의 열 이름을 수정한 뒤 다시 올려 주세요.
                          <br /><br />
                          <strong>필요하지 않은 정보라면</strong><br />
                          택배사 업로드에 사용하지 않는 주문 관리용 정보일 수 있으므로, 그대로 진행하고
                          다운로드하셔도 됩니다.
                          <br /><br />
                          ※ 다운로드 전 주문 정보가 빠짐없이 정리되었는지 한 번 더 확인해 주세요.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 
                  미리보기 렌더링 데이터 소스: previewRows / courierHeaders
                  - courierHeaders 기준으로 전체 컬럼 구조 표시
                */}
                <div className={`border rounded-lg bg-white flex flex-col overflow-hidden mx-6 mb-6 ${
                  isPreviewExpanded ? 'max-h-[750px] h-auto' : 'h-[260px]'
                }`}>
                  <div
                    ref={previewScrollContainerRef}
                    onScroll={handlePreviewScroll}
                    className={`${isPreviewExpanded ? '' : 'flex-1'} overflow-auto min-h-0 preview-scrollbar preview-table-no-copy`}
                    onCopy={(e) => {
                      const t = e.target;
                      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
                      e.preventDefault();
                    }}
                  >
                    <table className="min-w-max text-sm border border-gray-300 border-collapse">
                      <thead className="bg-gray-50 sticky top-0 z-20">
                        <tr>
                          <th className="sticky left-0 z-30 border border-gray-300 bg-gray-50 px-2 py-1 text-left font-semibold border-b sm:whitespace-nowrap shadow-[1px_0_0_0_rgba(209,213,219,1)]">
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
                              className="border border-gray-300 px-2 py-1 text-left font-semibold border-b sm:whitespace-nowrap cursor-pointer select-none"
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
                        {virtualRows.map((row) => (
                          <OrderConvertPreviewTableRow
                            key={row.rowId}
                            row={row}
                            courierHeaders={courierHeaders}
                            overridesForRow={userOverrides[row.rowId]}
                            isSelected={selectedRowSet.has(row.rowId)}
                            isNewRow={newRows.has(row.rowId)}
                            localEditingHeader={
                              editingCell?.rowId === row.rowId ? editingCell.header : null
                            }
                            localEditingValue={
                              editingCell?.rowId === row.rowId ? editingValue : ''
                            }
                            localActiveHeader={
                              activeCell?.rowId === row.rowId ? activeCell.header : null
                            }
                            onToggleSelect={handlePreviewRowToggleSelect}
                            onCellClickStartEdit={handlePreviewCellClickStartEdit}
                            onEditingInputChange={handlePreviewEditingInputChange}
                            onCommitEdit={commitCellEdit}
                            onFinishEditUi={handlePreviewFinishEditUi}
                          />
                        ))}
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
                변환이 완료된 주문데이터를 미리보기 기준으로
                <br />
                택배사 업로드용 파일로 내려받는 단계입니다.
              </p>
            </button>
          </div>

          <WorkspaceFormStatusBanner
            isChecking={isFormStatusChecking}
            templateHeaderNames={activeTemplateHeaderNames}
            fixedHeaderOrder={FIXED_HEADER_ORDER}
            fixedHeaderValues={fixedHeaderValues}
            variant="blue"
          />
          {isUsingDefaultCjTemplate && !isFormStatusChecking && (
            <DefaultCjTemplateNotice
              variant="courier"
              onRegisterCustom={handleOpenCourierTemplateModal}
            />
          )}
        </section>

      </main>

      {isCourierTemplateModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseCourierTemplateModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[900px] h-[90vh] max-h-[90vh] sm:h-[798px] sm:max-h-[798px] flex flex-col p-4 sm:p-6"
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
                  지금 택배사에 올리는 업로드 엑셀을 등록하면,
                  <br />
                  그 양식 그대로 자동 설정됩니다.
                  <br />
                  택배사·양식이 여러 개면 추가로 등록해 목록에서 관리·선택할 수 있습니다.
                </p>
                <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-[13px] leading-relaxed text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  내 업로드 파일: 계약 택배사에서 안내받은 “업로드용 엑셀 파일” 또는 실제 택배사
                  프로그램에 첨부하는 “엑셀파일”입니다.
                </p>
                <input
                  ref={courierFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleTemplateFileInputChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleTemplateFileClick}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-lg font-medium text-sm"
                >
                  내 업로드 파일 등록하기
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualTemplateBuilderOpen(true)}
                  className="mt-2 w-full border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 h-11 rounded-lg font-medium text-sm dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/70"
                >
                  내 출력 양식 만들기
                </button>
                <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[13px] leading-relaxed text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  내 출력 양식: 택배사 업로드용뿐 아니라 거래처 제출용, 자체 관리용 등
                  원하는 열 순서로 직접 만드는 “다운로드 엑셀 양식”입니다.
                </p>
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
                                        className="w-[40%] min-w-0 sm:min-w-[240px] px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                                        placeholder="양식 이름을 입력하세요"
                                      />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleConfirmEditName(format.id);
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs sm:whitespace-nowrap"
                                      >
                                        확인
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCancelEditName();
                                        }}
                                        className="bg-white border border-gray-300 text-gray-900 px-3 py-1 rounded text-xs sm:whitespace-nowrap"
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
                                        className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
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

      <UploadTemplateChangeReuploadModal
        open={isTemplateChangeReuploadModalOpen}
        onClose={() => setIsTemplateChangeReuploadModalOpen(false)}
        bodyExtra="텍스트·이미지로 넣으신 주문이 있었다면, 해당 입력도 다시 진행해 주세요."
      />

      <WorkspaceBlockingModalOverlay
        open={directMappingModalOpen}
        aria-labelledby="direct-header-mapping-title"
        panelClassName="w-full max-w-[1482px]"
      >
        <div className="flex h-[88vh] w-full max-w-[1482px] flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:h-[84vh] sm:p-6">
          <div className="mb-4 flex flex-shrink-0 items-start justify-between gap-4">
            <div>
              <h2
                id="direct-header-mapping-title"
                className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
              >
                직접 연결 양식 만들기
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                주문파일의 헤더를 기준으로 출력 양식을 직접 만들어 보세요.
                <br />
                원본 헤더명은 그대로 확인하고, 사용할 헤더명과 출력 순서를 정하면 앞으로 같은 형식으로 변환할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDirectMappingModalOpen(false)}
              className="rounded-lg p-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="닫기"
            >
              <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </button>
          </div>

          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            2번 행에서 헤더명을 바꾸면 해당 열의 셀값은 그대로 유지되고, 변경한 이름 아래로 이동합니다.
            3번 행에서 좌우 버튼으로 다운로드 파일의 열 순서를 정한 뒤 양식으로 등록합니다.
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="border-collapse text-sm">
              <tbody>
                <tr className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <th className="sticky left-0 z-20 min-w-[150px] border-b border-r border-zinc-200 bg-zinc-100 px-3 py-2 text-left dark:border-zinc-700 dark:bg-zinc-800">
                    <div>1. 현재 파일 헤더명</div>
                    <div className="mt-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      수정할 수 없는 원본 헤더입니다.
                    </div>
                  </th>
                  {directMappingSourceHeaders.map((sourceHeader, index) => (
                    <td
                      key={`direct-source-${sourceHeader}-${index}`}
                      className="min-w-[220px] border-b border-r border-zinc-200 px-3 py-2 align-top font-semibold dark:border-zinc-700"
                    >
                      <div
                        className="h-[40px] overflow-hidden text-sm leading-5"
                        style={{
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2,
                        }}
                      >
                        {sourceHeader}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    <div>2. 명칭 변경</div>
                    <div className="mt-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      이름만 바꾸고 셀값은 그대로 가져옵니다.
                    </div>
                  </th>
                  {directMappingSourceHeaders.map((sourceHeader, index) => {
                    const isAddedToOutput = directMappingOutputOrder.includes(index);
                    return (
                      <td
                        key={`direct-rename-${sourceHeader}-${index}`}
                        className="border-b border-r border-zinc-100 px-3 py-2 align-top dark:border-zinc-800"
                      >
                        <input
                          type="text"
                          value={directMappingRenameValues[index] ?? ''}
                          onChange={(e) => handleDirectMappingRenameChange(index, e.target.value)}
                          className="h-[40px] w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        <div className="mt-1 min-h-[16px] overflow-hidden text-[11px] leading-4 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-ellipsis">
                          예시값: {(directMappingSourceSamples[sourceHeader] ?? []).join(' / ') || '-'}
                        </div>
                        <div
                          draggable={!isAddedToOutput}
                          onDragStart={(event) => {
                            if (!isAddedToOutput) handleDirectMappingDragStart(event, index);
                          }}
                          onDragEnd={handleDirectMappingDragEnd}
                          className={`mt-2 h-[40px] rounded-lg border px-3 py-2 text-sm font-semibold leading-5 ${
                            isAddedToOutput
                              ? 'cursor-default border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100'
                              : 'cursor-grab border-blue-200 bg-blue-50 text-blue-800 active:cursor-grabbing dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'
                          }`}
                          title={isAddedToOutput ? '이미 최종 출력 순서에 추가되었습니다.' : '아래 3번 행으로 드래그하면 출력 순서에 추가됩니다.'}
                        >
                          <div className="truncate">
                            {isAddedToOutput ? '추가됨' : directMappingRenameValues[index]?.trim() || sourceHeader}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    <div>3. 최종 출력 순서</div>
                    <div className="mt-1 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      출력할 열 순서를 정합니다.
                    </div>
                  </th>
                  {directMappingSourceHeaders.map((_, orderIndex) => {
                    const sourceIndex = directMappingOutputOrder[orderIndex];
                    const hasOutput = typeof sourceIndex === 'number';
                    const sourceHeader = hasOutput ? directMappingSourceHeaders[sourceIndex] ?? '' : '';
                    const outputHeader = hasOutput
                      ? directMappingRenameValues[sourceIndex]?.trim() || sourceHeader
                      : '';
                    return (
                      <td
                        key={`direct-final-slot-${orderIndex}`}
                        onDragOver={(event) => handleDirectMappingDragOver(event, orderIndex)}
                        onDrop={(event) => handleDirectMappingDrop(event, orderIndex)}
                        onDragLeave={() => setDirectMappingDragOverOrderIndex(null)}
                        className={`border-r px-3 py-2 align-top transition-colors dark:border-zinc-800 ${
                          directMappingDragOverOrderIndex === orderIndex
                            ? 'border-blue-300 bg-blue-50/70 dark:bg-blue-950/30'
                            : 'border-zinc-100'
                        }`}
                      >
                        {!hasOutput ? (
                          <div className="flex h-[56px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">
                            여기에 놓기
                          </div>
                        ) : (
                          <div
                            draggable
                            onDragStart={(event) => handleDirectMappingDragStart(event, sourceIndex)}
                            onDragEnd={handleDirectMappingDragEnd}
                            className={`h-[56px] cursor-grab rounded-lg border px-3 py-2 text-sm font-semibold leading-5 active:cursor-grabbing ${
                              directMappingDraggingSourceIndex === sourceIndex
                                ? 'border-blue-400 bg-blue-100 text-blue-900 opacity-70 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-100'
                                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'
                            }`}
                            title="드래그해서 출력 순서를 바꿀 수 있습니다."
                          >
                            <div
                              className="h-[40px] overflow-hidden"
                              style={{
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: 2,
                              }}
                            >
                              {outputHeader}
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveDirectMappingOutputHeader(sourceIndex, -1)}
                            disabled={!hasOutput || orderIndex === 0}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDirectMappingOutputHeader(sourceIndex, 1)}
                            disabled={!hasOutput || orderIndex === directMappingOutputOrder.length - 1}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                          >
                            →
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex-shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              현재 출력 순서
            </div>
            <div className="flex flex-wrap gap-1.5">
              {directMappingOutputOrder.map((sourceIndex, orderIndex) => {
                const sourceHeader = directMappingSourceHeaders[sourceIndex] ?? '';
                const outputHeader = directMappingRenameValues[sourceIndex]?.trim() || sourceHeader;
                return (
                  <span
                    key={`direct-order-chip-${sourceHeader}-${sourceIndex}`}
                    className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                  >
                    {orderIndex + 1}. {outputHeader}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-shrink-0 items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              등록 후에는 현재 미리보기가 초기화됩니다. 같은 주문파일을 다시 첨부하면 등록한 이름과 순서대로 변환됩니다.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDirectMappingModalOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreateDirectMappingFormat}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                직접 연결 양식 등록
              </button>
            </div>
          </div>
        </div>
      </WorkspaceBlockingModalOverlay>

      <WorkspaceBlockingModalOverlay
        open={isManualTemplateBuilderOpen}
        aria-labelledby="manual-template-builder-title"
        panelClassName="w-full max-w-[1482px]"
      >
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[1482px] h-[88vh] sm:h-[84vh] flex flex-col p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <h2
              id="manual-template-builder-title"
              className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
            >
              내 출력 양식 만들기
            </h2>
            <button
              type="button"
              onClick={() => setIsManualTemplateBuilderOpen(false)}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            </button>
          </div>

          <div className="mb-6 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              자주 사용하는 엑셀 형식을 직접 만들어 보세요.
              <br />
              택배사 업로드 파일뿐 아니라 거래처 제출용, 자체 관리용 등 원하는 엑셀 양식을 자유롭게 만들 수 있습니다.
              <br />
              매번 복사·붙여넣기하거나 셀을 옮길 필요 없이 주문 데이터를 원하는 형태로 자동 정리합니다.
              <br />
              원하는 열 순서만 한 번 설정하면 앞으로는 주문 파일을 자동으로 같은 형식으로 변환합니다.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[400px] pb-2">
            <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    헤더명 입력
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    열 순서는 다운로드될 다운로드 파일의 열 순서로 사용됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddManualTemplateHeader}
                  className="min-w-[120px] rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  셀추가 +
                </button>
              </div>

              <div className="overflow-x-auto p-4 preview-scrollbar">
                <table className="min-w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="bg-zinc-100 dark:bg-zinc-800">
                      {manualTemplateHeaders.map((_, index) => (
                        <th
                          key={`manual-template-modal-heading-${index}`}
                          className={`min-w-[220px] border px-3 py-2 text-left font-semibold transition-colors ${
                            manualTemplateActiveIndex === index
                              ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                              : 'border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {index + 1}. 헤더명 입력
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {manualTemplateHeaders.map((header, index) => (
                        <td
                          key={`manual-template-modal-input-${index}`}
                          className={`min-w-[220px] border p-2 transition-colors ${
                            manualTemplateActiveIndex === index
                              ? 'border-blue-300 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/30'
                              : 'border-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={header}
                              onFocus={() => setManualTemplateActiveIndex(index)}
                              onChange={(e) => handleManualTemplateHeaderChange(index, e.target.value)}
                              placeholder="예: 받는 사람"
                              className={`h-10 min-w-0 flex-1 rounded-md border px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:text-zinc-100 dark:focus:ring-blue-950 ${
                                manualTemplateActiveIndex === index
                                  ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40'
                                  : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950'
                              }`}
                            />
                            {manualTemplateHeaders.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveManualTemplateHeader(index)}
                                className="h-10 w-8 rounded-md border border-zinc-300 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                aria-label="헤더 입력칸 삭제"
                              >
                                X
                              </button>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <span className="font-medium">
                  현재 선택 칸: {manualTemplateActiveIndex + 1}번째
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    현재까지 입력:
                  </span>
                  {manualTemplateEnteredHeaders.length > 0 ? (
                    manualTemplateEnteredHeaders.map((header) => (
                      <span
                        key={`${header.index}-${header.name}`}
                        className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                      >
                        {header.index + 1}. {header.name}(지정)
                      </span>
                    ))
                  ) : (
                    <span className="text-zinc-400 dark:text-zinc-500">
                      아직 입력된 헤더가 없습니다.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    입력 예시
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      예시문을 선택하거나 참고하여 직접 입력하세요.
                    </p>
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-200">
                      보내는분 / 연락처 / 상품명 등 보편적으로 사용하는 이름을 권장합니다.
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  value={manualTemplateExampleQuery}
                  onChange={(e) => setManualTemplateExampleQuery(e.target.value)}
                  placeholder="예시 검색: 주소, 전화, 상품"
                  className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-blue-950 sm:w-[280px]"
                />
              </div>

              <div className="h-[260px] overflow-y-auto">
                {filteredManualTemplateHeaderExamples.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {filteredManualTemplateHeaderExamples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => handleInsertManualTemplateExample(example)}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/50 dark:hover:text-blue-200"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    검색 결과가 없습니다.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setIsManualTemplateBuilderOpen(false)}
              className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreateManualTemplate}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white font-medium"
            >
              완료
            </button>
          </div>
        </div>
      </WorkspaceBlockingModalOverlay>

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

      {/* 기본 CJ 양식 안내 모달 */}
      {isTemplateOnboardingModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseTemplateOnboardingModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[620px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {DEFAULT_CJ_INTRO_COPY.modalTitle}
              </h2>
              <button
                onClick={handleCloseTemplateOnboardingModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="안내 닫기"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            <div className="mb-5">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                {DEFAULT_CJ_INTRO_COPY.modalBodyCourier}
              </p>
            </div>

            <label className="mb-5 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={dontShowTemplateGuideForWeek}
                onChange={(e) => setDontShowTemplateGuideForWeek(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              7일 동안 보지 않기
            </label>

            <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={handleCloseTemplateOnboardingModal}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {DEFAULT_CJ_INTRO_COPY.continueButton}
              </button>
              <button
                onClick={handleGoTemplateRegistrationFromOnboarding}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white font-medium"
              >
                {DEFAULT_CJ_INTRO_COPY.registerButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 고정 입력 정보 설정 모달 — 배경 클릭·뒤 페이지 조작 차단 */}
      <WorkspaceBlockingModalOverlay
        open={isSenderModalOpen}
        aria-labelledby="fixed-input-modal-title"
      >
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[1482px] h-[88vh] sm:h-[84vh] flex flex-col p-4 sm:p-6">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2
                id="fixed-input-modal-title"
                className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
              >
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
                모든 주문에 공통으로 쓸 보내는 사람, 택배사 운임 등을 설정합니다.
                <br />
                주문에 값이 있으면 그 값을 우선하고, 비어 있는 항목에만 고정 입력이 적용됩니다.
                <br />
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                  (예:{' '}
                  <span className="inline-flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span>‘배송 전 연락 주세요’ 있음 → 유지</span>
                    <span aria-hidden="true" className="text-zinc-400">
                      ·
                    </span>
                    <span>없음 → 고정 ‘문 앞에 두세요’</span>
                  </span>
                  )
                </span>
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
                                setFixedHeaderValues((prev) =>
                                  patchFixedHeaderEntry(
                                    prev,
                                    headerName,
                                    inputValue,
                                    templateBridgeFile,
                                  ),
                                );
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
                              setFixedHeaderValues((prev) =>
                                patchFixedHeaderEntry(
                                  prev,
                                  headerName,
                                  inputValue,
                                  templateBridgeFile,
                                ),
                              );
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
                              setFixedHeaderValues((prev) =>
                                deleteFixedHeaderEntry(
                                  prev,
                                  headerName,
                                  templateBridgeFile,
                                ),
                              );
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
                    설정된 고정 입력 값은 확인 시 미리보기에 반영되며, 다운로드 파일에도 동일하게 적용됩니다.
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
      </WorkspaceBlockingModalOverlay>

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

      {excelUnlockUi}

      <RequiresAccountOrderModal
        open={requiresAccountModalOpen}
        onClose={() => setRequiresAccountModalOpen(false)}
      />

      <NormalizeQualityNoticeModal
        isOpen={qualityNoticeModal !== 'hidden'}
        variant={qualityNoticeModal === 'hidden' ? 'network' : qualityNoticeModal}
        onClose={() => setQualityNoticeModal('hidden')}
      />

      <TextConvertResultReviewModal
        isOpen={textConvertReviewModal !== null}
        originalText={textConvertReviewModal?.originalText ?? ''}
        rows={textConvertReviewModal?.rows ?? []}
        pointsPending={textConvertPointsPending}
        onConfirm={handleTextConvertReviewConfirm}
        onApply={handleTextConvertReviewApply}
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

