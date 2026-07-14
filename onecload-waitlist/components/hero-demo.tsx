export function HeroDemo() {
  return (
    <section className="border-y border-line bg-white/80 py-16 md:py-20" aria-label="카카오톡 주문 자동 정리 시연">
      <div className="mx-auto max-w-[88rem] px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-brand-800">가장 먼저 준비하고 있는 기능</p>
          <h2 className="mt-3 keep-all text-3xl font-semibold leading-tight text-ink-950 sm:text-4xl">
            카톡 주문 내용을 붙여넣으면,
            <br className="hidden sm:block" />
            택배 엑셀 한 행으로
          </h2>
          <p className="mt-5 keep-all text-base leading-7 text-ink-700 sm:text-lg">
            카카오톡에서 받은 주문 내용을 복사해 붙여넣으면 받는 사람, 연락처, 주소, 상품, 수량과 요청사항을 구분해 정리합니다.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-[84rem] min-w-0 gap-3 lg:grid-cols-[30fr_36px_70fr] lg:items-center">
          <section className="min-w-0 border border-line bg-paper p-4">
            <p className="mb-3 text-xs font-bold tracking-[0.12em] text-brand-800">01 · 카톡 주문 내용 붙여넣기</p>
            <div className="whitespace-pre-line border-l-2 border-brand-700 bg-white px-3 py-3 text-[15px] leading-7 text-ink-850">
              {`안녕하세요.
참치 선물세트 2개 부탁드립니다.

받는 분 김민수
010-1234-5678
서울시 마포구 월드컵로 00, 101동 1203호

문 앞에 놓아주세요.`}
            </div>
          </section>

          <div className="flex min-w-0 items-center justify-center py-1 text-brand-700 lg:h-full" aria-hidden="true">
            <svg className="hidden h-5 w-9 lg:block" viewBox="0 0 36 20" fill="none">
              <path d="M3 10H30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M25 5L31 10L25 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <svg className="h-10 w-5 lg:hidden" viewBox="0 0 20 40" fill="none">
              <path d="M10 4V31" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M5 26L10 32L15 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <section className="min-w-0 border border-line bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold tracking-[0.12em] text-brand-800">02 · 택배 엑셀 한 행 완성</p>
              <p className="text-xs text-ink-500">이름, 전화번호, 주소는 가상 정보입니다.</p>
            </div>
            <div className="max-w-full overflow-x-auto lg:overflow-x-visible">
              <table className="w-full min-w-[620px] table-fixed border-collapse text-left text-[15px] lg:min-w-0">
                <colgroup>
                  <col className="w-[12%]" />
                  <col className="w-[17%]" />
                  <col className="w-[34%]" />
                  <col className="w-[15%]" />
                  <col className="w-[7%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead>
                  <tr className="bg-stone-100 text-ink-500">
                    {["받는 사람", "연락처", "주소", "상품명", "수량", "배송메모"].map((head) => (
                      <th className="border border-line px-4 py-3 font-semibold" key={head}>
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-ink-850">
                    {["김민수", "010-1234-5678", "서울시 마포구 월드컵로 00, 101동 1203호", "참치 선물세트", "2", "문 앞에 놓아주세요"].map((cell) => (
                      <td className="break-words border border-line px-4 py-3" key={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
