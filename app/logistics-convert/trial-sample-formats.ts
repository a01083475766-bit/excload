/**
 * 무료 체험(/trial) — 서비스 제공 예시 업로드 양식 (택배사명 비표기)
 */

import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { ALIAS_DICTIONARY } from '@/app/pipeline/base/alias-dictionary';
import { refineMappedBaseHeadersCouriers } from '@/app/pipeline/template/refine-mapped-base-headers';

function normalizeCourierHeader(header: string): string {
  return header
    .replace(/\s/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[.·]/g, '')
    .replace(/[^가-힣0-9]/g, '')
    .trim();
}

/** 체험 예시 양식용 — alias 사전만으로 bridge 생성 (AI·DB 없음) */
function mapTrialHeadersToBridge(courierHeaders: string[]): Pick<
  TemplateBridgeFile,
  'mappedBaseHeaders' | 'unknownHeaders'
> {
  const mappedBaseHeaders: (string | null)[] = [];
  const unknownHeaders: string[] = [];

  for (let i = 0; i < courierHeaders.length; i++) {
    const courierHeader = courierHeaders[i];
    const normalizedHeader = normalizeCourierHeader(courierHeader);

    if ((BASE_HEADERS as readonly string[]).includes(normalizedHeader)) {
      mappedBaseHeaders[i] = normalizedHeader;
      continue;
    }

    const baseHeaderKey =
      ALIAS_DICTIONARY[courierHeader] || ALIAS_DICTIONARY[normalizedHeader];

    if (baseHeaderKey) {
      mappedBaseHeaders[i] = baseHeaderKey;
    } else {
      mappedBaseHeaders[i] = null;
      unknownHeaders.push(courierHeader);
    }
  }

  return {
    mappedBaseHeaders: refineMappedBaseHeadersCouriers(courierHeaders, mappedBaseHeaders),
    unknownHeaders,
  };
}

interface TrialCourierUploadHeader {
  name: string;
  index: number;
  isEmpty: boolean;
}

export interface TrialCourierUploadTemplate {
  courierType: string | null;
  headers: TrialCourierUploadHeader[];
  requiresSender?: boolean;
}

export const TRIAL_DEFAULT_FORMAT_DISPLAY_NAME = '체험 기본 양식 (예시)';

export const TRIAL_SEED_FORMAT_IDS = {
  logistics: 'trial-seed-ex-1',
  courierStyleA: 'trial-seed-ex-2',
  courierStyleB: 'trial-seed-ex-3',
  courierStyleC: 'trial-seed-ex-4',
} as const;

export type TrialSeedFormatId = (typeof TRIAL_SEED_FORMAT_IDS)[keyof typeof TRIAL_SEED_FORMAT_IDS];

export interface TrialSampleFormatSpec {
  id: TrialSeedFormatId;
  displayName: string;
  /** 업로드 엑셀 1행 헤더 (실제 택배·물류 업로드 양식과 유사한 예시) */
  headers: string[];
}

/** 체험 기본(물류·3PL형) — public xlsx와 동일 계열, id만 고정 */
export const TRIAL_LOGISTICS_SEED: TrialSampleFormatSpec = {
  id: TRIAL_SEED_FORMAT_IDS.logistics,
  displayName: TRIAL_DEFAULT_FORMAT_DISPLAY_NAME,
  headers: [],
};

/**
 * CJ 일반 B2C 업로드 양식에 흔한 헤더 구성 (택배사명 미표기)
 * @see CJ 대한통운 일반 접수 엑셀 양식 계열
 */
const CJ_STYLE_HEADERS = [
  '받는분성명',
  '받는분전화번호',
  '받는분기타연락처',
  '받는분우편번호',
  '받는분주소(전체)',
  '품목명',
  '수량',
  '박스수량',
  '배송메시지1',
  '보내는분성명',
  '보내는분전화번호',
  '보내는분주소(전체)',
] as const;

/** 롯데택배 일반 업로드 양식 계열 */
const LOTTE_STYLE_HEADERS = [
  '수취인명',
  '수취인전화',
  '수취인휴대폰',
  '수취인우편번호',
  '수취인주소',
  '상품명',
  '상품수량',
  '배송메시지',
  '보내는분명',
  '보내는분전화',
  '보내는분주소',
  '운임구분',
  '지불방법',
] as const;

