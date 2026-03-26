import { redirect } from 'next/navigation';

export default function ModernLoginRedirectPage() {
  redirect('/auth?mode=login');
}
