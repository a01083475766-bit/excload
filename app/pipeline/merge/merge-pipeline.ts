/**
 * EXCLOAD Merge Pipeline - 메인 파이프라인
 * 
 * ⚠️ CONSTITUTION.md v4.1 준수
 * Stage3 Merge Pipeline 전용
 * 
 * 목적: TemplateBridgeFile + OrderStandardFile + FixedInput → PreviewRows 생성
 * 
 * 금지사항:
 * - UI 로직 포함 금지
 * - 컬럼숨김 로직 포함 금지
 * - 다운로드 로직 포함 금지
 * - 기준헤더를 PreviewRow에 포함 금지
 * - 데이터 변형 외 다른 로직 금지
 */

import type { TemplateBridgeFile } from '../template/types';
import type { OrderStandardFile } from '../order/order-pipeline';
import type { PreviewRow, MergePipelineResult, RunMergePipelineParams } from './types';
import { applyFillOnly } from './apply-fill-only';
import { sanitizeDeliveryMessage } from './sanitize-delivery-message';
import { validateMergeInputs, validatePreviewRow, logValidationResult, throwIfInvalid } from '../utils/validation';
import { mergeOrderAndInvoiceStandardFiles } from '../invoice/merge-order-invoice-standard';

/**
 * Merge Pipeline을 실행합니다.
 * 
 * 1. 입력 검증 (courierHeaders.length === mappedBaseHeaders.length)
 * 2. rows 반복하여 PreviewRow 생성
 * 3. PreviewRow 배열 반환
 * 
 * @param params - Stage3 실행 파라미터
 * @returns MergePipelineResult
 * 
 * @example
 * ```typescript
 * const result = await runMergePipeline({
 *   template: bridgeFile,
 *   orderData: orderFile,
 *   fixedInput,
 *   invoiceData: invoiceFile,
 * });
 * // result.courierHeaders: 택배사 헤더 배열
 * // result.previewRows: 미리보기 행 데이터 배열
 * ```
 */
export async function runMergePipeline({
  template,
  orderData,
  fixedInput,
  invoiceData,
}: RunMergePipelineParams): Promise<MergePipelineResult> {
  // Stage 경계 고정:
  // - Stage2: 파일별 표준화까지만 수행
  // - Stage3: 주문/송장 병합 + 템플릿 매핑을 단일 책임으로 처리
  const stage3Source = invoiceData
    ? mergeOrderAndInvoiceStandardFiles(orderData, invoiceData)
    : orderData;

  // 0. 입력 통합 검증 체크포인트
  const inputValidation = validateMergeInputs(template, stage3Source, fixedInput);
  logValidationResult(inputValidation, 'Stage3 Merge Pipeline - Input');
  throwIfInvalid(inputValidation, 'Stage3 Merge Pipeline - Input');
  
  const { courierHeaders, mappedBaseHeaders } = template;
  
  // STEP 1. 입력 검증
  if (courierHeaders.length !== mappedBaseHeaders.length) {
    throw new Error(
      `[Stage3] 입력 검증 실패: courierHeaders.length (${courierHeaders.length}) !== mappedBaseHeaders.length (${mappedBaseHeaders.length})`
    );
  }
  
  // STEP 2. rows 반복하여 PreviewRow 생성
  const previewRows: PreviewRow[] = [];
  
  for (let rowIndex = 0; rowIndex < stage3Source.rows.length; rowIndex++) {
    const standardRow = stage3Source.rows[rowIndex];
    const previewRow: PreviewRow = {};
    
    // courierHeaders 순서대로 반복
    for (let i = 0; i < courierHeaders.length; i++) {
      const courierHeader = courierHeaders[i];
      const baseHeader = mappedBaseHeaders[i];
      
      // baseHeader가 매핑된 경우 표준값 가져오기
      let orderValue = '';
      if (baseHeader && baseHeader in standardRow) {
        orderValue = String(standardRow[baseHeader] || '').trim();
      }
      
      // FixedInput에서 고정값 가져오기 (courierHeader를 키로 사용)
      const fixedValue = String(fixedInput[courierHeader] || '').trim();
      
      // Fill Only 원칙 적용
      let finalValue = applyFillOnly(orderValue, fixedValue);

      // 원본(Stage2)은 보존하고, 택배 업로드용 Stage3 배송메시지만 보수 정제(v1) 적용
      if (baseHeader === '배송메시지' && finalValue) {
        finalValue = sanitizeDeliveryMessage(finalValue);
      }
      
      // PreviewRow에 추가 (courierHeader 기준)
      previewRow[courierHeader] = finalValue;
    }
    
    // 각 PreviewRow 검증 (첫 번째 행만 상세 검증)
    if (rowIndex === 0) {
      // validation은 courierHeaders를 기준으로 수행하되, mappedBaseHeaders[i] !== null인 경우에만 검사
      const rowValidation = validatePreviewRow(previewRow, courierHeaders, mappedBaseHeaders);
      if (!rowValidation.isValid || rowValidation.warnings.length > 0) {
        logValidationResult(rowValidation, `Stage3 Merge Pipeline - PreviewRow[${rowIndex}]`);
      }
    }
    
    previewRows.push(previewRow);
  }
  
  // STEP 3. 출력 검증 체크포인트
  if (previewRows.length > 0) {
    // validation은 courierHeaders를 기준으로 수행하되, mappedBaseHeaders[i] !== null인 경우에만 검사
    const firstRowValidation = validatePreviewRow(previewRows[0], courierHeaders, mappedBaseHeaders);
    logValidationResult(firstRowValidation, 'Stage3 Merge Pipeline - Output (First Row)');
    if (!firstRowValidation.isValid) {
      throwIfInvalid(firstRowValidation, 'Stage3 Merge Pipeline - Output');
    }
  }
  
  // STEP 4. 반환
  return {
    courierHeaders,
    previewRows,
  };
}
