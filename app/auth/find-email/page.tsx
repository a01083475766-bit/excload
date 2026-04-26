'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Phone } from 'lucide-react';

export default function FindEmailPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  const handleFindEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMaskedEmail('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/find-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || '이메일 조회 중 오류가 발생했습니다.');
        return;
      }

      setMaskedEmail(data.maskedEmail || '');
    } catch {
      setError('이메일 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">이메일 찾기</h1>
            <p className="text-gray-600 text-sm">가입한 휴대폰 번호로 이메일을 확인할 수 있습니다.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {maskedEmail && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              가입 이메일: <span className="font-semibold">{maskedEmail}</span>
            </div>
          )}

          <form onSubmit={handleFindEmail} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                휴대폰 번호
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="01012345678"
                  disabled={isLoading}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">하이픈 없이 숫자만 입력해 주세요.</p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>조회 중...</span>
                </>
              ) : (
                <span>가입 이메일 찾기</span>
              )}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            <button
              type="button"
              onClick={() => router.push('/auth/reset-password')}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              비밀번호 재설정으로 돌아가기
            </button>
            <Link href="/auth?mode=login" className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline">
              로그인 화면으로 이동
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
