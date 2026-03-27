export default function TermsPage() {
  return (
    <div className="max-w-[800px] mx-auto py-16 px-6">
      <h1 className="text-2xl font-bold mb-10 text-center">
        엑클로드(EXCLOAD) 서비스 이용약관
      </h1>

      <div className="text-sm leading-7 space-y-8 text-left text-zinc-800">
        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제1조 (목적)</h2>
          <p>
            본 약관은 엑클로드(EXCLOAD)(이하 &quot;회사&quot;)가 제공하는 주문 데이터 변환 서비스(이하
            &quot;서비스&quot;)의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을
            목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제2조 (서비스의 내용)</h2>
          <p>
            회사는 이용자가 입력한 텍스트, 엑셀, 이미지 등의 주문 데이터를 택배사 및 물류 업로드용
            파일로 변환하는 서비스를 제공합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제3조 (서비스 이용)</h2>
          <p className="mb-2">이용자는 본 약관에 동의한 후 서비스를 이용할 수 있습니다.</p>
          <p>
            서비스는 정상적인 방법으로만 이용해야 하며, 비정상적인 이용 시 서비스 이용이 제한될 수
            있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제4조 (서비스 제공 및 변경)</h2>
          <p className="mb-2">회사는 안정적인 서비스 제공을 위해 노력합니다.</p>
          <p>서비스의 일부 기능은 사전 공지 없이 변경될 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제5조 (유료 서비스 및 결제)</h2>
          <p className="mb-2">회사는 신용카드 등 결제수단을 통해 유료 서비스를 제공합니다.</p>
          <p className="mb-2">유료 서비스는 결제 완료 후 즉시 이용 가능합니다.</p>
          <p>
            정기결제는 월 단위 또는 연 단위로 자동 갱신되며, 이용자가 해지하지 않는 한 자동으로
            연장됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제6조 (정기결제 해지)</h2>
          <p className="mb-2">이용자는 언제든지 마이페이지에서 정기결제를 해지할 수 있습니다.</p>
          <p>해지 시 다음 결제일부터 자동결제가 중단됩니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제7조 (이용자의 책임)</h2>
          <p className="mb-2">이용자가 입력한 데이터에 대한 책임은 이용자에게 있습니다.</p>
          <p>회사는 입력 데이터의 정확성을 보장하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제8조 (서비스 제한)</h2>
          <p className="mb-2">회사는 다음과 같은 경우 서비스 이용을 제한할 수 있습니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>서비스 운영을 방해하는 행위</li>
            <li>비정상적인 사용 또는 시스템 악용</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제9조 (면책)</h2>
          <p className="mb-2">회사는 다음에 대해 책임을 지지 않습니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>이용자가 입력한 데이터 오류</li>
            <li>서비스 이용 중 발생한 간접적 손해</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">제10조 (준거법)</h2>
          <p>본 약관은 대한민국 법률을 따릅니다.</p>
        </section>
      </div>
    </div>
  );
}
