'use client';

/**
 * UnifiedInputSection
 * 통합 주문 입력 섹션 / 텍스트 주문 변환 / 이미지 주문 변환
 *
 * ⚠️ CONSTITUTION.md v4.0 준수
 * ⚠️ Stage0/1/2/3 파일 직접 수정 금지
 * ⚠️ 이 컴포넌트는 입력 UX 전용 레이어 (어댑터 계층)
 *
 * 현재 단계:
 * - 텍스트 주문 변환 UI
 * - TextToCleanInputAdapter → InternalOrderFormat → OrderConfirmModal까지 연결
 * - 사용자가 주문을 확정하면:
 *   InternalToCleanInputMapper → ExtendedCleanInputFile → Stage2/Stage3 헬퍼 실행
 * - 주문변환 페이지와의 실제 연결은 이후 단계에서 props로 주입하여 사용할 예정
 */

import { useState, useRef } from 'react';
import { Search, Image as ImageIcon, Upload } from 'lucide-react';
import {
  convertTextToInternalOrder,
} from './adapters/TextToCleanInputAdapter';
import { extractTextFromImage } from './adapters/ImageToTextAdapter';
import type { InternalOrderFormat } from './adapters/types';
import { OrderConfirmModal } from './components/OrderConfirmModal';
import { mapInternalOrderToCleanInput } from './adapters/InternalToCleanInputMapper';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import type { UnifiedInputPipelineResult } from './adapters/runUnifiedInputOrderPipelines';
import { runUnifiedInputOrderPipelines } from './adapters/runUnifiedInputOrderPipelines';

interface UnifiedInputSectionProps {
  /** 현재 선택된 템플릿 브릿지 파일 (없으면 Stage3는 실행하지 않음) */
  templateBridgeFile?: TemplateBridgeFile | null;
  /** 고정 입력 값 (택배사 헤더 기준) */
  fixedHeaderValues?: Record<string, string>;
  /** Stage2/Stage3 실행 결과를 상위에서 받고 싶을 때 사용하는 콜백 (선택) */
  onPipelinesCompleted?: (result: UnifiedInputPipelineResult) => void;
}

