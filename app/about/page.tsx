/**
 * 서비스 소개(설명 중심). 요금·결제 상세는 app/pricing/page.tsx 로 분리합니다.
 * ⚠️ EXCLOAD CONSTITUTION — 마케팅/안내 페이지는 파이프라인과 독립합니다.
 */
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="max-w-[900px] mx-auto py-20 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-6">
          주문 데이터를 자동으로 변환하는 EXCLOAD
        </h1>

        <p className="text-gray-600 mb-10">
          텍스트, 엑셀, 이미지 주문을 업로드하면
          택배사 및 3PL 업로드용 엑셀 파일로 자동 변환됩니다.
        </p>

        <div className="space-y-4 text-left max-w-xl mx-auto mb-16">
          <p>✔ 주문 데이터 자동 정리</p>
          <p>✔ 택배 업로드 파일 자동 생성</p>
          <p>✔ 3PL 물류 시스템 대응</p>
        </div>
      </div>

      <section className="mb-14 text-left border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 lg:p-8 bg-white dark:bg-zinc-900/50">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          서비스 이용 흐름
        </h2>
        <ol className="list-decimal pl-5 space-y-2 text-zinc-700 dark:text-zinc-300">
          <li>주문 입력 (텍스트 / 엑셀 / 이미지)</li>
          <li>자동 변환</li>
          <li>엑셀 다운로드</li>
        </ol>
      </section>

      <section className="text-left border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 lg:p-8 bg-white dark:bg-zinc-900/50">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          요금 안내 요약
        </h2>
        <p className="text-zinc-700 dark:text-zinc-300 mb-4">
          FREE, PRO, YEARLY 플랜이 있으며, 각 플랜별 제공 범위가 다릅니다.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          금액·혜택 등 상세 내용은 가격 페이지에서 확인해 주세요.
        </p>
        <Link
          href="/pricing"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 font-medium underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300"
        >
          가격 및 찾아보기
        </Link>
      </section>

      <section className="mt-10 text-left border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 lg:p-8 bg-white dark:bg-zinc-900/50">
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
          엑클로드는 구독형(SaaS) 서비스로, 정기결제를 통해 매월 사용량(이용 한도)을 제공받아 이용할 수 있습니다.
        </p>
      </section>
    </div>
  );
}
