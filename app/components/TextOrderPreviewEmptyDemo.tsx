'use client';

/**
 * 주문·물류 텍스트 입력란 공통 자연어 예시 (라벨 없이 붙여넣기 가능함을 전제)
 */
export const TEXT_ORDER_NATURAL_PLACEHOLDER =
  '예) 홍길동 010-1234-5766   무선마우스 2개\n' +
  '서울시 강남구 테헤란로 123  문앞에 놓아주세요';

type Props = { variant: 'order' | 'logistics' };

/** 변환 전 미리보기가 비었을 때, 홍길동 예시가 엑셀처럼 정리되는 모습을 안내 */
export function TextOrderPreviewEmptyDemo({ variant }: Props) {
  const headers = ['받는사람', '전화번호', '주소', '상품명', '수량', '요청사항'] as const;
  const values = [
    '홍길동',
    '010-1234-5678',
    '서울시 강남구 테헤란로 123',
    '무선마우스',
    '2',
    '문앞에두세요',
  ] as const;
  const logisticsExtra = ['상품코드', '출고요청일'] as const;

  return (
    <div className="w-full px-6 pb-6">
      <p className="text-xs text-gray-600 mb-3 leading-relaxed">
        아래는 위와 같은 문장을 변환했을 때 미리보기에 엑셀처럼 정리되는 예시입니다.
      </p>
      <div className="overflow-x-auto rounded-md border border-gray-300 bg-white shadow-sm">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              {headers.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border border-gray-300 px-2 py-2 text-left font-semibold text-gray-800"
                >
                  {h}
                </th>
              ))}
              {variant === 'logistics' &&
                logisticsExtra.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border border-gray-300 bg-emerald-50 px-2 py-2 text-left font-semibold text-emerald-900"
                  >
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {values.map((v, i) => (
                <td key={i} className="border border-gray-300 px-2 py-2 text-gray-900">
                  {v}
                </td>
              ))}
              {variant === 'logistics' && (
                <>
                  <td className="border border-gray-300 bg-emerald-50/40 px-2 py-2 text-center text-gray-400">
                    —
                  </td>
                  <td className="border border-gray-300 bg-emerald-50/40 px-2 py-2 text-center text-gray-400">
                    —
                  </td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>
      {variant === 'logistics' && (
        <p className="mt-2 text-xs text-gray-500">
          물류 전용 열(상품코드·출고요청일 등)은 원문에 항목명이 붙어 있을 때만 채워집니다.
        </p>
      )}
    </div>
  );
}
