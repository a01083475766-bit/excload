import { redirect } from 'next/navigation';

/** /login → 기존 로그인 흐름(/auth/login)으로 통일 */
export default function LoginAliasPage() {
  redirect('/auth/login');
}
