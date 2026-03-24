'use client';

import DemoAnimation from '@/app/components/DemoAnimation';

export default function HomePage() {
    return (
    <div className="pt-6 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-7xl mx-auto px-6">
        {/* Hero 섹션 */}
        <section className="pt-4 pb-12 lg:pt-6 lg:pb-16">
          <div className="flex flex-col items-center text-center gap-4">
            {/* 첫 번째 줄 - 가장 넓게 */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-950 dark:text-zinc-100 leading-tight max-w-4xl">
              반복되는 주문 정리, 엑클로드에서 한 번에 끝내세요.
            </h1>

            {/* 두 번째 줄 - 중간 넓이 */}
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              카톡·상세페이지·엑셀 주문을 택배 업로드 양식으로 자동 변환합니다.
            </p>
            
            {/* 세 번째 줄 - 가장 좁게 */}
            <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-500 max-w-lg leading-relaxed">
              커피 한 잔을, 당신의 시간에 양보하세요.
            </p>
            
              
            {/* 데모 애니메이션 */}
            <div className="w-full mt-12">
              <DemoAnimation />
              </div>
          </div>
        </section>

        {/* 설명 텍스트 섹션 */}
        <section className="py-12 lg:py-16">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              주문 정리 때문에 스트레스 받으셨나요?
            </h2>
            <div className="space-y-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                카톡 주문을 엑셀로 옮기고, 엑셀을 다시 택배 양식에 맞게 수정하는 번거로운 작업, 이제 그만하세요.
              </p>
              <p>
                여러 경로로 들어온 주문을 자동 분석해 택배 업로드 파일로 한 번에 정리합니다.
              </p>
              <p className="text-zinc-700 dark:text-zinc-300">
                어렵지 않습니다. 몇 번의 클릭이면 충분합니다.
              </p>
            </div>
          </div>
        </section>

        {/* 가격 섹션 */}
        <section className="py-16 lg:py-24">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 프리 카드 */}
              <div className="p-8 rounded-xl border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg hover:shadow-xl transition-all">
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4 text-center">
                  프리
                      </h3>
            </div>

              {/* 유료 카드 */}
              <div className="p-8 rounded-xl border-2 border-blue-500 dark:border-blue-600 bg-white dark:bg-zinc-900 shadow-lg hover:shadow-xl transition-all">
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4 text-center">
                  유료
                </h3>
              </div>
                  </div>
          </div>
        </section>
      </main>
                        </div>
                      );
}
