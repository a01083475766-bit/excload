export default function HomePage() {
  return (
    <div className="max-w-[900px] mx-auto py-20 text-center">
      <h1 className="text-3xl font-bold mb-6">
        주문 데이터를 자동으로 변환하는 EXCLOAD
      </h1>

      <p className="text-gray-600 mb-10">
        텍스트, 엑셀, 이미지 주문을 업로드하면
        택배사 및 3PL 업로드용 엑셀 파일로 자동 변환됩니다.
      </p>

      <div className="space-y-4 text-left">
        <p>✔ 주문 데이터 자동 정리</p>
        <p>✔ 택배 업로드 파일 자동 생성</p>
        <p>✔ 3PL 물류 시스템 대응</p>
      </div>
    </div>
  )
}
