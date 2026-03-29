/**
 * 주문 확인 모달
 * 주문 변환 확인 / 주문 정리 확인 / 주문 확인
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * ⚠️ AI 언급 금지 (UX에서 AI 단어 절대 노출 안 함)
 * 
 * 역할:
 * - 텍스트/이미지 입력이 정제된 후 사용자에게 확인 요청
 * - InternalOrderFormat을 받아서 사용자 친화적으로 표시
 * - 사용자가 수정하거나 주문목록에 추가할 수 있도록 함
 * 
 * 흐름:
 * Text/Image → AI 정제 → InternalOrderFormat → OrderConfirmModal → InternalToCleanInputMapper → CleanInputFile
 */

'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { InternalOrderFormat } from '@/app/lib/export/internalOrderFormat';

interface OrderConfirmModalProps {
  /** 정제된 주문 정보 (InternalOrderFormat) */
  internalOrder: InternalOrderFormat | null;
  /** 모달 열림/닫힘 상태 */
  isOpen: boolean;
  /** 모달 닫기 콜백 */
  onClose: () => void;
  /** 수정하기 버튼 클릭 콜백 (수정된 주문 데이터 전달) */
  onEdit: (editedOrder: InternalOrderFormat) => void;
  /** 주문목록에 추가 버튼 클릭 콜백 */
  onConfirm: () => void;
}

/**
 * 주문 확인 모달 컴포넌트
 * 
 * 텍스트/이미지 입력이 정제된 후 사용자에게 확인을 요청하는 모달입니다.
 * AI 언급 없이 "주문을 변환하였습니다" 또는 "주문을 이렇게 정리했습니다" 메시지를 표시합니다.
 * 
 * @example
 * ```tsx
 * <OrderConfirmModal
 *   internalOrder={internalOrder}
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   onEdit={() => handleEdit()}
 *   onConfirm={() => handleConfirm()}
 * />
 * ```
 */
