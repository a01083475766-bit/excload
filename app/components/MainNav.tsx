'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  FileSpreadsheet,
  Warehouse,
  Package,
  Clock,
  Info,
  User,
  CreditCard,
  LogIn,
  Shield,
  MessageCircle,
} from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';
import { signOut } from 'next-auth/react';

/**
 * 클라이언트에서 관리자 이메일인지 확인
 * (서버 환경 변수는 클라이언트에서 접근 불가하므로 하드코딩된 이메일만 체크)
 */
function isAdminEmailClient(email: string | null | undefined): boolean {
  if (!email) return false;

  return (
    email === 'akman' ||
    email === 'akman@excload.com' ||
    email === 'a01083475766@gmail.com'
  );
}

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
];

/** 2단: 안내·계정 등 보조 메뉴 */
const secondaryMenuItems: MenuItem[] = [
  { href: '/about', label: '서비스소개', icon: Info },
  { href: '/pricing', label: '가격', icon: CreditCard },
  { href: '/contact', label: '고객문의', icon: MessageCircle },
];

/** 본문 영역(main max-w-[1200px] mx-auto px-8)과 좌우 기준선 맞춤 */
const navInnerClass = 'mx-auto flex w-full max-w-[1200px] px-8';

const primaryLinkClass = `
  flex h-full shrink-0 items-center justify-center gap-2
  min-w-[118px] max-w-[172px]
  px-4 py-1.5
  text-sm
  relative
  whitespace-nowrap
`;

/** 2단: 보조 메뉴 — 간격 최소화(부가 메뉴) */
const secondaryLinkClass = `
  flex shrink-0 items-center gap-0.5
  whitespace-nowrap rounded px-1 py-0.5
  text-[11px] leading-none text-gray-600
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
  const user = useUserStore((state) => state.user);
  const clearUser = useUserStore((state) => state.clearUser);
  const isAdmin = user && isAdminEmailClient(user.email);

  const adminMenuItem: MenuItem = { href: '/akman', label: '관리자페이지', icon: Shield };
  const displayPrimaryItems = isAdmin ? [adminMenuItem, ...primaryMenuItems] : primaryMenuItems;

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

        <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-end gap-2 overflow-x-auto overflow-y-hidden pb-px sm:gap-3">
          {displayPrimaryItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === '/akman' && pathname?.startsWith('/akman/'));

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
          className={`${navInnerClass} flex flex-wrap items-center justify-end gap-x-0.5 gap-y-0.5 py-0.5`}
        >
          {secondaryMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

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

          <span className="shrink-0 px-px text-[10px] leading-none text-gray-300" aria-hidden>
            |
          </span>

          {!user && (
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

          {user && (
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
              <button
                type="button"
                onClick={async () => {
                  await signOut({ redirect: false });
                  clearUser();
                  window.location.href = '/auth/login';
                }}
                className={`${secondaryLinkClass} cursor-pointer border-0 bg-transparent font-normal`}
              >
                <LogIn className="size-3 shrink-0 opacity-60" aria-hidden />
                <span>로그아웃</span>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
