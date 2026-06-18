export default function PrivacyPage() {
  return (
    <div className="max-w-[800px] mx-auto py-16 px-6">
      <h1 className="text-2xl font-bold mb-4 text-center">
        엑클로드(EXCLOAD) 개인정보처리방침
      </h1>
      <p className="text-center text-xs text-zinc-500 mb-10">시행일: 2026년 5월 27일</p>

      <div className="text-sm leading-7 space-y-8 text-left text-zinc-800">
        <p>
          원클(엑클로드 EXCLOAD, 이하 &quot;회사&quot;)는 「개인정보 보호법」 등 관련 법령에 따라 이용자의
          개인정보를 보호하고, 아래와 같이 개인정보처리방침을 수립·공개합니다. 본 방침은 회사가
          제공하는 주문·송장·물류 데이터 변환 서비스(이하 &quot;서비스&quot;)에 적용됩니다.
        </p>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">1. 개인정보처리자</h2>
          <ul className="list-none space-y-1">
            <li>상호: 원클 (엑클로드 EXCLOAD)</li>
            <li>대표자: 최영순</li>
            <li>사업자등록번호: 834-19-02117</li>
            <li>주소: 인천시 미추홀구 낙섬중로129 상가4동 207호</li>
            <li>전화: 010-8347-5766</li>
            <li>
              이메일:{' '}
              <a
                href="mailto:sacom5766@naver.com"
                className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
              >
                sacom5766@naver.com
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">
            2. 수집하는 개인정보 항목 및 수집 방법
          </h2>
          <p className="mb-3">
            회사는 서비스 제공에 필요한 범위에서 다음과 같은 정보를 수집할 수 있습니다.
          </p>

          <h3 className="font-medium text-zinc-900 mb-1">가. 회원 가입·로그인·계정 관리</h3>
          <ul className="list-disc pl-5 space-y-1 mb-4">
            <li>
              <strong>필수:</strong> 이메일 주소, 비밀번호(암호화하여 저장), 휴대전화번호(회원가입·본인
              확인 시)
            </li>
            <li>
              <strong>선택:</strong> 닉네임(이름), 프로필 이미지
            </li>
            <li>
              <strong>소셜 로그인(Google·카카오·네이버 등) 이용 시:</strong> 해당 제공자가 회사에
              전달하는 식별자·이메일·이름·프로필 이미지 등(제공 동의 범위 내)
            </li>
            <li>
              <strong>자동 생성·기록:</strong> 회원 고유 ID, 가입·로그인 수단, 가입일시, 서비스 이용
              기록(플랜·사용량·결제·구독 상태 등), 부정 이용 방지를 위한 기기 식별값·접속 IP 등
            </li>
          </ul>

          <h3 className="font-medium text-zinc-900 mb-1">나. 유료 결제·구독·환불</h3>
          <ul className="list-disc pl-5 space-y-1 mb-4">
            <li>
              결제 수단 정보(카드사명, 마스킹된 카드번호 등)는{' '}
              <strong>토스페이먼츠·Stripe 등 결제 대행사</strong>를 통해 처리되며, 회사는 결제
              승인·구독 관리에 필요한 최소 정보(결제 식별자, 금액, 플랜, 결제일시 등)를 보관할 수
              있습니다.
            </li>
            <li>
              환불 신청 시: 은행명, 계좌번호, 예금주, 환불 사유, 회신용 이메일 등(환불 처리 목적)
            </li>
          </ul>

          <h3 className="font-medium text-zinc-900 mb-1">다. 고객 문의</h3>
          <ul className="list-disc pl-5 space-y-1 mb-4">
            <li>
              문의 유형, 이름, 이메일, 제목, 내용, 회사명(선택), 연락처(선택), 첨부 파일명(선택) 등
            </li>
          </ul>

          <h3 className="font-medium text-zinc-900 mb-1">
            라. 주문·송장·물류 변환 과정에서 이용자가 입력·업로드하는 정보
          </h3>
          <p className="mb-2">
            서비스의 핵심 기능은 이용자가 제공한 주문 데이터를 변환하는 것입니다. 이용자가 직접
            입력·업로드하는 내용에는, 그에 포함된{' '}
            <strong>
              수취인·주문자의 성명, 연락처, 주소, 상품명, 주문 메모 등 개인정보가 포함될 수 있습니다.
            </strong>
          </p>
          <ul className="list-disc pl-5 space-y-1 mb-2">
            <li>엑셀·CSV 등 주문 파일, 텍스트 붙여넣기, 이미지(OCR 변환 시)</li>
            <li>택배·물류 업로드용 양식 설정, 고정 입력값, 미리보기·편집 내용</li>
          </ul>
          <p className="text-zinc-700">
            위 주문·변환 데이터는 <strong>이용자 기기(브라우저)에서 우선 처리</strong>되며, AI
            변환·헤더 매핑·OCR 등 기능 이용 시 처리에 필요한 범위의 텍스트·이미지가{' '}
            <strong>회사 서버를 경유</strong>하여 AI API로 전송될 수 있습니다. 회사는 주문 원본
            파일 전체를 영구 보관하는 데이터베이스를 운영하지 않으며, 서비스 개선·매핑 품질 향상을
            위해 <strong>엑셀 열 이름(헤더) 수준의 매핑 로그</strong> 등 비식별·최소 정보가 서버에
            기록될 수 있습니다.
          </p>
          <p className="mt-2 text-zinc-700">
            헤더 자동 매핑 품질 개선 및 관리자 검토를 위해, 업로드 또는 변환 과정에서 확인되는 원본
            헤더명, 시스템이 매핑한 기준헤더명, 매핑 상태, 매핑 방식, 값 타입 추정 결과,{' '}
            <strong>마스킹된 샘플값 일부</strong>가 기록될 수 있습니다. 이 경우{' '}
            <strong>원본 파일 전체와 전체 주문 행 데이터는 저장하지 않으며</strong>, 이름·전화번호·주소·
            배송메시지 등 개인정보가 포함될 수 있는 값은 원문이 아닌 마스킹된 형태로만 저장합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">3. 개인정보의 수집·이용 목적</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원 가입·본인 확인·로그인·계정 관리</li>
            <li>주문·송장·물류 데이터 변환 서비스 제공 및 품질 개선</li>
            <li>유료 플랜·사용량·정기결제·환불 처리</li>
            <li>고객 문의·민원 응대 및 공지 전달</li>
            <li>부정 이용·어뷰징 방지 및 서비스 안정성 확보</li>
            <li>관련 법령에 따른 의무 이행 및 분쟁 대응</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">4. 보유 및 이용 기간</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>회원 정보:</strong> 회원 탈퇴 시까지 보관하며, 탈퇴 후 지체 없이 파기합니다.
              다만 관계 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관할 수 있습니다.
            </li>
            <li>
              <strong>결제·거래 기록:</strong> 전자상거래 등에서의 소비자보호에 관한 법률 등에 따라
              계약·결제·환불 관련 기록은 해당 법정 보존 기간 동안 보관할 수 있습니다.
            </li>
            <li>
              <strong>고객 문의:</strong> 문의 처리 완료 후 합리적인 기간(통상 3년 이내) 보관 후
              파기할 수 있습니다.
            </li>
            <li>
              <strong>변환 내역(브라우저):</strong> 이용자 기기의 localStorage에 저장되며,{' '}
              <strong>생성일로부터 20일</strong>이 지난 항목은 자동으로 제외·정리됩니다. 브라우저
              데이터 삭제·다른 기기 이용 시 복원되지 않을 수 있습니다.
            </li>
            <li>
              <strong>작업 중 임시 저장(브라우저):</strong> 페이지 이동 중 작업 유지를 위해
              sessionStorage·IndexedDB에 임시 저장될 수 있으며, 탭 종료·새로고침·로그아웃·계정
              전환·이용자가 초기화·다운로드 완료 처리한 경우 등에 삭제됩니다.
            </li>
            <li>
              <strong>헤더 매핑 검토 로그:</strong> 서비스 품질 개선 및 별칭 관리 목적 범위에서
              생성일로부터 <strong>최대 30일</strong>간 보관 후 삭제될 수 있습니다. 해당 로그에는
              원본 파일 전체 또는 전체 주문 행 데이터가 포함되지 않으며, 샘플값은 마스킹된 형태로만
              저장됩니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">
            5. 이용자 기기(브라우저) 저장 및 쿠키
          </h2>
          <p className="mb-2">
            회사는 서비스 편의와 계정별 설정 유지를 위해 이용자 기기에 다음 정보를 저장할 수
            있습니다.
          </p>
          <ul className="list-disc pl-5 space-y-1 mb-3">
            <li>
              <strong>localStorage:</strong> 변환 내역(계정별, 20일 보관 정책), 택배 양식·고정
              입력값·최근 사용 양식 등 계정 연동 설정
            </li>
            <li>
              <strong>sessionStorage:</strong> 변환 작업 중 미리보기·입력 상태(같은 탭·세션 내
              복구용)
            </li>
            <li>
              <strong>IndexedDB:</strong> 작업 중 업로드한 엑셀·이미지 파일(같은 탭 내 복구용, DB
              서버 미저장)
            </li>
            <li>
              <strong>쿠키:</strong> 로그인 세션(NextAuth), 소셜 로그인 연동, 팝업·UI 설정 등
            </li>
          </ul>
          <p>
            이용자는 브라우저 설정에서 쿠키·사이트 데이터를 삭제할 수 있으나, 이 경우 로그인
            상태·변환 내역·작업 중 데이터가 사라질 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">
            6. 개인정보의 제3자 제공
          </h2>
          <p>
            회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자의 동의가
            있거나, 법령에 근거한 경우(수사기관의 적법한 요청 등)에 한하여 제공할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">
            7. 개인정보 처리 위탁 및 국외 이전
          </h2>
          <p className="mb-3">
            회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁할 수 있습니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border border-zinc-200 text-xs sm:text-sm">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="border border-zinc-200 px-2 py-2 font-semibold">수탁자</th>
                  <th className="border border-zinc-200 px-2 py-2 font-semibold">위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-zinc-200 px-2 py-2">토스페이먼츠</td>
                  <td className="border border-zinc-200 px-2 py-2">결제·자동결제(빌링) 처리</td>
                </tr>
                <tr>
                  <td className="border border-zinc-200 px-2 py-2">Stripe, Inc.</td>
                  <td className="border border-zinc-200 px-2 py-2">결제·구독 처리</td>
                </tr>
                <tr>
                  <td className="border border-zinc-200 px-2 py-2">Google, 카카오, 네이버</td>
                  <td className="border border-zinc-200 px-2 py-2">소셜 로그인 인증</td>
                </tr>
                <tr>
                  <td className="border border-zinc-200 px-2 py-2">Resend 등 이메일 발송 서비스</td>
                  <td className="border border-zinc-200 px-2 py-2">
                    회원가입·비밀번호 재설정 등 안내 메일 발송
                  </td>
                </tr>
                <tr>
                  <td className="border border-zinc-200 px-2 py-2">
                    OpenAI 또는 회사가 설정한 AI API 제공업체
                  </td>
                  <td className="border border-zinc-200 px-2 py-2">
                    텍스트·이미지 기반 주문 정규화, 헤더 매핑, OCR 등 AI 변환 처리(이용 시)
                  </td>
                </tr>
                <tr>
                  <td className="border border-zinc-200 px-2 py-2">클라우드·호스팅 사업자</td>
                  <td className="border border-zinc-200 px-2 py-2">서비스 인프라·DB 운영</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            AI 변환 기능 이용 시, 처리에 필요한 텍스트·이미지 데이터가{' '}
            <strong>국외(예: 미국 등)에 소재한 AI 서비스 제공업체</strong>로 전송·처리될 수
            있습니다. 회사는 위탁 계약 등을 통해 개인정보가 안전하게 처리되도록 관리합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">8. 이용자의 권리와 행사 방법</h2>
          <p className="mb-2">
            이용자는 언제든지 자신의 개인정보에 대해 열람·정정·삭제·처리 정지·동의 철회를 요청할 수
            있습니다.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>마이페이지에서 일부 정보(닉네임·연락처 등)를 직접 수정할 수 있습니다.</li>
            <li>
              변환 내역은 서비스 내 「변환 내역」 화면에서 삭제하거나, 브라우저 데이터를 삭제할 수
              있습니다.
            </li>
            <li>
              회원 탈퇴는{' '}
              <a href="/mypage" className="text-blue-600 underline underline-offset-2">
                마이페이지
              </a>
              에서 직접 신청할 수 있습니다. 개인정보 삭제 요청은{' '}
              <a href="/contact" className="text-blue-600 underline underline-offset-2">
                고객 문의
              </a>
              또는 이메일(
              <a
                href="mailto:sacom5766@naver.com"
                className="text-blue-600 underline underline-offset-2"
              >
                sacom5766@naver.com
              </a>
              )로 요청할 수 있으며, 법령상 보관 의무가 있는 정보는 해당 기간 보관 후 파기합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">9. 개인정보의 파기</h2>
          <p>
            보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적
            파일은 복구·재생이 불가능한 방법으로, 출력물은 분쇄 또는 소각합니다. 다만 다른 법령에
            따라 보존해야 하는 경우에는 별도 저장 후 보존 기간 종료 시 파기합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">
            10. 개인정보의 안전성 확보 조치
          </h2>
          <p>
            회사는 개인정보의 안전한 처리를 위해 접근 권한 관리, 비밀번호 암호화 저장, 전송 구간
            암호화(HTTPS), 관리자 페이지 접근 통제, 내부 관리 계획 수립 등 기술적·관리적·물리적
            조치를 시행합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">
            11. 만 14세 미만 아동의 개인정보
          </h2>
          <p>
            회사는 만 14세 미만 아동의 개인정보를 고의로 수집하지 않습니다. 만 14세 미만 아동의
            개인정보가 수집된 사실을 인지한 경우 지체 없이 삭제 등 필요한 조치를 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">
            12. 개인정보 보호책임자 및 문의
          </h2>
          <ul className="list-none space-y-1">
            <li>담당: 개인정보 보호책임자 (대표 최영순)</li>
            <li>전화: 010-8347-5766 (평일 10:00~18:00)</li>
            <li>
              이메일:{' '}
              <a
                href="mailto:sacom5766@naver.com"
                className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
              >
                sacom5766@naver.com
              </a>
            </li>
            <li>
              온라인 문의:{' '}
              <a href="/contact" className="text-blue-600 underline underline-offset-2">
                /contact
              </a>
            </li>
          </ul>
          <p className="mt-2 text-zinc-700">
            개인정보 침해 신고·상담: 개인정보침해신고센터(privacy.kisa.or.kr / 국번 없이 118),
            대검찰청 사이버수사과(www.spo.go.kr / 국번 없이 1301), 경찰청 사이버수사국(
            ecrm.police.go.kr / 국번 없이 182) 등에 문의하실 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-2">13. 개인정보처리방침의 변경</h2>
          <p>
            본 방침이 변경되는 경우 시행일 7일 전부터 서비스 내 공지 또는 본 페이지를 통해
            안내합니다. 다만 이용자 권리에 중대한 변경이 있는 경우에는 30일 전에 안내할 수
            있습니다.
          </p>
        </section>

        <p className="text-xs text-zinc-500 pt-4 border-t border-zinc-200">
          본 문서는 현재 서비스 동작(브라우저 저장, AI·결제 연동 등)을 반영하여 작성되었습니다.
          세부 운영이 변경되면 본 방침도 함께 개정됩니다.
        </p>
      </div>
    </div>
  );
}
