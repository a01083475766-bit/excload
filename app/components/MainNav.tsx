'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import {
  FileSpreadsheet,
  Warehouse,
  Package,
  Clock,
  BookOpen,
  Info,
  User,
  CreditCard,
  LogIn,
  Shield,
  MessageCircle,
  MessageSquare,
  Wrench,
  Newspaper,
  FlaskConical,
  Link2,
} from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';

interface MenuItem {
  href: string;
  label: string;
  icon: typeof FileSpreadsheet;
}

/** 1단: 업무 실행(변환·내역 등) */
const primaryMenuItems: MenuItem[] = [
  { href: '/order-convert', label: '택배주문변환', icon: FileSpreadsheet },
  { href: '/logistics-convert', label: '물류주문변환', icon: Warehouse },
  { href: '/invoice-file-convert', label: '송장파일변환', icon: Package },
  { href: '/history', label: '변환내역', icon: Clock },
  { href: '/user-guide', label: '사용가이드', icon: BookOpen },
  { href: '/free-tools', label: '무료도구', icon: Wrench },
];

/** 2단: 안내·계정 등 보조 메뉴 */
const secondaryMenuItems: MenuItem[] = [
  { href: '/about', label: '서비스소개', icon: Info },
  { href: '/pricing', label: '가격', icon: CreditCard },
  { href: '/beta-feedback', label: '베타 피드백', icon: MessageSquare },
  { href: '/contact', label: '고객문의', icon: MessageCircle },
];

const hiddenNavHrefs = new Set(['/feedback-event']);

/** 본문 영역 기준선 유지 + 모바일 세로에서 좌우 패딩 축소 */
const navInnerClass = 'mx-auto flex w-full max-w-[1200px] px-3 sm:px-5 lg:px-8';

const primaryLinkClass = `
  flex h-full shrink-0 items-center justify-center gap-2
  min-w-[118px] max-w-[200px]
  px-3 py-1.5
  text-sm
  relative
  whitespace-nowrap
`;

/** 2단: 보조 메뉴 — 모바일 터치 영역 확보 */
const secondaryLinkClass = `
  flex shrink-0 items-center gap-1
  min-h-9 whitespace-nowrap rounded px-1.5 py-1.5
  text-[12px] sm:text-[calc(11px+0.1rem)] leading-snug text-gray-600
  relative
  hover:text-blue-600
`;

const logoLinkClass = `
  relative flex shrink-0 items-center
  py-0.5
  min-w-0
`;

