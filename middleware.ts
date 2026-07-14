import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { buildAuthLoginRedirectUrl } from '@/app/lib/auth/post-login-redirect';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // OAuth/NextAuth는 시작 호스트의 쿠키(state·CSRF)가 콜백 호스트와 같아야 합니다.
  // apex(excload.com)로 들어오면 www로 통일합니다. (localhost·미리보기는 영향 없음)
  const rawHost = request.headers.get('host') ?? '';
  const hostOnly = rawHost.split(':')[0]?.toLowerCase() ?? '';
  if (hostOnly === 'excload.com') {
    const url = request.nextUrl.clone();
    url.hostname = 'www.excload.com';
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  // 검색엔진 등록용 정적 메타·소유확인 파일 (HTML 리다이렉트 방지)
  if (
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/googlea00102bac7fd96b2.html'
  ) {
    return NextResponse.next();
  }

  // 랜딩 UI는 app/excload/page.tsx 단일 소스. 루트 `/`는 파일 하단에서 /excload로 리다이렉트.
  if (pathname.startsWith('/excload')) {
    return NextResponse.next();
  }

  // /trial 체험판 (랜딩에서만 링크, 네비 비노출)
  if (pathname.startsWith('/trial')) {
    return NextResponse.next();
  }

  // /order-convert 경로는 허용
  if (pathname.startsWith('/order-convert')) {
    return NextResponse.next();
  }

  // /logistics-convert 경로는 허용 (물류 주문 변환 — order-convert와 동일 정책)
  if (pathname.startsWith('/logistics-convert')) {
    return NextResponse.next();
  }

  // /invoice-file-convert 송장파일변환 (order-convert 복제 페이지)
  if (pathname.startsWith('/invoice-file-convert')) {
    return NextResponse.next();
  }

  // 변환 내역 — 로컬에 저장된 주문·개인정보가 표시될 수 있어 로그인 필수
  if (pathname.startsWith('/history')) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const callbackPath = pathname + request.nextUrl.search;
      return NextResponse.redirect(
        buildAuthLoginRedirectUrl(request.url, callbackPath),
      );
    }
    return NextResponse.next();
  }

  // /user-guide 사용가이드 (정적 UI·툴팁 안내 페이지)
  if (pathname.startsWith('/user-guide')) {
    return NextResponse.next();
  }

  // /free-tools 쇼핑몰 운영 무료도구
  if (pathname.startsWith('/free-tools')) {
    return NextResponse.next();
  }

  // /feedback-event 오픈 피드백 이벤트
  if (pathname.startsWith('/feedback-event')) {
    return NextResponse.next();
  }

  // /contact 경로는 허용
  if (pathname.startsWith('/contact')) {
    return NextResponse.next();
  }

  // /mypage 경로는 허용
  if (pathname.startsWith('/mypage')) {
    return NextResponse.next();
  }

  // /setting — 쇼핑몰 연동 등 설정 (예: /setting/mall)
  if (pathname.startsWith('/setting')) {
    return NextResponse.next();
  }

  // /order/integration — 주문연동 (로그인 필요)
  if (pathname.startsWith('/order/integration')) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const callbackPath = pathname + request.nextUrl.search;
      return NextResponse.redirect(
        buildAuthLoginRedirectUrl(request.url, callbackPath),
      );
    }
    return NextResponse.next();
  }

  // /order — API 주문 수집 UI 등 (예: /order/fetch)
  if (pathname.startsWith('/order')) {
    return NextResponse.next();
  }

  // /pricing 경로는 허용
  if (pathname.startsWith('/pricing')) {
    return NextResponse.next();
  }

  // /refund 경로는 허용 (환불 정책 페이지)
  if (pathname.startsWith('/refund')) {
    return NextResponse.next();
  }

  // /terms 경로는 허용 (이용약관 페이지)
  if (pathname.startsWith('/terms')) {
    return NextResponse.next();
  }

  // /privacy 경로는 허용 (개인정보처리방침 페이지)
  if (pathname.startsWith('/privacy')) {
    return NextResponse.next();
  }

  // /subscribe 경로는 허용 (결제 흐름 페이지)
  if (pathname.startsWith('/subscribe')) {
    return NextResponse.next();
  }

  // /toss — 토스 카드 등록 리다이렉트(success/fail)
  if (pathname.startsWith('/toss')) {
    return NextResponse.next();
  }

  // /about 경로는 허용 (서비스 설명 페이지)
  if (pathname.startsWith('/about')) {
    return NextResponse.next();
  }

  // /auth 경로는 허용 (로그인/회원가입 페이지)
  if (pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  // /login → /auth/login 별칭 (subscribe 등에서 리다이렉트용)
  if (pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // /landing-test — 랜딩페이지 테스트본 (관리자 전용, 실서비스 랜딩과 분리)
  if (pathname.startsWith('/landing-test')) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const callbackPath = pathname + request.nextUrl.search;
      return NextResponse.redirect(
        buildAuthLoginRedirectUrl(request.url, callbackPath),
      );
    }
    const email =
      typeof token.email === 'string'
        ? token.email
        : typeof token.sub === 'string'
          ? token.sub
          : null;
    if (!isAdminEmail(email)) {
      return NextResponse.redirect(new URL('/excload', request.url));
    }
    return NextResponse.next();
  }

  // /akman · /admin — 관리자 UI (로그인 + 관리자 이메일만 허용, API는 각 route에서 동일 검증)
  if (pathname.startsWith('/akman') || pathname.startsWith('/admin')) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const callbackPath = pathname + request.nextUrl.search;
      return NextResponse.redirect(
        buildAuthLoginRedirectUrl(request.url, callbackPath),
      );
    }
    const email =
      typeof token.email === 'string'
        ? token.email
        : typeof token.sub === 'string'
          ? token.sub
          : null;
    if (!isAdminEmail(email)) {
      return NextResponse.redirect(new URL('/excload', request.url));
    }
    return NextResponse.next();
  }

  // public/uploads (피드백 첨부 등)
  if (pathname.startsWith('/uploads')) {
    return NextResponse.next();
  }

  // API 경로는 허용 (내부 로직 동작을 위해)
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // 그 외 모든 경로는 /excload로 리다이렉트
  return NextResponse.redirect(new URL('/excload', request.url));
}

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청 경로와 일치:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public 폴더의 정적 파일들
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico|ttf|otf|woff|woff2)).*)',
  ],
};
