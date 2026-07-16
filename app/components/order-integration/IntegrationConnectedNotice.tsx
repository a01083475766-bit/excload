import Link from 'next/link';

/**
 * 쇼핑몰 연결(저장) 완료 안내 + 주문연동 이동.
 * 설정 화면에서는 주문 조회·수집을 실행하지 않고, 실제 조회·송장 처리는 주문연동 화면으로 안내한다.
 */
export function IntegrationConnectedNotice({ mallName }: { mallName?: string }) {
  return (
    <section className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
      <p className="text-sm font-semibold text-green-900 dark:text-green-100">
        {mallName ? `${mallName} 연결이 완료되었습니다.` : '연결이 완료되었습니다.'}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-green-800 dark:text-green-200">
        실제 주문 조회와 송장 처리는 주문연동 화면에서 진행할 수 있습니다.
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