export default function MainNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const user = useUserStore((state) => state.user);

  const isLoggedIn = status === 'authenticated' || !!user;
  const isAdmin = session?.user?.isAdmin === true;

  const adminMenuItem: MenuItem = { href: '/akman', label: '관리자페이지', icon: Shield };
  const commerceReportMenuItem: MenuItem = {
    href: '/akman/commerce-report',
    label: '커머스리포트',
    icon: Newspaper,
  };
  const landingTestMenuItem: MenuItem = {
    href: '/landing-test',
    label: '랜딩페이지 테스트',
    icon: FlaskConical,
  };
  const orderIntegrationMenuItem: MenuItem = {
    href: '/order/integration',
    label: '쇼핑몰주문연동',
    icon: Link2,
  };
  const primaryMenuForUser = primaryMenuItems.filter(
    (item) => !hiddenNavHrefs.has(item.href) && (item.href !== '/history' || isLoggedIn),
  );
  /** 1단: 쇼핑몰주문연동을 택배주문변환 앞에 배치 */
  const displayPrimaryItems = [orderIntegrationMenuItem, ...primaryMenuForUser].filter(
    (item) => !hiddenNavHrefs.has(item.href),
  );
  /** 2단: 서비스소개 다음에 관리자·커머스리포트(관리자만), 이어서 랜딩 테스트 */
  const displaySecondaryItems = secondaryMenuItems
    .flatMap((item) => {
      if (item.href !== '/about') return [item];
      if (!isAdmin) return [item];
      return [item, adminMenuItem, commerceReportMenuItem, landingTestMenuItem];
    })
    .filter((item) => !hiddenNavHrefs.has(item.href));

  const isLogoActive = pathname === '/excload' || pathname === '/';

  const authActive =
    pathname === '/auth' || pathname === '/auth/login' || pathname === '/auth/signup';
  const mypageActive = pathname === '/mypage' || pathname?.startsWith('/mypage/');

  return (
    <nav className="sticky top-0 left-0 right-0 z-[100] border-b border-gray-200 bg-[#ffffff]">
      {/* 1단: 로고(왼쪽 끝) · 실행 메뉴(오른쪽 끝) */}
      <div
        className={`${navInnerClass} h-10 min-h-[40px] min-w-0 items-stretch justify-between gap-3`}
      >
        <Link
          href="/excload"
          className={`
            ${logoLinkClass}
            ${isLogoActive ? 'font-medium text-blue-600' : 'font-normal text-gray-500'}
          `}
        >
          <Image
            src="/excload-logo.png"
            alt="엑클로드 로고"
            width={150}
            height={50}
            priority
            className="h-8 w-auto sm:h-9"
          />
          {isLogoActive && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </Link>

        <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-start gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-px [-webkit-overflow-scrolling:touch] sm:justify-end sm:gap-3">
          {displayPrimaryItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === '/free-tools' && pathname?.startsWith('/free-tools/')) ||
              (item.href === '/order/integration' && pathname?.startsWith('/order/integration'));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  ${primaryLinkClass}
                  ${isActive ? 'font-medium text-blue-600' : 'font-normal text-gray-500'}
                `}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 2단: 1단 실행 메뉴와 같은 오른쪽 정렬 · 1단과 간격 축소 */}
      <div className="border-t border-gray-100 bg-zinc-50/95">
        <div
          className={`${navInnerClass} flex flex-nowrap items-center justify-start gap-x-0.5 gap-y-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-0.5 whitespace-nowrap [-webkit-overflow-scrolling:touch] sm:justify-end`}
        >
          {displaySecondaryItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === '/free-tools' && pathname?.startsWith('/free-tools/')) ||
              (item.href === '/beta-feedback' && pathname?.startsWith('/beta-feedback')) ||
              (item.href === '/akman/commerce-report' &&
                (pathname?.startsWith('/akman/commerce-report') ||
                  pathname?.startsWith('/admin/commerce-report'))) ||
              (item.href === '/akman' &&
                (pathname === '/akman' ||
                  (pathname?.startsWith('/akman/') &&
                    !pathname?.startsWith('/akman/commerce-report')) ||
                  (pathname?.startsWith('/admin/') &&
                    !pathname?.startsWith('/admin/commerce-report'))));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  ${secondaryLinkClass}
                  ${isActive ? 'font-semibold text-blue-600 hover:text-blue-600' : 'font-normal'}
                `}
              >
                <Icon className="size-3 shrink-0 opacity-60" aria-hidden />
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-1 right-1 h-px bg-blue-600" />
                )}
              </Link>
            );
          })}

          <span
            className="shrink-0 px-px leading-none text-gray-300 text-[calc(11px+0.1rem)]"
            aria-hidden
          >
            |
          </span>

          {!isLoggedIn && (
            <Link
              href="/auth"
              className={`
                ${secondaryLinkClass}
                ${authActive ? 'font-semibold text-blue-600 hover:text-blue-600' : 'font-normal'}
              `}
            >
              <LogIn className="size-3 shrink-0 opacity-60" aria-hidden />
              <span>로그인/회원가입</span>
              {authActive && (
                <span className="absolute bottom-0 left-1 right-1 h-px bg-blue-600" />
              )}
            </Link>
          )}

          {isLoggedIn && (
            <>
              <Link
                href="/mypage"
                className={`
                  ${secondaryLinkClass}
                  ${mypageActive ? 'font-semibold text-blue-600 hover:text-blue-600' : 'font-normal'}
                `}
              >
                <User className="size-3 shrink-0 opacity-60" aria-hidden />
                <span>마이페이지</span>
                {mypageActive && (
                  <span className="absolute bottom-0 left-1 right-1 h-px bg-blue-600" />
                )}
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
