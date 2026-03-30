'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { FileSpreadsheet, Warehouse, Clock, HelpCircle, User, CreditCard, LogIn, Shield } from 'lucide-react';
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

/** 순서: 택배주문변환 → 물류주문변환 → 변환내역 → 고객문의 → 서비스소개 → 가격 → 마이페이지 (로고·관리자·로그인/로그아웃은 별도) */
const menuItems: MenuItem[] = [
  { href: '/order-convert', label: '택배주문변환', icon: FileSpreadsheet },
  { href: '/logistics-convert', label: '물류주문변환', icon: Warehouse },
  { href: '/history', label: '변환내역', icon: Clock },
  { href: '/contact', label: '고객문의', icon: HelpCircle },
  { href: '/about', label: '서비스소개', icon: HelpCircle },
  { href: '/pricing', label: '가격', icon: CreditCard },
  { href: '/mypage', label: '마이페이지', icon: User },
];

const linkClass = `
  flex items-center justify-center gap-1.5
  min-w-[120px] max-w-[140px] h-full shrink-0
  px-2.5 py-1.5
  text-xs
  relative
  whitespace-nowrap
`;

export default function MainNav() {
  const pathname = usePathname();
  const user = useUserStore((state) => state.user);
  const clearUser = useUserStore((state) => state.clearUser);
  const isAdmin = user && isAdminEmailClient(user.email);

  const adminMenuItem: MenuItem = { href: '/akman', label: '관리자페이지', icon: Shield };
  const displayMenuItems = isAdmin ? [adminMenuItem, ...menuItems] : menuItems;

  const isLogoActive = pathname === '/excload' || pathname === '/';

  return (
    <nav className="sticky top-0 left-0 right-0 z-[100] h-[40px] border-b border-gray-200 bg-[#ffffff] overflow-x-auto">
      <div className="flex h-full justify-center gap-0.5">
        <Link
          href="/excload"
          className={`
            ${linkClass}
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

        {displayMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href === '/akman' && pathname?.startsWith('/akman/'));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                ${linkClass}
                ${isActive ? 'font-medium text-blue-600' : 'font-normal text-gray-500'}
              `}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" />
              )}
            </Link>
          );
        })}

        {!user && (
          <Link
            href="/auth"
            className={`
              ${linkClass}
              min-w-[140px] max-w-[160px]
              ${pathname === '/auth' || pathname === '/auth/login' || pathname === '/auth/signup' ? 'font-medium text-blue-600' : 'font-normal text-gray-500'}
            `}
          >
            <LogIn className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">로그인/회원가입</span>
            {(pathname === '/auth' || pathname === '/auth/login' || pathname === '/auth/signup') && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" />
            )}
          </Link>
        )}

        {user && (
          <button
            type="button"
            onClick={async () => {
              await signOut({ redirect: false });
              clearUser();
              window.location.href = '/auth/login';
            }}
            className={`
              ${linkClass}
              min-w-[100px] max-w-[120px]
              font-normal text-gray-500 hover:text-blue-600
              border-0 bg-transparent
              cursor-pointer
            `}
          >
            <LogIn className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">로그아웃</span>
          </button>
        )}
      </div>
    </nav>
  );
}