export function OrderConfirmModal({
  internalOrder,
  isOpen,
  onClose,
  onEdit,
  onConfirm,
}: OrderConfirmModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedOrder, setEditedOrder] = useState<InternalOrderFormat | null>(null);

  // internalOrder가 변경될 때 editedOrder 초기화
  useEffect(() => {
    if (internalOrder) {
      setEditedOrder({ ...internalOrder });
      setIsEditing(false);
    }
  }, [internalOrder]);

  if (!isOpen || !internalOrder || !editedOrder) {
    return null;
  }

  // 편집 가능한 필드 정의 (기준헤더 전체 중 핵심·3PL 필드만 노출)
  // 기준헤더는 내부 구조지만, 여기서는 "한글 헤더 그대로"를 라벨로 사용한다.
  const editableFields = [
    {
      key: '받는사람' as keyof InternalOrderFormat,
      label: '받는사람',
      value: editedOrder.받는사람 || '',
      type: 'text' as const,
    },
    {
      key: '받는사람전화1' as keyof InternalOrderFormat,
      label: '받는사람전화1',
      value: editedOrder.받는사람전화1 || '',
      type: 'text' as const,
    },
    {
      key: '받는사람주소1' as keyof InternalOrderFormat,
      label: '받는사람주소1',
      value: editedOrder.받는사람주소1 || '',
      type: 'textarea' as const,
    },
    {
      key: '상품명' as keyof InternalOrderFormat,
      label: '상품명',
      value: editedOrder.상품명 || '',
      type: 'text' as const,
    },
    {
      key: '상품옵션' as keyof InternalOrderFormat,
      label: '상품옵션',
      value: editedOrder.상품옵션 || '',
      type: 'text' as const,
    },
    {
      key: '수량' as keyof InternalOrderFormat,
      label: '수량',
      value: editedOrder.수량 || '',
      type: 'number' as const,
    },
    {
      key: '배송메시지' as keyof InternalOrderFormat,
      label: '배송메시지',
      value: editedOrder.배송메시지 || '',
      type: 'textarea' as const,
    },
    {
      key: '상품코드' as keyof InternalOrderFormat,
      label: '상품코드',
      value: editedOrder.상품코드 || '',
      type: 'text' as const,
    },
    {
      key: '옵션코드' as keyof InternalOrderFormat,
      label: '옵션코드',
      value: editedOrder.옵션코드 || '',
      type: 'text' as const,
    },
    {
      key: '센터코드' as keyof InternalOrderFormat,
      label: '센터코드',
      value: editedOrder.센터코드 || '',
      type: 'text' as const,
    },
    {
      key: '박스수량' as keyof InternalOrderFormat,
      label: '박스수량',
      value: editedOrder.박스수량 || '',
      type: 'text' as const,
    },
    {
      key: '출고타입' as keyof InternalOrderFormat,
      label: '출고타입',
      value: editedOrder.출고타입 || '',
      type: 'text' as const,
    },
    {
      key: '출고요청일' as keyof InternalOrderFormat,
      label: '출고요청일',
      value: editedOrder.출고요청일 || '',
      type: 'text' as const,
    },
    {
      key: '주문ID' as keyof InternalOrderFormat,
      label: '주문ID',
      value: editedOrder.주문ID || '',
      type: 'text' as const,
    },
    {
      key: '출고지시사항' as keyof InternalOrderFormat,
      label: '출고지시사항',
      value: editedOrder.출고지시사항 || '',
      type: 'textarea' as const,
    },
    {
      key: '판매처' as keyof InternalOrderFormat,
      label: '판매처',
      value: editedOrder.판매처 || '',
      type: 'text' as const,
    },
  ];

  // 필드 값 업데이트 핸들러
  const handleFieldChange = (key: keyof InternalOrderFormat, value: string) => {
    if (!editedOrder) return;
    
    const updatedOrder = { ...editedOrder };

    // 현재 수량은 문자열 기준헤더 필드이므로 그대로 문자열로 저장한다.
    (updatedOrder[key] as string) = value;
    
    setEditedOrder(updatedOrder);
  };

  // 저장 핸들러
  const handleSave = () => {
    if (!editedOrder) return;
    setIsEditing(false);
    // 수정된 주문 정보를 반영하고 미리보기에 추가
    onEdit(editedOrder);
  };

  // 취소 핸들러
  const handleCancel = () => {
    if (internalOrder) {
      setEditedOrder({ ...internalOrder });
    }
    setIsEditing(false);
  };

  // 주문 요약 정보 추출 (빈 값은 표시하지 않음) - 편집 모드가 아닐 때만 필터링
  const orderSummary = isEditing
    ? editableFields
    : editableFields.filter((item) => {
        if (item.key === '수량') {
          const n = parseFloat(String(editedOrder.수량 || '').trim());
          return !Number.isNaN(n) && n > 0;
        }
        return item.value && item.value.trim() !== '';
      });

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[600px] flex flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            수정이 필요한 부분을 수정후 목록으로 추가하세요
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>

        {/* 주문 요약 표시 - 라벨:값 형식 또는 편집 모드 */}
        <div className="flex-1 overflow-y-auto mb-4">
          <div className="space-y-2">
            {orderSummary.length > 0 ? (
              orderSummary.map((item, index) => (
                <div
                  key={index}
                  className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {item.label} :
                    </span>
                    {isEditing ? (
                      item.type === 'textarea' ? (
                        <textarea
                          value={item.value}
                          onChange={(e) => handleFieldChange(item.key, e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={2}
                          placeholder={`${item.label}을(를) 입력하세요`}
                        />
                      ) : (
                        <input
                          type={item.type}
                          value={item.value}
                          onChange={(e) => handleFieldChange(item.key, e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={`${item.label}을(를) 입력하세요`}
                        />
                      )
                    ) : (
                      <span className="text-zinc-900 dark:text-zinc-100">
                        {item.value}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-center text-zinc-500 dark:text-zinc-400">
                주문 정보가 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 모달 하단 버튼 */}
        <div className="flex gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white font-medium transition-colors"
              >
                주문목록에 저장
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors font-medium"
              >
                수정하기
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white font-medium transition-colors"
              >
                주문목록에 추가
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
