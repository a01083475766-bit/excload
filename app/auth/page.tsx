/**
 * 로그인/회원가입 통합 페이지
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 기존 사용자는 로그인, 신규 사용자는 회원가입을 할 수 있는 통합 페이지입니다.
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, LogIn, UserPlus, Loader2, Eye, EyeOff, Smartphone, X, Search } from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';
import { formatPhoneForInput } from '@/app/utils/format-phone';

type AuthMode = 'login' | 'signup';

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fetchUser = useUserStore((state) => state.fetchUser);
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [signupStep, setSignupStep] = useState<'input' | 'verify'>('input');
  const [signupCode, setSignupCode] = useState('');
  const [signupVerifyMessage, setSignupVerifyMessage] = useState('');
  const [isAutoLoggingInAfterSignup, setIsAutoLoggingInAfterSignup] = useState(false);
  const [signupLockedPassword, setSignupLockedPassword] = useState('');

  const [findEmailOpen, setFindEmailOpen] = useState(false);
  const [findEmailPhone, setFindEmailPhone] = useState('');
  const [findEmailLoading, setFindEmailLoading] = useState(false);
  const [findEmailError, setFindEmailError] = useState('');
  const [findEmailResult, setFindEmailResult] = useState<string | null>(null);

  const getAuthErrorMessage = (errorCode: string | null): string => {
    switch (errorCode) {
      case 'OAuthAccountNotLinked':
        return '이미 다른 로그인 방식으로 가입된 이메일입니다. 기존 방식으로 로그인해주세요.';
      case 'AccessDenied':
        return '로그인이 취소되었거나 권한이 거부되었습니다.';
      case 'OAuthCallback':
        return 'Google 로그인 콜백 단계에서 실패했습니다. 주소창이 excload.com(www 없음)이면 www.excload.com으로 접속한 뒤 다시 시도해주세요. 계속되면 Vercel의 NEXTAUTH_URL이 https://www.excload.com 과 일치하는지 확인해주세요.';
      case 'OAuthSignin':
      case 'OAuthCreateAccount':
        return 'Google 로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      default:
        return '로그인 처리 중 오류가 발생했습니다.';
    }
  };

  // URL 쿼리 파라미터 변경 시 모드/에러 업데이트
  useEffect(() => {
    const urlMode = searchParams.get('mode') as AuthMode | null;
    if (urlMode === 'signup' || urlMode === 'login') {
      setMode(urlMode);
    }

    const authError = searchParams.get('error');
    if (authError) {
      setError(getAuthErrorMessage(authError));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!findEmailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFindEmailOpen(false);
        setFindEmailLoading(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [findEmailOpen]);

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

  const handleFindEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFindEmailError('');
    setFindEmailResult(null);

    const phoneDigits = findEmailPhone.replace(/[^0-9]/g, '');
    const phoneOk =
      /^\d{10}$/.test(phoneDigits) || /^01[016789]\d{8}$/.test(phoneDigits);
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

  const getDeviceId = () => {
    if (typeof window === 'undefined') return undefined;

    try {
      let deviceId = window.localStorage.getItem('deviceId');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        window.localStorage.setItem('deviceId', deviceId);
      }
      return deviceId;
    } catch {
      return undefined;
    }
  };

  // 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        setIsLoading(false);
      } else {
        // 로그인 성공 시 사용자 정보 가져오기
        await fetchUser();
        // 홈으로 리다이렉트
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    await signIn('google', { callbackUrl: '/' });
  };

  // 회원가입 처리
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 유효성 검사
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      setIsLoading(false);
      return;
    }

    const phoneDigits = phone.replace(/[^0-9]/g, '');
    const phoneOk =
      /^\d{10}$/.test(phoneDigits) || /^01[016789]\d{8}$/.test(phoneDigits);
    if (!phoneDigits || !phoneOk) {
      setError('휴대폰 번호 10~11자리(010, 011 등)를 올바르게 입력해주세요.');
      setIsLoading(false);
      return;
    }

    try {
      const deviceId = getDeviceId();

      const response = await fetch('/api/auth/signup/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          phone: phoneDigits,
          password,
          plan: 'FREE', // 기본값: 무료 회원
          deviceId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || '회원가입 중 오류가 발생했습니다.');
        setIsLoading(false);
        return;
      }

      setSignupStep('verify');
      setSignupLockedPassword(password);
      setSignupVerifyMessage(data.message || '가입한 이메일로 코드를 보냈습니다. 코드를 입력해주세요.');
    } catch (err) {
      setError('회원가입 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
    setIsLoading(false);
  };

  const handleSignupVerify = async () => {
    setError('');
    setSuccess(false);
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/signup/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code: signupCode,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || '인증코드 확인 중 오류가 발생했습니다.');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);
      setIsAutoLoggingInAfterSignup(true);
      setSignupStep('input');
      setSignupCode('');
      setSignupVerifyMessage('');
      const result = await signIn('credentials', {
        email,
        password: signupLockedPassword || password,
        redirect: false,
      });

      if (result?.error) {
        setIsAutoLoggingInAfterSignup(false);
        setError('회원가입은 완료되었지만 자동 로그인에 실패했습니다. 로그인해주세요.');
      } else {
        await fetchUser();
        router.push('/order-convert');
        router.refresh();
      }
    } catch {
      setError('인증코드 확인 중 오류가 발생했습니다.');
      setIsLoading(false);
      setIsAutoLoggingInAfterSignup(false);
    }
  };

  // 모드 전환 시 폼 초기화 및 URL 업데이트
  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setSuccess(false);
    setSignupStep('input');
    setSignupCode('');
    setSignupVerifyMessage('');
    setIsAutoLoggingInAfterSignup(false);
    setSignupLockedPassword('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setShowLoginPassword(false);
    setShowSignupPassword(false);
    setShowConfirmPassword(false);
    // URL 쿼리 파라미터 업데이트
    router.replace(`/auth?mode=${newMode}`, { scroll: false });
  };

  return (
    <>
    <div className="min-h-screen flex items-start justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 pt-24 pb-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* 탭 전환 버튼 */}
          <div className="flex gap-2 mb-8 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleModeChange('login')}
              className={`
                flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors
                ${mode === 'login'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('signup')}
              className={`
                flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors
                ${mode === 'signup'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
            >
              회원가입
            </button>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {mode === 'login' ? '로그인' : '회원가입'}
            </h1>
            <p className="text-gray-600">
              {mode === 'login'
                ? '엑클로드에 오신 것을 환영합니다'
                : '새로운 계정을 만드세요'
              }
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && mode === 'signup' && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              회원가입이 완료되었습니다. 자동으로 로그인합니다...
            </div>
          )}

          {/* 로그인 폼 */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  이메일 또는 아이디
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    pattern=".*"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="이메일"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  비밀번호
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="password"
                    type={showLoginPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="비밀번호를 입력하세요"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showLoginPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    disabled={isLoading}
                  >
                    {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>로그인 중...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>로그인</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Google로 로그인</span>
              </button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={openFindEmailModal}
                  disabled={isLoading}
                  className="text-left text-sm text-indigo-600 hover:text-indigo-700 hover:underline disabled:opacity-50"
                >
                  이메일 찾기
                </button>
                <Link
                  href="/auth/reset-password"
                  className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline sm:text-right"
                >
                  비밀번호를 잊으셨나요?
                </Link>
              </div>
            </form>
          )}

          {/* 회원가입 폼 */}
          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-2">
                  이메일
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="email@example.com"
                    disabled={isLoading || success || signupStep === 'verify'}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-phone" className="block text-sm font-medium text-gray-700 mb-2">
                  휴대폰 번호
                </label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="signup-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    name="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneForInput(e.target.value))}
                    maxLength={13}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="010-1234-5678"
                    disabled={isLoading || success || signupStep === 'verify'}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  이메일 찾기·계정 보호에 사용됩니다. 하이픈은 입력 시 자동으로 맞춰집니다.
                </p>
              </div>

              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-2">
                  비밀번호
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="signup-password"
                    type={showSignupPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="최소 6자 이상"
                    disabled={isLoading || success}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showSignupPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    disabled={isLoading || success || signupStep === 'verify'}
                  >
                    {showSignupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  비밀번호 확인
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="비밀번호를 다시 입력하세요"
                    disabled={isLoading || success || signupStep === 'verify'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirmPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    disabled={isLoading || success || signupStep === 'verify'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || success || signupStep === 'verify' || isAutoLoggingInAfterSignup}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>처리 중...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    <span>회원가입</span>
                  </>
                )}
              </button>

              {signupStep === 'verify' && (
                <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                  <p className="text-sm text-indigo-700">
                    {signupVerifyMessage || '가입한 이메일로 코드를 보냈습니다. 코드를 입력해주세요.'}
                  </p>
                  <div>
                    <label htmlFor="signup-code" className="block text-sm font-medium text-gray-700 mb-2">
                      회원가입 인증코드
                    </label>
                    <input
                      id="signup-code"
                      type="text"
                      value={signupCode}
                      onChange={(e) => setSignupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="6자리 숫자"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSignupStep('input');
                        setSignupCode('');
                        setSignupVerifyMessage('');
                        setSignupLockedPassword('');
                      }}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={handleSignupVerify}
                      disabled={isLoading || signupCode.length !== 6}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? '확인 중...' : '확인'}
                    </button>
                  </div>
                </div>
              )}

              {isAutoLoggingInAfterSignup && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  회원가입 및 인증이 완료되었습니다. 자동 로그인 진행 중입니다. 잠시만 기다려주세요.
                </div>
              )}
            </form>
          )}

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

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageContent />
    </Suspense>
  );
}
