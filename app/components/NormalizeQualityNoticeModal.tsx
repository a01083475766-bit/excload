'use client';

export type NormalizeQualityNoticeVariant = 'heuristic' | 'network';

export function isLikelyClientNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg);
}

interface NormalizeQualityNoticeModalProps {
  isOpen: boolean;
  variant: NormalizeQualityNoticeVariant;
  onClose: () => void;
}

/**
 * normalize-29가 폴백(간단 규칙 등)으로 처리했거나,
 * 클라이언트에서 서버 호출이 네트워크 때문에 실패했을 때 안내합니다.
 */
export function NormalizeQualityNoticeModal({
  isOpen,
  variant,
  onClose,
}: NormalizeQualityNoticeModalProps) {
  if (!isOpen) return null;

  const isNetwork = variant === 'network';

  return (
    <div
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[10000] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="normalize-quality-notice-title"
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-[480px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="normalize-quality-notice-title"
          className={`text-lg font-semibold mb-3 ${isNetwork ? 'text-amber-900' : 'text-amber-900'}`}
        >
          {isNetwork ? '서버에 연결하지 못했습니다' : '변환 결과를 확인해 주세요'}
        </h3>
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed mb-6">
          {isNetwork ? (
            <>
              <p>
                인터넷 연결이 불안정하거나 일시적으로 서버에 닿지 못한 것 같습니다. 주문
                자동 정리는 안정적인 네트워크 연결이 필요합니다.
              </p>
              <p>
                잠시 후 Wi-Fi·데이터 상태를 확인하시고, 연결이 원활할 때 한 번 더 시도해
                주세요.
              </p>
            </>
          ) : (
            <>
              <p>
                주문 정보가 여러 형식으로 섞여 있어, 일부 항목은 자동으로 정리되었을 수
                있습니다.
              </p>
              <p>
                <strong>미리보기에서 이름·전화·주소·상품</strong>이 맞는지 꼭 확인한 뒤
                다운로드해 주세요.
              </p>
              <p className="text-gray-600">
                빠진 항목이 있으면 미리보기에서 직접 수정하거나, 줄바꿈·탭으로 정리한 뒤
                다시 변환해 보세요.
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white h-10 rounded-lg font-medium text-sm"
        >
          확인
        </button>
      </div>
    </div>
  );
}
