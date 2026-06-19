export default function SiteFooter() {
  return (
    <footer className="mt-auto shrink-0 border-t border-zinc-200 px-4 py-4 text-center text-[11px] leading-5 text-zinc-500 sm:text-xs">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <a href="/terms" className="underline underline-offset-2 hover:text-zinc-700">
          이용약관
        </a>
        <span className="text-zinc-400">|</span>
        <a href="/privacy" className="underline underline-offset-2 hover:text-zinc-700">
          개인정보처리방침
        </a>
        <span className="text-zinc-400">|</span>
        <a href="/refund" className="underline underline-offset-2 hover:text-zinc-700">
          환불정책
        </a>
        <span className="text-zinc-400">|</span>
        <details className="inline">
          <summary className="inline cursor-pointer list-none underline underline-offset-2 hover:text-zinc-700">
            사업자정보
          </summary>
          <div className="mx-auto mt-3 max-w-5xl space-y-0.5 text-zinc-500">
            <p>
              상호: 원클 (엑클로드 EXCLOAD) | 대표자: 최영순 | 사업자등록번호: 834-19-02117 | 주소:
              인천시 미추홀구 낙섬중로129 상가4동 207호
            </p>
            <p>
              전화번호: 010-8347-5766 | 이메일: sacom5766@naver.com | 통신판매업 신고번호:
              2026-인천미추홀-0416
            </p>
          </div>
        </details>
      </div>
    </footer>
  );
}
