export default function RefundPage() {
  return (
    <main className="mx-auto max-w-[800px] px-6 py-12 text-center">
      <h1 className="mb-8 text-3xl font-bold">환불 정책</h1>
      <div className="space-y-3 text-base leading-relaxed">
        <p>환불 정책</p>
        <p>1. 결제 후 7일 이내 환불 요청이 가능합니다.</p>
        <p>2. 서비스 이용 이력이 없는 경우 전액 환불 가능합니다.</p>
        <p>3. 서비스 이용 이력이 있는 경우 환불이 제한됩니다.</p>
        <p>
          4. 정기결제는 다음 결제일 이전 해지 가능하며, 이미 결제된 금액은 환불되지
          않습니다.
        </p>
        <p>5. 문의: sacom5766@naver.com</p>
      </div>
    </main>
  );
}
