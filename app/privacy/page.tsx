export default function PrivacyPage() {
  return (
    <div className="max-w-[800px] mx-auto py-16 px-6">
      <h1 className="text-2xl font-bold mb-10 text-center">
        엑클로드(EXCLOAD) 개인정보처리방침
      </h1>

      <div className="text-sm leading-7 space-y-8 text-left text-zinc-800">
        <p>
          엑클로드(EXCLOAD)는 개인정보 보호법에 따라 이용자의 개인정보를 보호하고 이를 적법하게
          처리합니다.
        </p>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">1. 수집 항목</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>이메일 주소</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">2. 수집 목적</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원 가입 및 서비스 제공</li>
            <li>고객 문의 대응</li>
            <li>서비스 개선</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">3. 보유 및 이용 기간</h2>
          <p>회원 탈퇴 시까지 보관 후 즉시 삭제합니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">4. 개인정보 제공</h2>
          <p>회사는 이용자의 개인정보를 외부에 제공하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">5. 개인정보 처리 위탁</h2>
          <p>
            회사는 결제 처리 및 서비스 제공을 위해 외부 결제 서비스(예: Stripe, 토스페이먼츠 등)를
            이용할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">6. 이용자의 권리</h2>
          <p>이용자는 언제든지 자신의 개인정보를 조회하거나 삭제를 요청할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">7. 보안</h2>
          <p>회사는 개인정보 보호를 위해 기술적·관리적 조치를 시행합니다.</p>
        </section>
      </div>
    </div>
  );
}
