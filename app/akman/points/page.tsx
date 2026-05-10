/**
 * EXCLOAD 관리자 사용량 로그 페이지
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 보안 규칙:
 * 1. 로그인된 사용자만 접근 가능
 * 2. isAdminEmail(session) 과 동일 기준 (ADMIN_EMAIL·고정 관리자 계정)
 * 3. 관리자가 아니면 "/" 로 redirect
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PointLogPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/');
  }

  if (!isAdminEmail(session.user.email)) {
    redirect('/');
  }

  // 사용량 로그 조회
  const logs = await prisma.pointHistory.findMany({
    include: {
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  });

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/akman"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            marginRight: '20px',
          }}
        >
          ← 관리자 페이지로 돌아가기
        </Link>
      </div>

      <h1 style={{ marginBottom: '20px' }}>Usage History</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        총 {logs.length}개의 사용량 로그 (최근 100개)
      </p>

      <table
        style={{
          marginTop: '20px',
          borderCollapse: 'collapse',
          width: '100%',
          border: '1px solid #ccc',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              User Email
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'right' }}>
              Change
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              Reason
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              Date
            </th>
          </tr>
        </thead>

        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #ccc',
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999',
                }}
              >
                사용량 로그가 없습니다.
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id}>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {log.user?.email || '알 수 없음'}
                </td>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: '12px',
                    textAlign: 'right',
                    color: log.change >= 0 ? 'green' : 'red',
                    fontWeight: 'bold',
                  }}
                >
                  {log.change >= 0 ? '+' : ''}
                  {log.change.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {log.reason}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {new Date(log.createdAt).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