/** 로젠택배 일반 업로드 양식 계열 */
const LOGEN_STYLE_HEADERS = [
  '받는분이름',
  '받는분전화',
  '받는분핸드폰',
  '받는분주소',
  '품명',
  '수량',
  '배송메세지',
  '보내는분이름',
  '보내는분전화',
  '보내는분주소',
  '운임Type',
  '접수번호',
] as const;

/** xlsx 자동 등록 외, 코드로 넣는 추가 예시 3종 */
export const TRIAL_EXTRA_SAMPLE_FORMATS: TrialSampleFormatSpec[] = [
  {
    id: TRIAL_SEED_FORMAT_IDS.courierStyleA,
    displayName: '체험 업로드 양식 (예시 2)',
    headers: [...CJ_STYLE_HEADERS],
  },
  {
    id: TRIAL_SEED_FORMAT_IDS.courierStyleB,
    displayName: '체험 업로드 양식 (예시 3)',
    headers: [...LOTTE_STYLE_HEADERS],
  },
  {
    id: TRIAL_SEED_FORMAT_IDS.courierStyleC,
    displayName: '체험 업로드 양식 (예시 4)',
    headers: [...LOGEN_STYLE_HEADERS],
  },
];

export function isTrialSeedFormatId(id: string | undefined): boolean {
  if (!id) return false;
  return (Object.values(TRIAL_SEED_FORMAT_IDS) as string[]).includes(id);
}

export function buildTrialBridgeFile(headers: string[]): TemplateBridgeFile {
  const courierHeaders = headers.filter((h) => h && h.trim() !== '');
  const { mappedBaseHeaders, unknownHeaders } = mapTrialHeadersToBridge(courierHeaders);
  return {
    baseHeaders: [...BASE_HEADERS],
    courierHeaders,
    mappedBaseHeaders,
    unknownHeaders,
  };
}

/** 별칭 사전 보강 후, 예전에 null이던 열을 다시 매핑할 수 있는지 검사 */
export function trialBridgeNeedsAliasRefresh(bridgeFile: TemplateBridgeFile): boolean {
  const courierHeaders = bridgeFile.courierHeaders ?? [];
  if (courierHeaders.length === 0) return false;

  const fresh = mapTrialHeadersToBridge(courierHeaders);
  const mapped = bridgeFile.mappedBaseHeaders ?? [];

  for (let i = 0; i < courierHeaders.length; i++) {
    const label = courierHeaders[i]?.trim();
    if (!label) continue;
    if (!mapped[i] && fresh.mappedBaseHeaders[i]) return true;
  }
  return false;
}

/** 현재 ALIAS_DICTIONARY 기준으로 mappedBaseHeaders만 다시 계산 */
export function refreshTrialBridgeMappings(bridgeFile: TemplateBridgeFile): TemplateBridgeFile {
  const courierHeaders = (bridgeFile.courierHeaders ?? []).filter((h) => h?.trim());
  const fresh = buildTrialBridgeFile(courierHeaders);
  return {
    ...bridgeFile,
    baseHeaders: fresh.baseHeaders,
    courierHeaders: fresh.courierHeaders,
    mappedBaseHeaders: fresh.mappedBaseHeaders,
    unknownHeaders: fresh.unknownHeaders,
  };
}

/**
 * 체험 localStorage bridge 보정
 * - baseHeaders 비어 있음 → 재생성
 * - 별칭 추가로 이전에 null이던 열이 매핑 가능 → mappedBaseHeaders 갱신
 */
export function repairTrialBridgeFileIfNeeded(
  columnOrder: string[],
  bridgeFile: TemplateBridgeFile | undefined,
): TemplateBridgeFile {
  const headersFromOrder = columnOrder.filter((h) => h?.trim());
  const headers =
    headersFromOrder.length > 0
      ? headersFromOrder
      : (bridgeFile?.courierHeaders ?? []).filter((h) => h?.trim());

  if (!bridgeFile?.baseHeaders?.length) {
    return buildTrialBridgeFile(headers);
  }

  if (trialBridgeNeedsAliasRefresh(bridgeFile)) {
    return refreshTrialBridgeMappings(bridgeFile);
  }

  return bridgeFile;
}

export function buildCourierTemplateFromHeaders(headers: string[]): TrialCourierUploadTemplate {
  const courierHeaders = headers.filter((h) => h && h.trim() !== '');
  return {
    courierType: null,
    headers: courierHeaders.map((name, index) => ({
      name,
      index,
      isEmpty: false,
    })),
    requiresSender: courierHeaders.some((name) =>
      /보내|발송|송화|출고지|판매자/i.test(name),
    ),
  };
}
