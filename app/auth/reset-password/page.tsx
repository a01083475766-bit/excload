'use client';

import { FormEvent, useState } from 'react';
import { formatPhoneForInput } from '@/app/utils/format-phone';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck, Smartphone, X, Search } from 'lucide-react';

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
  const [findEmailOpen, setFindEmailOpen] = useState(false);
  const [findEmailPhone, setFindEmailPhone] = useState('');
  const [findEmailLoading, setFindEmailLoading] = useState(false);
  const [findEmailError, setFindEmailError] = useState('');
  const [findEmailResult, setFindEmailResult] = useState<string | null>(null);

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

  const openFindEmailModal = () => {
    setFindEmailOpen(true);
    setFindEmailPhone('');
    setFindEmailError('');
    setFindEmailResult(null);
  };

  const closeFindEmailModal = () => {
    setFindEmailOpen(false);
    setFindEmailLoading(false);
  };

  const handleFindEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFindEmailError('');
    setFindEmailResult(null);

    const phoneDigits = findEmailPhone.replace(/[^0-9]/g, '');
    const phoneOk = /^\d{10}$/.test(phoneDigits) || /^01[016789]\d{8}$/.test(phoneDigits);
    if (!phoneDigits || !phoneOk) {
      setFindEmailError('휴대폰 번호 10~11자리(010, 011 등)를 올바르게 입력해주세요.');
      return;
    }

    setFindEmailLoading(true);
    try {
      const res = await fetch('/api/auth/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFindEmailError(data.error || '조회에 실패했습니다.');
        return;
      }
      if (data.success && data.maskedEmail) {
        setFindEmailResult(data.maskedEmail);
      } else {
        setFindEmailError('결과를 불러올 수 없습니다.');
      }
    } catch {
      setFindEmailError('네트워크 오류가 발생했습니다.');
    } finally {
      setFindEmailLoading(false);
    }
  };

  return (
    <>
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
            <button type="button" onClick={openFindEmailModal} className="font-semibold underline">
              이메일 찾기
            </button>
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
            <button
              type="button"
              onClick={openFindEmailModal}
              className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              이메일 찾기
            </button>
          </div>
        </div>
      </div>
    </div>
    {findEmailOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-email-title"
        onClick={closeFindEmailModal}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 id="find-email-title" className="text-lg font-semibold text-gray-900">
                이메일 찾기
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                가입 시 등록하신 휴대폰 번호로 이메일 힌트를 확인할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={closeFindEmailModal}
              className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleFindEmailSubmit} className="space-y-4">
            <div>
              <label htmlFor="find-email-phone" className="mb-2 block text-sm font-medium text-gray-700">
                휴대폰 번호
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
                <input
                  id="find-email-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={findEmailPhone}
                  onChange={(e) => setFindEmailPhone(formatPhoneForInput(e.target.value))}
                  maxLength={13}
                  className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                  placeholder="010-1234-5678"
                  disabled={findEmailLoading}
                />
              </div>
            </div>

            {findEmailError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {findEmailError}
              </div>
            )}

            {findEmailResult && (
              <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-sm font-medium text-indigo-900">
                  입력하신 번호로 가입된 이메일 힌트입니다
                </p>
                <p className="font-mono text-base font-semibold break-all text-gray-900">
                  {findEmailResult}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeFindEmailModal}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={findEmailLoading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {findEmailLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                조회
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
