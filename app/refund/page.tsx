export default function RefundPage() {
  return (
    <main className="mx-auto max-w-[800px] px-6 py-16">
      <h1 className="mb-10 text-center text-2xl font-bold">
        엑클로드(EXCLOAD) 환불 정책
      </h1>

      <div className="space-y-8 text-left text-sm leading-7 text-zinc-800">
        <p>엑클로드(EXCLOAD)는 다음과 같은 기준으로 환불을 제공합니다.</p>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-900">1. 환불 가능 기간</h2>
          <p>결제일로부터 7일 이내 환불 요청이 가능합니다.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-900">2. 전액 환불 조건</h2>
          <p className="mb-2">다음 조건을 모두 만족할 경우 전액 환불이 가능합니다.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>서비스 이용 이력이 없는 경우</li>
            <li>포인트 사용 내역이 없는 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-900">3. 부분 환불</h2>
          <p>
            서비스 이용 이력이 있는 경우, 사용량을 제외한 금액만 환불될 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-900">4. 정기결제</h2>
          <p className="mb-2">
            정기결제는 이용자가 해지하지 않는 한 자동으로 갱신됩니다.
          </p>
          <p className="mb-2">
            이용자는 언제든지 마이페이지에서 해지할 수 있으며, 해지 시 다음 결제일부터 자동결제가
            중단됩니다.
          </p>
          <p>
            이미 서비스 이용이 발생한 결제 건은 사용량에 따라 환불이 제한될 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-900">5. 환불 방법</h2>
          <p>환불은 결제 수단(카드 등)을 통해 동일하게 처리됩니다.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-900">6. 문의</h2>
          <p>
            이메일:{' '}
            <a
              href="mailto:sacom5766@naver.com"
              className="text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              sacom5766@naver.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
