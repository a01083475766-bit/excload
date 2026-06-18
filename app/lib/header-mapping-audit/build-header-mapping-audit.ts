import type {
  HeaderMappingDetail,
  HeaderMappingMethod,
  HeaderMappingStatus,
} from '@/app/pipeline/template/map-template-to-base';

import {
  inferSampleValueType,
  type SampleValueType,
} from './infer-sample-value-type';
import { maskSampleValue } from './mask-sample-value';

export type HeaderMappingAuditEntry = {
  originalHeader: string;
  baseHeader: string | null;
  status: HeaderMappingStatus;
  method: HeaderMappingMethod;
  confidenceReason: string;
  sampleValueType: SampleValueType;
  maskedSamples: string[];
  sampleCount: number;
  hasMaskedSamples: boolean;
};

export type BuildHeaderMappingAuditOptions = {
  maxSamplesPerHeader?: number;
};

const DEFAULT_MAX_SAMPLES = 5;
const MIN_MAX_SAMPLES = 1;
const MAX_MAX_SAMPLES = 5;

function clampMaxSamples(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_SAMPLES;
  return Math.min(Math.max(Math.floor(value!), MIN_MAX_SAMPLES), MAX_MAX_SAMPLES);
}

function buildTypeContext(detail: HeaderMappingDetail): string {
  return [detail.originalHeader, detail.baseHeader, detail.status, detail.method]
    .filter(Boolean)
    .join(' ');
}

function pickRepresentativeType(types: SampleValueType[]): SampleValueType {
  const filtered = types.filter((type) => type !== 'EMPTY');
  if (filtered.length === 0) return 'EMPTY';

  const counts = new Map<SampleValueType, number>();
  for (const type of filtered) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? filtered[0];
}

function buildFallbackDetail(headers: string[], index: number): HeaderMappingDetail {
  const originalHeader = headers[index] ?? '';
  return {
    originalHeader,
    baseHeader: null,
    status: 'UNMAPPED',
    method: 'UNMAPPED',
    confidenceReason: 'mappingDetails가 없어 미매핑으로 보정',
  };
}

export function buildHeaderMappingAuditEntries(
  headers: string[],
  rows: unknown[][],
  mappingDetails: HeaderMappingDetail[],
  options: BuildHeaderMappingAuditOptions = {},
): HeaderMappingAuditEntry[] {
  const maxSamples = clampMaxSamples(options.maxSamplesPerHeader);

  return headers.map((header, headerIndex) => {
    const detail = mappingDetails[headerIndex] ?? buildFallbackDetail(headers, headerIndex);
    const contextHeader = buildTypeContext(detail);
    const maskedSamples: string[] = [];
    const seenSamples = new Set<string>();
    const sampleTypes: SampleValueType[] = [];

    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const rawValue = row[headerIndex];
      const rawText = String(rawValue ?? '').trim();
      if (!rawText) continue;

      const valueType = inferSampleValueType(rawText, { header: contextHeader });
      const masked = maskSampleValue(rawText, {
        header: contextHeader,
        valueType,
      });

      if (!masked.shouldStore || !masked.value) continue;

      // TEXT는 원문을 저장하지 않는 상수 토큰만 허용한다.
      if (masked.type === 'TEXT' && masked.value !== '[텍스트]') continue;

      if (seenSamples.has(masked.value)) continue;
      seenSamples.add(masked.value);
      maskedSamples.push(masked.value);
      sampleTypes.push(masked.type);

      if (maskedSamples.length >= maxSamples) break;
    }

    return {
      originalHeader: detail.originalHeader || header,
      baseHeader: detail.baseHeader,
      status: detail.status,
      method: detail.method,
      confidenceReason: detail.confidenceReason,
      sampleValueType: pickRepresentativeType(sampleTypes),
      maskedSamples,
      sampleCount: maskedSamples.length,
      hasMaskedSamples: maskedSamples.length > 0,
    };
  });
}
