/**
 * NextAuth 설정 파일
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import KakaoProvider from 'next-auth/providers/kakao';
import NaverProvider from 'next-auth/providers/naver';

// redirect_uri 조립 시 끝 슬래시가 있으면 OAuth 토큰 교환 단계에서 실패할 수 있음
(() => {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (raw?.endsWith('/')) {
    process.env.NEXTAUTH_URL = raw.replace(/\/+$/, '');
    console.warn('[Auth] NEXTAUTH_URL 끝 슬래시 제거됨 (OAuth redirect_uri 일치용)');
  }
})();

if (!process.env.NEXTAUTH_SECRET) {
  console.warn(
    '[Auth] NEXTAUTH_SECRET missing — 운영 배포 전 반드시 설정하세요. (로컬 빌드용 임시 시크릿 사용)'
  );
}

const AKMAN_ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
const AKMAN_ADMIN_BCRYPT_HASH = process.env.ADMIN_BCRYPT_HASH?.trim() || '';

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const kakaoClientId = process.env.KAKAO_CLIENT_ID?.trim();
const kakaoClientSecret = process.env.KAKAO_CLIENT_SECRET?.trim();
const naverClientId = process.env.NAVER_CLIENT_ID?.trim();
const naverClientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
const enableAuthPerfLog = process.env.NEXTAUTH_DEBUG_PERF === 'true';

function perfNowMs() {
  return Date.now();
}

function perfLog(label: string, startedAtMs: number, extra?: Record<string, unknown>) {
  if (!enableAuthPerfLog) return;
  const elapsedMs = perfNowMs() - startedAtMs;
  console.log(`[Auth][Perf] ${label}: ${elapsedMs}ms`, extra || {});
}

function mapProviderToDb(provider: string | null | undefined): 'CREDENTIALS' | 'GOOGLE' | 'KAKAO' | 'NAVER' | 'UNKNOWN' {
  if (provider === 'credentials') return 'CREDENTIALS';
  if (provider === 'google') return 'GOOGLE';
  if (provider === 'kakao') return 'KAKAO';
  if (provider === 'naver') return 'NAVER';
  return 'UNKNOWN';
}

/**
 * NextAuth 옵션 설정
 */
