import type { OrderStandardFile } from '@/app/pipeline/order/order-pipeline';
import type { MappingResult } from '@/app/pipeline/template/map-template-to-base';

/** Stage2 입력: 엑셀 전처리 결과 또는 텍스트/이미지 어댑터 결과 */
export type OrderPipelineStage2Input = {
  headers: string[];
  rows: string[][];
  sourceType: string;
};

/** 한 번에 서버로 보내는 최대 행 수(초과 시 순차 청크 + 헤더 매핑 재사용) */
export const ORDER_PIPELINE_ROW_CHUNK_SIZE = 200;

export type OrderPipelineFetchInit = {
  /** `/trial`, `/excload` 등 무료 체험 컨텍스트에서 전달 */
  trialHeader?: boolean;
  /** 대용량 청크 순차 호출 시 진행률(완료 청크 수 / 전체 청크 수) */
  onChunkProgress?: (completed: number, total: number) => void;
};

function stripStage2Extension(
  json: OrderStandardFile & { _reuseHeaderMapping?: MappingResult },
): OrderStandardFile {
  const { _reuseHeaderMapping: _r, ...rest } = json;
  return rest as OrderStandardFile;
}

async function postOrderPipeline(
  body: Record<string, unknown>,
  init?: OrderPipelineFetchInit,
): Promise<OrderStandardFile & { _reuseHeaderMapping?: MappingResult }> {
  const response = await fetch('/api/order-pipeline', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.trialHeader ? { 'x-excload-trial': '1' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Stage2(Order Pipeline) 실패: ${response.status} ${response.statusText} ${errText.slice(0, 240)}`,
    );
  }

  return response.json();
}

/**
 * Stage2 `/api/order-pipeline` 호출 — 대용량 행은 서버 부담·타임아웃 완화를 위해 행 단위 청크로 순차 요청합니다.
 */
export async function fetchOrderPipelineStage2(
  cleanInputFile: OrderPipelineStage2Input,
  fileSessionId: string,
  init?: OrderPipelineFetchInit,
): Promise<OrderStandardFile> {
  const rows = cleanInputFile.rows;
  const totalChunks = Math.max(
    1,
    Math.ceil((Array.isArray(rows) ? rows.length : 0) / ORDER_PIPELINE_ROW_CHUNK_SIZE),
  );

  if (!Array.isArray(rows) || rows.length <= ORDER_PIPELINE_ROW_CHUNK_SIZE) {
    const json = await postOrderPipeline(
      { ...cleanInputFile, fileSessionId },
      init,
    );
    init?.onChunkProgress?.(1, totalChunks);
    return stripStage2Extension(json);
  }

  const { headers, sourceType } = cleanInputFile;
  const mergedRows: OrderStandardFile['rows'] = [];
  let unknownHeaders: string[] = [];
  let baseHeaders: OrderStandardFile['baseHeaders'] | null = null;
  let reuse: MappingResult | undefined;

  for (let offset = 0; offset < rows.length; offset += ORDER_PIPELINE_ROW_CHUNK_SIZE) {
    const chunkRows = rows.slice(offset, offset + ORDER_PIPELINE_ROW_CHUNK_SIZE);
    const body: Record<string, unknown> = {
      headers,
      rows: chunkRows,
      sourceType,
      fileSessionId,
    };
    if (reuse) {
      body.reuseHeaderMapping = reuse;
    }

    const json = await postOrderPipeline(body, init);

    if (!baseHeaders) {
      baseHeaders = json.baseHeaders;
      unknownHeaders = Array.isArray(json.unknownHeaders) ? [...json.unknownHeaders] : [];
      reuse = json._reuseHeaderMapping;
      if (!reuse || !Array.isArray(reuse.mappedBaseHeaders)) {
        throw new Error('Stage2 첫 청크 응답에 헤더 매핑 재사용 정보(_reuseHeaderMapping)가 없습니다.');
      }
    }

    mergedRows.push(...(json.rows ?? []));
    const completed = Math.floor(offset / ORDER_PIPELINE_ROW_CHUNK_SIZE) + 1;
    init?.onChunkProgress?.(completed, totalChunks);
  }

  return {
    baseHeaders: baseHeaders!,
    rows: mergedRows,
    unknownHeaders,
  };
}
