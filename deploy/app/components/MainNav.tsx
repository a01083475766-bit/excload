'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Home, FileSpreadsheet, Warehouse, Package, Clock, HelpCircle, User, CreditCard, LogIn, Shield } from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';

/**
 * 클라이언트에서 관리자 이메일인지 확인
 * (서버 환경 변수는 클라이언트에서 접근 불가하므로 하드코딩된 이메일만 체크)
 */
function isAdminEmailClient(email: string | null | undefined): boolean {
  if (!email) return false;
  
  // akman 아이디, 기존 관리자 이메일 체크
  return (
    email === 'akman' || 
    email === 'a01083475766@gmail.com'
  );
}

interface MenuItem {
  href: string;
  label: string;
  icon: typeof Home;
}

const menuItems: MenuItem[] = [
  { href: '/excload', label: '홈', icon: Home },
  { href: '/order-convert', label: '주문변환', icon: FileSpreadsheet },
  { href: '/logistics-convert', label: '물류 주문 변환', icon: Warehouse },
  { href: '/3-logistics-convert', label: '3물류주문변환', icon: Package },
  { href: '/3pl-convert', label: '3PL 변환', icon: FileSpreadsheet },
  { href: '/about', label: '서비스 소개', icon: HelpCircle },
  { href: '/history', label: '변환내역', icon: Clock },
  { href: '/contact', label: '고객문의', icon: HelpCircle },
  { href: '/mypage', label: '마이페이지', icon: User },
  { href: '/pricing', label: '가격', icon: CreditCard },
];

export default function MainNav() {
  const pathname = usePathname();
  const user = useUserStore((state) => state.user);
  const isAdmin = user && isAdminEmailClient(user.email);

  // 관리자일 때 관리자페이지를 맨 앞에 추가
  const adminMenuItem: MenuItem = { href: '/akman', label: '관리자페이지', icon: Shield };
  const displayMenuItems = isAdmin 
    ? [adminMenuItem, ...menuItems]
    : menuItems;

  return (
    <nav className="sticky top-0 left-0 right-0 z-[100] h-[40px] border-b border-gray-200 bg-[#ffffff] overflow-x-auto">
      <div className="flex h-full justify-center gap-0.5">
        {displayMenuItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href === '/akman' && pathname?.startsWith('/akman/'));
          // 관리자가 아닐 때는 index === 0이 홈, 관리자일 때는 index === 1이 홈
          const isHome = !isAdmin ? index === 0 : index === 1;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center justify-center gap-1.5
                min-w-[120px] max-w-[140px] h-full shrink-0
                px-2.5 py-1.5
                text-xs
                relative
                whitespace-nowrap
                ${isActive
                  ? 'font-medium text-blue-600'
                  : 'font-normal text-gray-500'
                }
              `}
            >
              {isHome ? (
                <Image
                  src="/excload-logo.png"
                  alt="엑클로드 로고"
                  width={150}
                  height={50}
                  priority
                />
              ) : (
                <>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </>
              )}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600"
                />
              )}
            </Link>
          );
        })}
        {/* 로그인/회원가입 버튼 (로그인하지 않은 경우에만 표시) */}
        {!user && (
          <Link
            href="/auth"
            className={`
              flex items-center justify-center gap-1.5
              min-w-[140px] max-w-[160px] h-full shrink-0
              px-2.5 py-1.5
              text-xs
              relative
              whitespace-nowrap
              font-normal text-gray-500
              ${pathname === '/auth' || pathname === '/auth/login' || pathname === '/auth/signup' ? 'font-medium text-blue-600' : ''}
            `}
          >
            <LogIn className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">로그인/회원가입</span>
            {(pathname === '/auth' || pathname === '/auth/login' || pathname === '/auth/signup') && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600"
              />
            )}
          </Link>
        )}
      </div>
    </nav>
  );
}

