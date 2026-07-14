const features = [
  {
    number: "01",
    title: "카톡 주문 자동 정리",
    flow: ["카톡 대화", "이름·전화·주소·상품·수량 구분", "택배 엑셀"],
    description: "자유롭게 작성된 주문 메시지를 택배 업무에 필요한 항목으로 정리하는 기능입니다.",
    status: "베타 준비 중",
  },
  {
    number: "02",
    title: "여러 쇼핑몰 주문파일 통합",
    flow: ["서로 다른 쇼핑몰 주문파일", "열 이름과 순서 정리", "하나의 통합 주문양식"],
    description: "판매처마다 다른 주문파일을 하나의 기준으로 정리하는 기능입니다.",
    status: "개발 중",
  },
  {
    number: "03",
    title: "쇼핑몰 주문 한 번에 조회",
    flow: ["판매처마다 접속", "연결된 주문 확인", "한 화면에서 조회"],
    description: "여러 판매처의 신규 주문을 한곳에서 확인할 수 있도록 준비하고 있습니다.",
    status: "개발 중",
  },
  {
    number: "04",
    title: "송장번호 자동 매칭·전송",
    flow: ["택배사 송장파일 + 쇼핑몰 주문", "송장번호 자동 매칭", "사용자 확인 후 전송"],
    description: "송장번호를 주문과 연결하고, 확인된 결과를 판매처에 전달하는 기능입니다.",
    status: "설계 중",
  },
];

export function FeatureRoadmap() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold text-brand-800">준비 중인 기능</p>
        <h2 className="mt-3 text-3xl font-bold leading-tight text-ink-950">판매자의 반복 업무를 줄이는 기능을 준비하고 있습니다.</h2>
      </div>
      <div className="mt-10 divide-y divide-line border-y border-line bg-white">
        {features.map((feature) => (
          <article className="grid gap-6 px-4 py-7 md:grid-cols-[120px_minmax(0,1fr)] lg:grid-cols-[140px_minmax(360px,1fr)_minmax(300px,0.9fr)] md:px-6" key={feature.title}>
            <div>
              <p className="text-sm font-bold text-brand-800">{feature.number}</p>
              <span className="mt-4 inline-flex border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink-700">{feature.status}</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-ink-950">{feature.title}</h3>
              <p className="mt-3 max-w-2xl text-base leading-7 text-ink-700">{feature.description}</p>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {feature.flow.map((step) => (
                <li className="border-l-2 border-brand-700 bg-paper px-4 py-3 text-sm leading-6 text-ink-850" key={step}>
                  {step}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
