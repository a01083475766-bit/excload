'use client';

export type NormalizeQualityNoticeVariant =
  | 'heuristic'
  | 'network'
  | 'timeout'
  | 'convert_failed';

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

const NO_CHARGE_NOTE =
  '이번 시도는 사용량이 차감되지 않았습니다. 잠시 후 다시 시도해 주세요.';

/**
 * normalize-29 폴백(물류 등), 네트워크·타임아웃·변환 실패 안내.
 */
export function NormalizeQualityNoticeModal({
  isOpen,
  variant,
  onClose,
}: NormalizeQualityNoticeModalProps) {
  if (!isOpen) return null;

  const title =
    variant === 'network'
      ? '서버에 연결하지 못했습니다'
      : variant === 'timeout'
        ? '처리 시간이 초과되었습니다'
        : variant === 'convert_failed'
          ? '변환에 실패했습니다'
          : '변환 결과를 확인해 주세요';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="normalize-quality-notice-title"
    >
      <div
        className="w-full max-w-[480px] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="normalize-quality-notice-title"
          className="mb-3 text-lg font-semibold text-zinc-900"
        >
          {title}
        </h3>
        <div className="mb-6 space-y-3 text-sm leading-relaxed text-zinc-600">
          {variant === 'network' && (
            <>
              <p>
                인터넷 연결이 불안정하거나 일시적으로 서버에 닿지 못한 것 같습니다. 주문
                자동 정리는 안정적인 네트워크 연결이 필요합니다.
              </p>
              <p>
                Wi-Fi·데이터 상태를 확인하신 뒤, 연결이 원활할 때 한 번 더 시도해 주세요.
              </p>
              <p className="text-zinc-500">{NO_CHARGE_NOTE}</p>
            </>
          )}
          {variant === 'timeout' && (
            <>
              <p>
                주문 자동 정리에 예상보다 시간이 걸려 중단되었습니다. 입력 분량이 많거나
                서버·네트워크가 일시적으로 느릴 수 있습니다.
              </p>
              <p>
                줄바꿈·탭으로 주문을 나눠 붙이거나, 잠시 후 다시 시도해 보세요.
              </p>
              <p className="text-zinc-500">{NO_CHARGE_NOTE}</p>
            </>
          )}
          {variant === 'convert_failed' && (
            <>
              <p>
                자동 정리 결과를 불러오지 못했습니다. 입력 형식이나 서버 응답 문제일 수
                있습니다.
              </p>
              <p>
                원문을 줄 단위로 정리한 뒤 다시 변환해 보세요. 같은 문제가 반복되면
                고객센터로 문의해 주세요.
              </p>
              <p className="text-zinc-500">{NO_CHARGE_NOTE}</p>
            </>
          )}
          {variant === 'heuristic' && (
            <>
              <p>
                주문 정보가 여러 형식으로 섞여 있어, 일부 항목은 자동으로 정리되었을 수
                있습니다.
              </p>
              <p>
                <strong className="font-semibold text-zinc-800">미리보기에서 이름·전화·주소·상품</strong>이 맞는지 꼭 확인한 뒤
                다운로드해 주세요.
              </p>
              <p className="text-zinc-500">
                빠진 항목이 있으면 미리보기에서 직접 수정하거나, 줄바꿈·탭으로 정리한 뒤
                다시 변환해 보세요.
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          확인
        </button>
      </div>
    </div>
  );
}
