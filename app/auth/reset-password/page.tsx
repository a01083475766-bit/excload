'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setInfoMessage('');
    setIsRequestingCode(true);

    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '인증코드 요청 중 오류가 발생했습니다.');
        return;
      }

      setIsCodeSent(true);
      setInfoMessage(data.message || '이메일로 인증코드가 발송되었습니다.');
    } catch {
      setError('인증코드 요청 중 오류가 발생했습니다.');
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code,
          newPassword,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '비밀번호 변경 중 오류가 발생했습니다.');
        return;
      }

      setSuccessMessage(data.message || '비밀번호가 변경되었습니다.');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        router.push('/auth?mode=login');
      }, 1200);
    } catch {
      setError('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">비밀번호 재설정</h1>
            <p className="text-gray-600 text-sm">이메일 인증코드로 비밀번호를 다시 설정할 수 있습니다.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 text-sm">
              {infoMessage}
            </div>
          )}

          <div className="mb-4 rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-indigo-700">
            가입 이메일이 기억나지 않으시면{' '}
            <Link href="/auth/find-email" className="font-semibold underline">
              이메일 찾기
            </Link>
            를 먼저 이용해 주세요.
          </div>

          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                가입 이메일
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="email@example.com"
                  disabled={isRequestingCode || isSubmitting}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isRequestingCode || isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isRequestingCode ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>코드 요청 중...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>{isCodeSent ? '코드 다시 받기' : '코드 받기'}</span>
                </>
              )}
            </button>
          </form>

          <form onSubmit={handleResetPassword} className="space-y-4 mt-6">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                인증코드(6자리)
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="6자리 숫자"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                새 비밀번호
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="최소 6자 이상"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                새 비밀번호 확인
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="비밀번호를 다시 입력하세요"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showConfirmPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isRequestingCode}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>변경 중...</span>
                </>
              ) : (
                <span>비밀번호 변경</span>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => router.push('/auth?mode=login')}
            className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
          >
            로그인 화면으로 돌아가기
          </button>
          <div className="mt-2 text-center">
            <Link href="/auth/find-email" className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline">
              이메일 찾기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
