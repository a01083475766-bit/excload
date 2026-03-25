'use client'

export default function SubscribePage() {
  return (
    <div className="max-w-[600px] mx-auto py-20 text-center">
      <h1 className="text-2xl font-bold mb-6">결제 진행</h1>

      <p className="mb-6 text-gray-600">
        현재 결제 시스템을 준비 중입니다.
        정식 오픈 시 정상적으로 결제가 가능합니다.
      </p>

      <div className="border rounded-lg p-6">
        <p className="mb-4 font-semibold">선택한 플랜</p>
        <p className="text-lg mb-6">PRO 플랜 (월 4,000원)</p>

        <button className="w-full bg-blue-600 text-white py-3 rounded-lg">
          결제 진행하기 (준비중)
        </button>
      </div>
    </div>
  )
}
