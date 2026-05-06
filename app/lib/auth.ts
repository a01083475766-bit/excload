/**
 * NextAuth 설정 파일
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

if (!process.env.NEXTAUTH_SECRET) {
  console.warn(
    '[Auth] NEXTAUTH_SECRET missing — 운영 배포 전 반드시 설정하세요. (로컬 빌드용 임시 시크릿 사용)'
  );
}

const AKMAN_ADMIN_EMAIL = 'akman@excload.com';
const AKMAN_ADMIN_BCRYPT_HASH = '$2b$10$WP8wPfSr5v/HHQlo0pf9I.piql9e9PLm/NJZ2trg4o2Q8GJgHUvtm';

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

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

          if (normalizedEmail === AKMAN_ADMIN_EMAIL) {
            // 관리자 계정은 DB 상태와 무관하게 로그인 가능하도록 우선 비밀번호를 직접 검증한다.
            const { compare } = await import('bcryptjs');
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

          console.log('[Auth] LOGIN ATTEMPT:', {
            email: normalizedEmail,
            userFound: !!user,
            userEmail: user?.email,
            hasPasswordHash: !!user?.passwordHash,
            emailVerified: user?.emailVerified,
          });

          if (!user) {
            // DB에 없으면 하드코딩된 테스트 사용자 확인 (하위 호환성)
            const testUsers = [
              {
                id: '1',
                email: 'test@example.com',
                password: 'test1234',
                name: 'Test User',
              },
              {
                id: 'seed-test-a1234',
                email: 'a1234@naver.com',
                password: '123456',
                name: 'Test Account',
              },
            ];

            const testUser = testUsers.find(
              (u) => u.email === normalizedEmail && u.password === credentials.password
            );

            if (testUser) {
              console.log('[Auth] TEST USER LOGIN:', testUser.email);
              return {
                id: testUser.id,
                email: testUser.email,
                name: testUser.name,
              };
            }

            console.log('[Auth] USER NOT FOUND:', normalizedEmail);
            return null;
          }

          // 이메일 인증 확인 (개발 단계에서는 임시 비활성화)
          if (!user.emailVerified) {
            console.log('[Auth] EMAIL NOT VERIFIED - DEV MODE ALLOW LOGIN:', user.email);
            // 개발 단계에서는 이메일 인증 체크 비활성화
            // throw new Error('이메일 인증이 필요합니다. 이메일을 확인해주세요.');
          }

          // 비밀번호 검증
          // - 신규/관리자 계정: bcrypt
          // - 기존 계정 하위호환: btoa
          const inputPasswordHash = btoa(credentials.password);
          const storedHash = user.passwordHash || '';
          let passwordMatch = false;
          if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
            const { compare } = await import('bcryptjs');
            passwordMatch = await compare(credentials.password, storedHash);
          } else {
            passwordMatch = storedHash === inputPasswordHash;
          }
          
          console.log('[Auth] PASSWORD CHECK:', {
            email: user.email,
            hasStoredHash: !!user.passwordHash,
            storedHashLength: user.passwordHash?.length,
            inputHashLength: inputPasswordHash.length,
            passwordMatch,
          });
          
          if (passwordMatch) {
            console.log('[Auth] LOGIN SUCCESS:', user.email);
            return {
              id: user.id,
              email: user.email,
              name: user.name || null,
            };
          }

          console.log('[Auth] PASSWORD MISMATCH:', user.email);
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
  ],

  // Session 전략: JWT 사용 (DB가 없으므로)
  session: {
    strategy: 'jwt',
  },

  // JWT 설정
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') {
        return true;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return false;
      }

      try {
        const { prisma } = await import('@/app/lib/prisma');
        await prisma.user.upsert({
          where: { email },
          update: {
            name: user.name ?? undefined,
            image: user.image ?? undefined,
            emailVerified: new Date(),
          },
          create: {
            email,
            name: user.name ?? null,
            image: user.image ?? null,
            emailVerified: new Date(),
          },
        });
        return true;
      } catch (error) {
        console.error('[Auth] GOOGLE SIGNIN UPSERT FAILED:', error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }

      if (!token.id && token.email) {
        try {
          const { prisma } = await import('@/app/lib/prisma');
          const existingUser = await prisma.user.findUnique({
            where: { email: token.email },
            select: { id: true, name: true },
          });
          if (existingUser) {
            token.id = existingUser.id;
            token.name = existingUser.name ?? token.name;
          }
        } catch (error) {
          console.error('[Auth] JWT USER LOOKUP FAILED:', error);
        }
      }
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

  // 보안 설정 — NEXTAUTH_SECRET 미설정 시에만 임시값(빌드 통과용). 운영에서는 반드시 환경 변수 설정.
  secret:
    process.env.NEXTAUTH_SECRET?.trim() ||
    'dev-only-insecure-nextauth-secret-set-NEXTAUTH_SECRET-in-production',
};
