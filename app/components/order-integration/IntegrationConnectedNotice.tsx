import Link from 'next/link';

/**
 * 쇼핑몰 연결(테스트 성공) 안내 + 주문연동 이동.
 * 설정 저장만으로 이 컴포넌트를 쓰지 않는다 — 실제 API 연결 성공 안내 전용.
 */
export function IntegrationConnectedNotice({
  mallName,
  title,
  description,
}: {
  mallName?: string;
  title?: string;
  description?: string;
}) {
  return (
    <section className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
      <p className="text-sm font-semibold text-green-900 dark:text-green-100">
        {title ?? (mallName ? `${mallName} 연결이 완료되었습니다.` : '연결이 완료되었습니다.')}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-green-800 dark:text-green-200">
        {description ??
          '실제 주문 조회와 송장 처리는 주문연동 화면에서 진행할 수 있습니다.'}
      </p>
      <Link
        href="/order/integration"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
      >
        주문연동으로 이동
      </Link>
    </section>
  );
}
