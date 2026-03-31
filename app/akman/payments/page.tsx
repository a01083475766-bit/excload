/**
 * EXCLOAD 관리자 결제 내역 페이지
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 보안 규칙:
 * 1. 로그인된 사용자만 접근 가능
 * 2. session.user.email === process.env.ADMIN_EMAIL 인 경우만 접근 허용
 * 3. 관리자 이메일이 아니면 "/" 로 redirect
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Payment {
  id: string;
  userId: string;
  email: string;
  plan: string;
  amount: number;
  currency: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalPayments: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // 결제 내역 조회
  const fetchPayments = async (page: number = 1) => {
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', '20');

      const url = `/api/akman/payments?${params.toString()}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
        setPagination(data.pagination || null);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[Payments Page] 결제 내역 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments(1);
    setCurrentPage(1);
  }, [router]);

  // 페이지 변경 핸들러
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    fetchPayments(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/akman"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
            marginRight: '20px',
          }}
        >
          ← 관리자 페이지로 돌아가기
        </Link>
        <Link
          href="/akman/points"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          사용량 로그 →
        </Link>
      </div>

      <h1 style={{ marginBottom: '20px' }}>결제 내역</h1>

      <p style={{ color: '#666', marginBottom: '30px' }}>
        {pagination ? (
          <>
            총 결제 건수: {pagination.totalPayments.toLocaleString()}건
            {' | '}
            페이지 {pagination.page} / {pagination.totalPages}
            {' | '}
            표시: {payments.length}건
          </>
        ) : (
          <>총 결제 건수: {payments.length}건</>
        )}
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
              Email
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              Plan
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'right' }}>
              금액
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              통화
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              결제일
            </th>
          </tr>
        </thead>

        <tbody>
          {payments.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  border: '1px solid #ccc',
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999',
                }}
              >
                결제 내역이 없습니다.
              </td>
            </tr>
          ) : (
            payments.map((payment) => (
              <tr key={payment.id}>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>{payment.email}</td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>{payment.plan}</td>
                <td style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                  ₩{payment.amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>{payment.currency}</td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {new Date(payment.createdAt).toLocaleString('ko-KR', {
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

      {/* 페이지네이션 */}
      {pagination && pagination.totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginTop: '30px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => handlePageChange(1)}
            disabled={!pagination.hasPrevPage}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              backgroundColor: pagination.hasPrevPage ? '#0066cc' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: pagination.hasPrevPage ? 'pointer' : 'not-allowed',
            }}
          >
            처음
          </button>
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!pagination.hasPrevPage}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              backgroundColor: pagination.hasPrevPage ? '#0066cc' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: pagination.hasPrevPage ? 'pointer' : 'not-allowed',
            }}
          >
            이전
          </button>

          {/* 페이지 번호 표시 */}
          {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
            let pageNum: number;
            if (pagination.totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= pagination.totalPages - 2) {
              pageNum = pagination.totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  backgroundColor: currentPage === pageNum ? '#0066cc' : '#f8f9fa',
                  color: currentPage === pageNum ? 'white' : '#333',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: currentPage === pageNum ? 'bold' : 'normal',
                }}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!pagination.hasNextPage}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              backgroundColor: pagination.hasNextPage ? '#0066cc' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: pagination.hasNextPage ? 'pointer' : 'not-allowed',
            }}
          >
            다음
          </button>
          <button
            onClick={() => handlePageChange(pagination.totalPages)}
            disabled={!pagination.hasNextPage}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              backgroundColor: pagination.hasNextPage ? '#0066cc' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: pagination.hasNextPage ? 'pointer' : 'not-allowed',
            }}
          >
            마지막
          </button>
        </div>
      )}
    </div>
  );
}
