import { FileSpreadsheet } from 'lucide-react';

export default function Home() {
  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black">
      <main className="max-w-5xl mx-auto px-6">
        {/* Hero 섹션 - 세로 흐름 구조 */}
        <section className="pt-7 pb-[0.875rem]">
          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 서비스 설명 텍스트 영역 */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400">
                Smart Order Management
              </p>
              <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-950 dark:text-zinc-100 leading-tight">
                여러 주문을 한 번에 정리해보세요
              </h1>
              <p className="text-base text-zinc-600 dark:text-zinc-500 leading-loose whitespace-pre-line">
                여러 곳에서 들어오는 주문을 하나씩 정리하느라 답답하셨다면,{'\n'}이제 그 과정을 훨씬 편하게 바꿔보세요.
              </p>
            </div>

            {/* 데모 영상 placeholder 영역 - 하단 */}
            <div className="w-full h-[120px] rounded-3xl border border-blue-200 dark:border-blue-800 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-zinc-900 flex items-center justify-center p-6">
              <p className="text-zinc-400 dark:text-zinc-500 text-lg font-medium">
                Demo Video Area
              </p>
            </div>
          </div>
        </section>

        {/* 기능 설명 섹션 */}
        <section className="pt-2 pb-8 lg:pt-3 lg:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 lg:gap-3">
            {/* 카드 1 */}
            <div className="h-[120px] p-5 rounded-xl border bg-slate-100 dark:bg-zinc-900 border-blue-100 dark:border-blue-900 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-center">
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-600">
                  <FileSpreadsheet className="w-[18px] h-[18px] text-white/90" />
                </div>
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  엑셀 파일 자동 처리
                </h3>
              </div>

              {/* 설명 */}
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                복잡한 엑셀 파일 속 주문 정보를 자동으로 읽고 깔끔하게 정리해드립니다.
              </p>
            </div>

            {/* 카드 2 */}
            <div className="h-[120px] p-5 rounded-xl border bg-amber-100 dark:bg-zinc-900 border-blue-100 dark:border-blue-900 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-center">
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-600">
                  <svg className="w-[18px] h-[18px] text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  카카오톡 메시지 분석
                </h3>
              </div>

              {/* 설명 */}
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                카카오톡으로 받은 주문을{'\n'}붙여넣기만 하면 바로 정리됩니다.
              </p>
            </div>

            {/* 카드 3 */}
            <div className="h-[120px] bg-emerald-100 dark:bg-zinc-900 rounded-2xl border border-blue-100 dark:border-blue-900 p-3 lg:p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-center">
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-600">
                  <svg className="w-[18px] h-[18px] text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  정확한 데이터 정제
                </h3>
              </div>

              {/* 설명 */}
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                주문 정보의 오류를{'\n'}한 번 더 확인해{'\n'}정확한 데이터로 정리해드립니다.
              </p>
            </div>

            {/* 카드 4 */}
            <div className="h-[120px] p-5 rounded-xl border bg-indigo-100 dark:bg-zinc-900 border-blue-100 dark:border-blue-900 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-center">
              {/* 아이콘 + 타이틀 */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-600">
                  <svg className="w-[18px] h-[18px] text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  빠른 처리 속도
                </h3>
              </div>

              {/* 설명 */}
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                반복 작업을 줄이고{'\n'}처리 시간을 절약하고{'\n'}효율성을 높이세요
              </p>
            </div>
          </div>
        </section>

        {/* CTA 섹션 - 최상단 */}
        <section className="pt-3 pb-6 lg:pt-4 lg:pb-8">
          <div className="flex flex-col items-center text-center gap-4">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-950 dark:text-zinc-100 whitespace-pre-line">
              반복되는 주문 정리, 엑클로드에서 한 번에 끝내세요.
            </h2>
            <p className="text-base sm:text-lg text-zinc-700 dark:text-zinc-400">
              카톡·상세페이지·엑셀 주문을 택배 업로드 양식으로 자동 변환합니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mt-2">
              <button className="px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                무료로 시작하기
              </button>
              <button className="px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                데모 보기
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