export function UnifiedInputSection({
  templateBridgeFile = null,
  fixedHeaderValues = {},
  onPipelinesCompleted,
}: UnifiedInputSectionProps) {
  const [textInput, setTextInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [internalOrder, setInternalOrder] = useState<InternalOrderFormat | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [modalSourceType, setModalSourceType] = useState<'text' | 'image'>('text');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextConvert = async () => {
    setErrorMessage(null);

    const trimmed = textInput.trim();
    if (!trimmed) {
      setErrorMessage('변환할 텍스트를 입력해 주세요.');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await convertTextToInternalOrder(trimmed);
      if (result.internalOrder) {
        setInternalOrder(result.internalOrder);
        setModalSourceType('text');
        setIsConfirmModalOpen(true);
      } else {
        setErrorMessage('텍스트 주문 변환에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('[UnifiedInputSection] 텍스트 주문 변환 중 오류:', error);
      setErrorMessage(
        error instanceof Error ? error.message : '텍스트를 변환하는 중 알 수 없는 오류가 발생했습니다.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 이미지 파일 타입 검증
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validImageTypes.includes(file.type)) {
      setErrorMessage(`지원하지 않는 이미지 형식입니다. (${file.type})`);
      return;
    }

    setSelectedImage(file);
    setErrorMessage(null);

    // 이미지 미리보기 생성
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageConvert = async () => {
    if (!selectedImage) {
      setErrorMessage('변환할 이미지를 선택해 주세요.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const ocrText = await extractTextFromImage(selectedImage);
      const trimmedOcr = ocrText.trim();
      if (!trimmedOcr) {
        setErrorMessage('이미지에서 텍스트를 읽지 못했습니다. 다른 이미지로 시도해 주세요.');
        return;
      }
      const result = await convertTextToInternalOrder(trimmedOcr);
      if (result.internalOrder) {
        setInternalOrder(result.internalOrder);
        setModalSourceType('image');
        setIsConfirmModalOpen(true);
      } else {
        setErrorMessage('이미지 주문 변환에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('[UnifiedInputSection] 이미지 주문 변환 중 오류:', error);
      setErrorMessage(
        error instanceof Error ? error.message : '이미지를 변환하는 중 알 수 없는 오류가 발생했습니다.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="w-full bg-gray-200 border border-gray-300 rounded-xl p-6 transition-colors overflow-hidden flex flex-col">
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-gray-600" />
          <h2 className="text-base font-semibold text-gray-900">
            통합 주문 입력 (텍스트/이미지)
          </h2>
        </div>

        {/* 텍스트 입력 섹션 */}
        <div className="space-y-2">
          <p className="text-sm text-gray-600 leading-relaxed">
            카카오톡·문자·메모장 등에서 받은 주문 내용을 붙여넣거나, 이미지를 업로드하면
            <br />
            주문 정보를 한 번에 정리해 주문목록으로 보낼 수 있습니다.
          </p>

          <textarea
            className="w-full h-32 rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            placeholder={
              '예) 받는 사람: 홍길동\n' +
              '전화번호: 010-1234-5678\n' +
              '주소: 서울시 강남구 테헤란로 123\n' +
              '상품명: 무선 블랙 마우스 / 수량: 2개\n' +
              '요청사항: 부재 시 문 앞에 놓아주세요'
            }
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isProcessing}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
              onClick={handleTextConvert}
              disabled={isProcessing || !textInput.trim()}
            >
              {isProcessing ? '변환 중...' : '텍스트 주문 변환'}
            </button>
          </div>
        </div>

        {/* 이미지 입력 섹션 */}
        <div className="space-y-2 border-t border-gray-300 pt-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-gray-600" />
            <p className="text-sm text-gray-600">이미지로 주문 변환</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            onChange={handleImageSelect}
            className="hidden"
            disabled={isProcessing}
          />

          {imagePreview ? (
            <div className="space-y-2">
              <img
                src={imagePreview}
                alt="미리보기"
                className="w-full max-h-32 object-contain rounded-lg border border-gray-300 bg-gray-50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                  onClick={() => {
                    setSelectedImage(null);
                    setImagePreview(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  disabled={isProcessing}
                >
                  이미지 제거
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors disabled:bg-green-300 disabled:cursor-not-allowed"
                  onClick={handleImageConvert}
                  disabled={isProcessing}
                >
                  {isProcessing ? '변환 중...' : '이미지 주문 변환'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Upload className="w-4 h-4" />
              이미지 파일 선택 (JPG, PNG, GIF, WEBP)
            </button>
          )}
        </div>

        {errorMessage && (
          <p className="mt-1 text-xs text-red-600">
            {errorMessage}
          </p>
        )}

        <p className="mt-1 text-[11px] text-gray-500">
          변환 결과는 주문 확인 모달에서 한 번 더 확인하신 후 주문 목록으로 보낼 수 있습니다.
        </p>

        {successMessage && (
          <p className="mt-1 text-xs text-green-600">
            {successMessage}
          </p>
        )}
      </div>

      <OrderConfirmModal
        internalOrder={internalOrder}
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onEdit={(editedOrder) => {
          // 모달 내에서 수정된 주문 데이터를 받아서 internalOrder 업데이트
          setInternalOrder(editedOrder);
          // 편집 모드는 모달 내부에서 관리되므로 여기서는 모달을 닫지 않음
        }}
        onConfirm={async () => {
          if (!internalOrder) {
            setIsConfirmModalOpen(false);
            return;
          }

          try {
            setIsProcessing(true);
            setErrorMessage(null);

            // 1) InternalOrderFormat → ExtendedCleanInputFile 변환
            const cleanInputFile = mapInternalOrderToCleanInput(
              internalOrder,
              modalSourceType
            );

            // 2) Stage2 + Stage3 실행 (템플릿/고정입력이 없으면 Stage2까지만 실행)
            const fileSessionId =
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : undefined;

            const pipelineResult = await runUnifiedInputOrderPipelines({
              cleanInputFile,
              templateBridgeFile,
              fixedHeaderValues,
              fileSessionId,
            });

            if (onPipelinesCompleted) {
              onPipelinesCompleted(pipelineResult);
            }

            setSuccessMessage('주문이 변환되었습니다. 미리보기/다운로드 영역에서 확인할 수 있습니다.');
          } catch (error) {
            console.error('[UnifiedInputSection] Stage2/Stage3 실행 중 오류:', error);
            setErrorMessage(
              error instanceof Error
                ? error.message
                : '주문을 변환하는 중 알 수 없는 오류가 발생했습니다.'
            );
          } finally {
            setIsProcessing(false);
            setIsConfirmModalOpen(false);
          }
        }}
      />
    </section>
  );
}

