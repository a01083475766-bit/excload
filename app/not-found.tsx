import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[800px] flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold text-zinc-900">페이지를 찾을 수 없습니다</h1>
      <p className="mb-8 text-sm text-zinc-600">
        주소가 잘못되었거나 페이지가 이동되었을 수 있습니다.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/excload"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          홈으로 이동
        </Link>
        <Link
          href="/contact"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          고객문의
        </Link>
      </div>
    </main>
  );
}
