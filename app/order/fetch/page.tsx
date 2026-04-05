"use client";

import { useRouter } from "next/navigation";

export default function OrderFetchPage() {
  const router = useRouter();

  // 더미 데이터
  const orders = [
    { id: "1001", name: "홍길동", phone: "010-1111-2222" },
    { id: "1002", name: "김철수", phone: "010-3333-4444" },
    { id: "1003", name: "이영희", phone: "010-5555-6666" },
  ];

  return (
    <div className="p-6 max-w-xl mx-auto">

      {/* 제목 */}
      <h1 className="text-xl font-bold mb-4">주문 가져오기</h1>

      {/* 결과 요약 */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
        <p className="text-green-700 font-semibold">
          +10건 추가되었습니다
        </p>
        <p className="text-sm text-green-600">
          총 110건의 주문이 있습니다
        </p>
      </div>

      {/* 리스트 */}
      <div className="space-y-3 mb-6">
        {orders.map((order) => (
          <div
            key={order.id}
            className="border rounded-xl p-4 flex justify-between"
          >
            <div>
              <div className="font-semibold">{order.name}</div>
              <div className="text-sm text-gray-500">
                {order.phone}
              </div>
            </div>
            <div className="text-sm text-gray-400">
              #{order.id}
            </div>
          </div>
        ))}
      </div>

      {/* 버튼 */}
      <button
        onClick={() => router.push("/order-convert")}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold"
      >
        가져오기 완료
      </button>

    </div>
  );
}
