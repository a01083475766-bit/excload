/**
 * 로그인/회원가입 통합 페이지
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 기존 사용자는 로그인, 신규 사용자는 회원가입을 할 수 있는 통합 페이지입니다.
 */

'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, LogIn, UserPlus, Loader2, Eye, EyeOff } from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const fetchUser = useUserStore((state) => state.fetchUser);
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // URL 쿼리 파라미터 변경 시 모드 업데이트
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlMode = new URLSearchParams(window.location.search).get('mode') as AuthMode | null;
    if (urlMode === 'signup' || urlMode === 'login') {
      setMode(urlMode);
    }
  }, []);

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

    try {
      // 비밀번호 해시화 (실제로는 서버에서 처리하는 것이 좋지만, 임시로 클라이언트에서 처리)
      // ⚠️ 실제 구현 시에는 서버에서 bcrypt 등을 사용하여 해시화
      const passwordHash = btoa(password); // 임시 인코딩 (실제로는 해시 필요)

      const deviceId = getDeviceId();

      // /api/user/create 호출
      const response = await fetch('/api/user/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          passwordHash,
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

      setSuccess(true);
      // 회원가입 성공 후 자동으로 로그인 모드로 전환하고 로그인 시도
      setTimeout(async () => {
        setMode('login');
        setConfirmPassword('');
        setSuccess(false);
        // 자동 로그인 시도
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('회원가입은 완료되었지만 자동 로그인에 실패했습니다. 로그인해주세요.');
        } else {
          await fetchUser();
          router.push('/');
          router.refresh();
        }
      }, 1500);
    } catch (err) {
      setError('회원가입 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  // 모드 전환 시 폼 초기화 및 URL 업데이트
  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setSuccess(false);
    setPassword('');
    setConfirmPassword('');
    setShowLoginPassword(false);
    setShowSignupPassword(false);
    setShowConfirmPassword(false);
    // URL 쿼리 파라미터 업데이트
    router.replace(`/auth?mode=${newMode}`, { scroll: false });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
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
                    disabled={isLoading || success}
                  />
                </div>
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
                    disabled={isLoading || success}
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
                    disabled={isLoading || success}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirmPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    disabled={isLoading || success}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || success}
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
            </form>
          )}

          {/* 심사·체험 안내 (로그인·회원가입 공통) */}
          {(mode === 'login' || mode === 'signup') && (
            <div className="mt-6 space-y-2 rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-600">심사·체험 안내</p>
              <p className="text-xs leading-relaxed text-gray-500">
                별도로 정해 드리는 테스트 계정은 없습니다. 이메일 형식만 올바르면 원하시는 임의의
                주소로 회원가입하시면 되며, 이메일 인증 절차는 없습니다.
              </p>
              <p className="text-xs leading-relaxed text-gray-500">
                가입 시 입력하신 이메일과 비밀번호로 바로 로그인하여 이용해 주세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
