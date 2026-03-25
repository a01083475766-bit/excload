export default function PrivacyPage() {
  return (
    <div className="max-w-[800px] mx-auto py-16 px-6">
      <h1 className="text-2xl font-bold mb-2 text-center">개인정보처리방침</h1>
      <p className="text-sm text-zinc-500 text-center mb-10">엑클로드(EXCLOAD)</p>

      <div className="text-sm leading-7 space-y-8 text-left text-zinc-800">
        <p className="text-zinc-800">
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
          <ul className="list-disc pl-5 space-y-1">
            <li>회원 탈퇴 시까지 보관 후 즉시 삭제</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">4. 개인정보 제공</h2>
          <p>회사는 이용자의 개인정보를 외부에 제공하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">5. 처리 위탁</h2>
          <p>회사는 서비스 제공을 위해 일부 업무를 외부에 위탁할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">6. 이용자의 권리</h2>
          <p>이용자는 언제든지 개인정보 조회 및 삭제를 요청할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">7. 보안</h2>
          <p>회사는 개인정보 보호를 위해 기술적/관리적 조치를 시행합니다.</p>
        </section>
      </div>
    </div>
  )
}