export const authOptions: NextAuthOptions = {
  providers: [
    // Credentials Provider (Email + Password)
    // ⚠️ 임시 구현: 실제 DB가 없으므로 하드코딩된 사용자만 허용
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'email@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const inputId = credentials.email.trim().toLowerCase();
          const normalizedEmail = inputId === 'akman' ? AKMAN_ADMIN_EMAIL : inputId;

          if (AKMAN_ADMIN_EMAIL && normalizedEmail === AKMAN_ADMIN_EMAIL) {
            // 관리자 계정은 DB 상태와 무관하게 로그인 가능하도록 우선 비밀번호를 직접 검증한다.
            const { compare } = await import('bcryptjs');
            if (!AKMAN_ADMIN_BCRYPT_HASH) {
              console.error('[Auth] ADMIN_BCRYPT_HASH missing');
              return null;
            }
            const adminPasswordMatch = await compare(credentials.password, AKMAN_ADMIN_BCRYPT_HASH);

            if (!adminPasswordMatch) {
              console.log('[Auth] AKMAN PASSWORD MISMATCH');
              return null;
            }

            let adminId = 'akman-admin';
            try {
              // 관리자 계정 보정: 배포 DB가 비어 있어도 관리자 계정을 보장.
              const { prisma } = await import('@/app/lib/prisma');
              const adminUser = await prisma.user.upsert({
                where: { email: AKMAN_ADMIN_EMAIL },
                update: {
                  plan: 'PRO',
                  passwordHash: AKMAN_ADMIN_BCRYPT_HASH,
                  emailVerified: new Date(),
                },
                create: {
                  email: AKMAN_ADMIN_EMAIL,
                  passwordHash: AKMAN_ADMIN_BCRYPT_HASH,
                  plan: 'PRO',
                  points: 999999999,
                  emailVerified: new Date(),
                },
                select: {
                  id: true,
                },
              });
              adminId = adminUser.id;
            } catch (dbError) {
              // DB 연결 실패 시에도 관리자 긴급 로그인은 허용한다.
              console.error('[Auth] AKMAN UPSERT FAILED (login allowed):', dbError);
            }

            console.log('[Auth] AKMAN LOGIN SUCCESS');
            return {
              id: adminId,
              email: AKMAN_ADMIN_EMAIL,
              name: 'AKMAN',
            };
          }

          // Prisma를 사용하여 DB에서 일반 사용자 조회
          const { prisma } = await import('@/app/lib/prisma');

          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
              id: true,
              email: true,
              passwordHash: true,
              name: true,
              emailVerified: true, // 이메일 인증 상태 확인
            },
          });

          console.log('[Auth] LOGIN ATTEMPT', {
            userFound: !!user,
            hasPasswordHash: !!user?.passwordHash,
            emailVerified: Boolean(user?.emailVerified),
          });

          if (!user) {
            console.log('[Auth] USER NOT FOUND');
            return null;
          }

          // 보안: 이메일 인증 전 계정은 로그인 차단
          if (!user.emailVerified) {
            console.log('[Auth] EMAIL NOT VERIFIED - LOGIN BLOCKED');
            return null;
          }

          // 비밀번호 검증: bcrypt 전용
          const storedHash = user.passwordHash || '';
          if (!(storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$'))) {
            console.warn('[Auth] LEGACY NON-BCRYPT HASH DETECTED');
            return null;
          }
          const { compare } = await import('bcryptjs');
          const passwordMatch = await compare(credentials.password, storedHash);
          
          console.log('[Auth] PASSWORD CHECK', {
            hasStoredHash: !!user.passwordHash,
            storedHashLength: user.passwordHash?.length,
            passwordMatch,
          });
          
          if (passwordMatch) {
            console.log('[Auth] LOGIN SUCCESS');
            try {
              await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginProvider: 'CREDENTIALS' },
              });
            } catch (updateError) {
              console.error('[Auth] LAST LOGIN PROVIDER UPDATE FAILED:', updateError);
            }
            return {
              id: user.id,
              email: user.email,
              name: user.name || null,
            };
          }

          console.log('[Auth] PASSWORD MISMATCH');
          return null;
        } catch (error) {
          console.error('[Auth] 사용자 인증 오류:', error);
          return null;
        }
      },
    }),
    ...(googleClientId && googleClientSecret
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : []),
    ...(kakaoClientId && kakaoClientSecret
      ? [
          KakaoProvider({
            clientId: kakaoClientId,
            clientSecret: kakaoClientSecret,
          }),
        ]
      : []),
    ...(naverClientId && naverClientSecret
      ? [
          NaverProvider({
            clientId: naverClientId,
            clientSecret: naverClientSecret,
          }),
        ]
      : []),
  ],

  // Session 전략: JWT 사용 (DB가 없으므로)
  session: {
    strategy: 'jwt',
    // 엑클로드 로그인 유지 기간(초): 30일
    maxAge: 30 * 24 * 60 * 60,
    // 세션 갱신 주기(초): 24시간
    updateAge: 24 * 60 * 60,
  },
  jwt: {
    // JWT도 세션과 동일하게 30일 유지
    maxAge: 30 * 24 * 60 * 60,
  },

  // JWT 설정
  callbacks: {
    async signIn({ user, account }) {
      const startedAt = perfNowMs();
      const isSocialProvider =
        account?.provider === 'google' ||
        account?.provider === 'kakao' ||
        account?.provider === 'naver';
      if (!isSocialProvider) {
        perfLog('signIn(credentials)', startedAt);
        return true;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) {
        perfLog('signIn(social-no-email)', startedAt, { provider: account?.provider });
        return false;
      }

      // Google 인증은 통과시킨 뒤, DB 보정은 jwt 단계에서 재시도한다.
      // signIn에서 false를 반환하면 OAuth 완료 후 로그인 페이지로 되돌아간다.
      perfLog('signIn(social-pass)', startedAt, { provider: account?.provider });
      return true;
    },
    async jwt({ token, user, account }) {
      const startedAt = perfNowMs();
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }

      const tokenEmail =
        typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
      // jwt 콜백은 세션 확인 시에도 자주 실행되므로,
      // 사용자 DB 동기화는 실제 로그인(sign-in) 타이밍에만 수행한다.
      const shouldSyncUser = Boolean(user) || Boolean(account);
      if (tokenEmail && shouldSyncUser) {
        try {
          const { prisma } = await import('@/app/lib/prisma');
          const providerDbValue = mapProviderToDb(account?.provider);
          const updateData =
            providerDbValue === 'UNKNOWN' ? {} : { lastLoginProvider: providerDbValue };
          const dbStartedAt = perfNowMs();

          const existingUser = await prisma.user.findUnique({
            where: { email: tokenEmail },
            select: { id: true, name: true },
          });

          if (existingUser) {
            const ensuredUser = await prisma.user.update({
              where: { email: tokenEmail },
              data: updateData,
              select: { id: true, name: true },
            });
            token.id = ensuredUser.id;
            token.name = ensuredUser.name ?? token.name;
          } else {
            const ensuredUser = await prisma.user.create({
              data: {
                email: tokenEmail,
                name: typeof token.name === 'string' ? token.name : null,
                emailVerified: new Date(),
                signupProvider: providerDbValue === 'UNKNOWN' ? 'CREDENTIALS' : providerDbValue,
                lastLoginProvider: providerDbValue === 'UNKNOWN' ? 'CREDENTIALS' : providerDbValue,
                points: 0,
                signupBonusClaimed: false,
                nextPointDate: null,
              },
              select: { id: true, name: true },
            });
            token.id = ensuredUser.id;
            token.name = ensuredUser.name ?? token.name;
          }

          perfLog('jwt.user-upsert', dbStartedAt, {
            email: tokenEmail,
            provider: account?.provider ?? null,
          });
        } catch (error) {
          console.error('[Auth] JWT USER UPSERT FAILED:', error);
        }
      }
      perfLog('jwt.total', startedAt, {
        hasUser: Boolean(user),
        hasAccount: Boolean(account),
      });
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },

  // 페이지 설정
  pages: {
    signIn: '/auth/login',
    signOut: '/auth/login',
    error: '/auth/login',
  },

  /** Vercel에 NEXTAUTH_DEBUG=true 넣으면 Functions 로그에 OAuth 상세가 남음(해결 후 반드시 제거) */
  debug: process.env.NEXTAUTH_DEBUG === 'true',

  logger: {
    error(code, metadata) {
      const meta = metadata as Error | { error?: Error } | undefined;
      const nested =
        meta && typeof meta === 'object' && 'error' in meta
          ? (meta as { error?: Error }).error
          : meta instanceof Error
            ? meta
            : undefined;
      console.error('[NextAuth][error]', code, {
        message: nested instanceof Error ? nested.message : String(metadata),
        stack: nested instanceof Error ? nested.stack : undefined,
        metadata,
      });
    },
  },

  // 보안 설정
  secret:
    process.env.NEXTAUTH_SECRET?.trim() ||
    (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('[Auth] NEXTAUTH_SECRET is required in production.');
      }
      return 'dev-only-insecure-nextauth-secret-set-NEXTAUTH_SECRET-in-production';
    })(),
};
