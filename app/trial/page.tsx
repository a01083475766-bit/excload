import Link from 'next/link';

/** 체험판 전용 페이지 — 네비게이션에는 노출하지 않고 랜딩 등에서만 링크합니다. */
export default function TrialPage() {
  return (
    <div className="pt-6 bg-zinc-50 dark:bg-black min-h-[60vh]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">체험 모드</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-100">
          서비스 체험
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400 leading-relaxed">
          이 페이지는 랜딩의 &quot;체험하기&quot;를 통해서만 들어올 수 있습니다. 샘플 양식·포인트 한도·다운로드
          제한 등 체험 규칙은 이후 연결 예정입니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/excload"
            className="text-sm text-blue-600 hover:underline underline-offset-2"
          >
            ← 랜딩으로 돌아가기
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            회원가입
          </Link>
        </div>
      </main>
    </div>
  );
}
