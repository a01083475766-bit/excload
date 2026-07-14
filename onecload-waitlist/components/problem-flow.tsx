const problems = [
  "카톡으로 받은 주문을 엑셀에 다시 입력합니다.",
  "쇼핑몰마다 서로 다른 주문파일을 다운로드합니다.",
  "판매처별 주문을 각각 접속해서 확인합니다.",
  "송장번호를 주문과 직접 비교해 입력합니다.",
];

export function ProblemFlow() {
  return (
    <section className="bg-paper py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-800">반복되는 주문 업무</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight text-ink-950">주문이 늘수록 반복 작업도 함께 늘어납니다.</h2>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-4">
          {problems.map((problem, index) => (
            <li className="border-l-2 border-brand-700 bg-white px-5 py-6" key={problem}>
              <span className="text-sm font-bold text-brand-800">{String(index + 1).padStart(2, "0")}</span>
              <p className="mt-4 text-base leading-7 text-ink-850">{problem}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
