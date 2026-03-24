/**
 * NextAuth 설정 파일
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

/**
 * NextAuth 옵션 설정
 * 
 * ⚠️ Google Provider는 현재 제외 (모듈 해석 문제로 인해)
 * 필요시 나중에 추가 가능
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
          // Prisma를 사용하여 DB에서 사용자 조회
          const { prisma } = await import('@/app/lib/prisma');
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            select: {
              id: true,
              email: true,
              passwordHash: true,
              name: true,
              emailVerified: true, // 이메일 인증 상태 확인
            },
          });

          console.log('[Auth] LOGIN ATTEMPT:', {
            email: credentials.email,
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
            ];

            const testUser = testUsers.find(
              (u) => u.email === credentials.email && u.password === credentials.password
            );

            if (testUser) {
              console.log('[Auth] TEST USER LOGIN:', testUser.email);
              return {
                id: testUser.id,
                email: testUser.email,
                name: testUser.name,
              };
            }

            console.log('[Auth] USER NOT FOUND:', credentials.email);
            return null;
          }

          // 이메일 인증 확인 (개발 단계에서는 임시 비활성화)
          if (!user.emailVerified) {
            console.log('[Auth] EMAIL NOT VERIFIED - DEV MODE ALLOW LOGIN:', user.email);
            // 개발 단계에서는 이메일 인증 체크 비활성화
            // throw new Error('이메일 인증이 필요합니다. 이메일을 확인해주세요.');
          }

          // 비밀번호 검증
          // 현재는 btoa로 인코딩된 비밀번호를 사용하므로 동일한 방식으로 비교
          // ⚠️ 실제 프로덕션에서는 bcrypt.compare() 사용 권장
          const inputPasswordHash = btoa(credentials.password);
          const passwordMatch = user.passwordHash && user.passwordHash === inputPasswordHash;
          
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
  ],

  // Session 전략: JWT 사용 (DB가 없으므로)
  session: {
    strategy: 'jwt',
  },

  // JWT 설정
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
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

  // 보안 설정
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-in-production',
};
