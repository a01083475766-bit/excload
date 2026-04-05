"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MallSettingPage() {
  const router = useRouter();
  const [selectedMall, setSelectedMall] = useState<string | null>(null);
  const [connectedMalls, setConnectedMalls] = useState<string[]>([]);

  return (
    <>
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-xl font-bold mb-4">내 주문 연동하기</h1>

        <p className="text-sm text-gray-500 mb-6">
          쇼핑몰을 연결하면 주문을 자동으로 가져올 수 있습니다
        </p>

        <div className="space-y-4">

          {/* 쿠팡 */}
          <div className="border rounded-xl p-4 flex justify-between items-center">
            <div>
              <div className="font-semibold">쿠팡</div>
              <div className="text-sm text-gray-500">API 연동</div>
            </div>
            {connectedMalls.includes("coupang") ? (
              <button
                type="button"
                disabled
                className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed"
              >
                연결됨
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedMall("coupang")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                연결하기
              </button>
            )}
          </div>

          {/* 네이버 */}
          <div className="border rounded-xl p-4 flex justify-between items-center">
            <div>
              <div className="font-semibold">네이버 스마트스토어</div>
              <div className="text-sm text-gray-500">API 연동</div>
            </div>
            {connectedMalls.includes("naver") ? (
              <button
                type="button"
                disabled
                className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed"
              >
                연결됨
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedMall("naver")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                연결하기
              </button>
            )}
          </div>

          {/* 카페24 */}
          <div className="border rounded-xl p-4 flex justify-between items-center">
            <div>
              <div className="font-semibold">카페24</div>
              <div className="text-sm text-gray-500">API 연동</div>
            </div>
            {connectedMalls.includes("cafe24") ? (
              <button
                type="button"
                disabled
                className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed"
              >
                연결됨
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedMall("cafe24")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                연결하기
              </button>
            )}
          </div>

        </div>

        {/* 뒤로가기 */}
        <button
          onClick={() => router.back()}
          className="mt-6 text-sm text-gray-500 underline"
        >
          ← 마이페이지로 돌아가기
        </button>
      </div>

      {selectedMall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">

            <h2 className="text-lg font-bold mb-4">
              {selectedMall === "coupang" && "쿠팡 연결하기"}
              {selectedMall === "naver" && "네이버 스마트스토어 연결하기"}
              {selectedMall === "cafe24" && "카페24 연결하기"}
            </h2>

            <div className="space-y-3 text-sm text-gray-600 mb-6">
              <p>1. 해당 쇼핑몰 관리자 페이지에 접속하세요</p>
              <p>2. API 키를 발급받으세요</p>
              <p>3. 아래에 입력하면 연결됩니다</p>
            </div>

            <input
              type="text"
              placeholder="API 키 입력"
              className="w-full border rounded-lg px-3 py-2 mb-4"
            />

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2 bg-gray-200 rounded-lg"
                onClick={() => setSelectedMall(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg"
                onClick={() => {
                  if (selectedMall && !connectedMalls.includes(selectedMall)) {
                    setConnectedMalls([...connectedMalls, selectedMall]);
                  }
                  setSelectedMall(null);
                }}
              >
                연결 완료
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
