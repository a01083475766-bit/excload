import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /excload 경로는 허용
  if (pathname.startsWith('/excload')) {
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

  // /3-logistics-convert 경로는 허용 (3물류주문변환)
  if (pathname.startsWith('/3-logistics-convert')) {
    return NextResponse.next();
  }

  // /3pl-convert 경로는 허용
  if (pathname.startsWith('/3pl-convert')) {
    return NextResponse.next();
  }

  // /history 경로는 허용
  if (pathname.startsWith('/history')) {
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

  // /about 경로는 허용 (서비스 설명 페이지)
  if (pathname.startsWith('/about')) {
    return NextResponse.next();
  }

  // /auth 경로는 허용 (로그인/회원가입 페이지)
  if (pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  // /akman 경로는 관리자 이메일만 허용
  if (pathname.startsWith('/akman')) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const adminEmails = (process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((e) => e.trim());

    if (!adminEmails.includes(token?.email || '')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
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
     * - public 폴더의 파일들
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
  ],
};
