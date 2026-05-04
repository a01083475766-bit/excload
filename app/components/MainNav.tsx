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

const primaryLinkClass = `
  flex items-center justify-center gap-1.5
  min-w-[120px] max-w-[140px] h-full shrink-0
  px-2.5 py-1.5
  text-xs
  relative
  whitespace-nowrap
`;

const secondaryLinkClass = `
  flex items-center justify-center gap-1.5
  min-w-[88px] sm:min-w-[100px] h-full shrink-0
  px-2 py-1
  text-[11px] sm:text-xs
  relative
  whitespace-nowrap
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
      {/* 1단: 로고 + 실행 메뉴 */}
      <div className="flex h-10 min-h-[40px] justify-center gap-0.5 overflow-x-auto overflow-y-hidden">
        <Link
          href="/excload"
          className={`
            ${primaryLinkClass}
            ${isLogoActive ? 'font-medium text-blue-600' : 'font-normal text-gray-500'}
          `}
        >
          <Image
            src="/excload-logo.png"
            alt="엑클로드 로고"
            width={150}
            height={50}
            priority
          />
          {isLogoActive && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" />
          )}
        </Link>

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
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" />
              )}
            </Link>
          );
        })}
      </div>

      {/* 2단: 서비스소개·가격·문의 | 로그인·마이페이지·로그아웃 */}
      <div className="flex min-h-[36px] items-center justify-center gap-x-1 gap-y-1 border-t border-gray-100 bg-zinc-50/95 px-2 py-1 sm:gap-x-2">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-x-1 sm:gap-x-2">
          {secondaryMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  ${secondaryLinkClass}
                  ${isActive ? 'font-medium text-blue-600' : 'font-normal text-gray-600 hover:text-blue-600'}
                `}
              >
                <Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </Link>
            );
          })}
        </div>

        <span
          className="hidden shrink-0 px-1 text-gray-300 sm:inline"
          aria-hidden
        >
          |
        </span>

        <div className="flex flex-wrap items-center justify-center gap-x-1 sm:gap-x-2">
          {!user && (
            <Link
              href="/auth"
              className={`
                ${secondaryLinkClass}
                min-w-[120px] sm:min-w-[130px]
                ${authActive ? 'font-medium text-blue-600' : 'font-normal text-gray-600 hover:text-blue-600'}
              `}
            >
              <LogIn className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              <span className="truncate">로그인/회원가입</span>
              {authActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </Link>
          )}

          {user && (
            <>
              <Link
                href="/mypage"
                className={`
                  ${secondaryLinkClass}
                  ${mypageActive ? 'font-medium text-blue-600' : 'font-normal text-gray-600 hover:text-blue-600'}
                `}
              >
                <User className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="truncate">마이페이지</span>
                {mypageActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await signOut({ redirect: false });
                  clearUser();
                  window.location.href = '/auth/login';
                }}
                className={`
                  ${secondaryLinkClass}
                  font-normal text-gray-600 hover:text-blue-600
                  border-0 bg-transparent cursor-pointer
                `}
              >
                <LogIn className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="truncate">로그아웃</span>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
