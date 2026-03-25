import Link from 'next/link';
import { ComponentType } from 'react';

interface NavItemProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  active?: boolean;
}

export default function NavItem({ label, icon: Icon, href, active = false }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`
        flex items-center justify-center gap-2
        w-[160px] h-[45px] shrink-0
        transition-colors
        ${active
          ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
        }
      `}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

