/**
 * EXCLOAD 관리자 페이지
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

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface User {
  id: string;
  email: string;
  plan: string;
  points: number;
  createdAt: string;
  emailVerified: boolean | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalUsers: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface Stats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  yearlyUsers: number;
  todayUsers: number;
  monthlyUsers: number;
  revenue: number;
  monthlyRevenue: number;
}

interface SuspiciousUser {
  id: string;
  email: string;
  plan: 'FREE' | 'PRO' | 'YEARLY' | 'UNKNOWN';
  deviceId: string;
  ip: string;
  signupCount: number;
  downloadCount: number;
  status: 'SUSPECT' | 'NORMAL';
}

export default function AkmanPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [revenueData, setRevenueData] = useState<Array<{ month: string; revenue: number }>>([]);
  const [userData, setUserData] = useState<Array<{ month: string; users: number }>>([]);
  const [recentPayments, setRecentPayments] = useState<
    Array<{ id: string; email: string; plan: string; amount: number; createdAt: string }>
  >([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [suspiciousUsers, setSuspiciousUsers] = useState<SuspiciousUser[]>([]);
  const [selectedSuspiciousUserIds, setSelectedSuspiciousUserIds] = useState<string[]>([]);
  const [abuserSortKey, setAbuserSortKey] = useState<'signup' | 'download'>('signup');
  const [abuserSortOrder, setAbuserSortOrder] = useState<'desc' | 'asc'>('desc');
  const [aiMappingLogCount, setAiMappingLogCount] = useState<number>(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const [shouldScrollToTable, setShouldScrollToTable] = useState(false);
  const [isUserListExpanded, setIsUserListExpanded] = useState(false);
  const [isPaymentListExpanded, setIsPaymentListExpanded] = useState(false);
  const [isAbuserListExpanded, setIsAbuserListExpanded] = useState(false);
  const [activeFilter, setActiveFilter] = useState<{ type: string; value: string } | null>(null);

  const adminEmails = process.env.ADMIN_EMAIL?.split(',') || [];
  const isAdmin = adminEmails.includes((session?.user?.email || '').trim());

  // 통계 조회
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/akman/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('[Akman Page] 통계 조회 실패:', error);
      setStats({
        totalUsers: 0,
        freeUsers: 0,
        proUsers: 0,
        yearlyUsers: 0,
        todayUsers: 0,
        monthlyUsers: 0,
        revenue: 0,
        monthlyRevenue: 0,
      });
    }
  };

  // 사용자 목록 조회
  const fetchUsers = async (
    page: number = 1,
    search: string | null = null,
    scrollToTable: boolean = false,
    plan: string | null = null,
    date: string | null = null
  ) => {
    try {
      const params = new URLSearchParams();
      const searchValue = search !== null ? search.trim() : searchTerm.trim();
      if (searchValue) {
        params.append('search', searchValue);
      }
      if (plan) {
        params.append('plan', plan);
      }
      if (date) {
        params.append('date', date);
      }
      params.append('page', page.toString());
      params.append('pageSize', '20');

      const url = `/api/akman/users?${params.toString()}`;
      
      // 디버깅: 요청 URL 확인
      if (searchValue) {
        console.log('[Akman Page] 검색 요청:', searchValue);
        console.log('[Akman Page] 요청 URL:', url);
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        
        // 디버깅: 응답 데이터 확인
        if (searchValue) {
          console.log('[Akman Page] 검색 결과:', data.users?.length || 0, '명');
          console.log('[Akman Page] 검색된 이메일:', data.users?.map((u: User) => u.email) || []);
        }
        
        setUsers(data.users || []);
        setPagination(data.pagination || null);
        
        // 검색 후 테이블로 스크롤
        if (scrollToTable && tableRef.current) {
          setTimeout(() => {
            tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }
      }
    } catch (error) {
      console.error('[Akman Page] 사용자 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 월별 매출 조회
  const fetchRevenueData = async () => {
    try {
      const response = await fetch('/api/akman/revenue/monthly');
      if (response.ok) {
        const data = await response.json();
        setRevenueData(data);
      }
    } catch (error) {
      console.error('[Akman Page] 월별 매출 조회 실패:', error);
    }
  };

  // 월별 가입자 조회
  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/akman/users/monthly');
      if (response.ok) {
        const data = await response.json();
        setUserData(data);
      }
    } catch (error) {
      console.error('[Akman Page] 월별 가입자 조회 실패:', error);
    }
  };

  // 최근 결제 조회 (기본: 최근 30일, 최대 100건)
  const fetchRecentPayments = async () => {
    try {
      const response = await fetch('/api/akman/payments?page=1&pageSize=100&days=30');
      if (response.ok) {
        const data = await response.json();
        setRecentPayments(data.payments || []);
        // 결제 내역이 변경되면 선택 상태 초기화
        setSelectedPaymentIds([]);
      }
    } catch (error) {
      console.error('[Akman Page] 최근 결제 조회 실패:', error);
    }
  };

  // AI 매핑 로그 개수 조회
  const fetchAiMappingLogCount = async () => {
    try {
      const response = await fetch('/api/akman/ai-mapping');
      if (response.ok) {
        const data = await response.json();
        setAiMappingLogCount(Array.isArray(data) ? data.length : 0);
      }
    } catch (error) {
      console.error('[Akman Page] AI 매핑 로그 개수 조회 실패:', error);
      setAiMappingLogCount(0);
    }
  };

  // 어뷰저(의심 사용자) 목록 조회
  const fetchSuspiciousUsers = async () => {
    try {
      const response = await fetch('/api/akman/abusers');
      if (response.ok) {
        const data = await response.json();
        // API가 아직 없으면 더미 데이터 사용
        if (Array.isArray(data) && data.length > 0) {
          setSuspiciousUsers(
            data.map((item: any, index: number) => ({
              id: item.id ?? String(index),
              email: item.email ?? 'unknown',
              plan: (item.plan as SuspiciousUser['plan']) ?? 'UNKNOWN',
              deviceId: item.deviceId ?? '-',
              ip: item.ip ?? '-',
              signupCount: item.signupCount ?? 0,
              downloadCount: item.downloadCount ?? 0,
              status: item.status === 'SUSPECT' ? 'SUSPECT' : 'NORMAL',
            }))
          );
          setSelectedSuspiciousUserIds([]);
        } else {
          // 빈 배열이면 그대로 유지
          setSuspiciousUsers([]);
          setSelectedSuspiciousUserIds([]);
        }
      } else {
        // API 미구현 등으로 404/500 이면 UI는 깨지지 않도록 더미 데이터 세팅
        setSuspiciousUsers([
          {
            id: 'demo-1',
            email: 'test1@gmail.com',
            plan: 'FREE',
            deviceId: 'abc123',
            ip: '1.1.1.1',
            signupCount: 5,
            downloadCount: 20,
            status: 'SUSPECT',
          },
          {
            id: 'demo-2',
            email: 'test2@gmail.com',
            plan: 'PRO',
            deviceId: 'abc123',
            ip: '1.1.1.1',
            signupCount: 3,
            downloadCount: 15,
            status: 'SUSPECT',
          },
        ]);
        setSelectedSuspiciousUserIds([]);
      }
    } catch (error) {
      console.error('[Akman Page] 어뷰저 목록 조회 실패:', error);
      // 에러 시에도 기본 데모 데이터로 UI는 유지
      setSuspiciousUsers([
        {
          id: 'demo-1',
          email: 'test1@gmail.com',
          plan: 'FREE',
          deviceId: 'abc123',
          ip: '1.1.1.1',
          signupCount: 5,
          downloadCount: 20,
          status: 'SUSPECT',
        },
        {
          id: 'demo-2',
          email: 'test2@gmail.com',
          plan: 'PRO',
          deviceId: 'abc123',
          ip: '1.1.1.1',
          signupCount: 3,
          downloadCount: 15,
          status: 'SUSPECT',
        },
      ]);
      setSelectedSuspiciousUserIds([]);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchUsers(1);
    fetchRevenueData();
    fetchUserData();
    fetchRecentPayments();
    fetchAiMappingLogCount();
    fetchSuspiciousUsers();
    setCurrentPage(1);
  }, [router]);

  const isAllPaymentsSelected =
    recentPayments.length > 0 && selectedPaymentIds.length === recentPayments.length;

  const handleTogglePayment = (paymentId: string) => {
    setSelectedPaymentIds((prev) =>
      prev.includes(paymentId) ? prev.filter((id) => id !== paymentId) : [...prev, paymentId]
    );
  };

  const handleToggleAllPayments = () => {
    if (recentPayments.length === 0) return;
    setSelectedPaymentIds((prev) =>
      prev.length === recentPayments.length ? [] : recentPayments.map((p) => p.id)
    );
  };

  const handleDeleteSelectedPayments = async () => {
    if (selectedPaymentIds.length === 0) {
      window.alert('삭제할 결제 내역을 선택하세요.');
      return;
    }

    if (!window.confirm(`${selectedPaymentIds.length}건의 결제 내역을 삭제하시겠습니까?`)) {
      return;
    }

    let failedCount = 0;
    for (const paymentId of selectedPaymentIds) {
      try {
        const res = await fetch(`/api/akman/payments/${paymentId}`, { method: 'DELETE' });
        if (!res.ok) {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    if (failedCount > 0) {
      window.alert(`일부 결제 내역(${failedCount}건)은 삭제하지 못했습니다.`);
    }

    await fetchRecentPayments();
  };

  const isAllSuspiciousUsersSelected =
    suspiciousUsers.length > 0 && selectedSuspiciousUserIds.length === suspiciousUsers.length;

  const handleToggleSuspiciousUser = (userId: string) => {
    setSelectedSuspiciousUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleAllSuspiciousUsers = () => {
    if (suspiciousUsers.length === 0) return;
    setSelectedSuspiciousUserIds((prev) =>
      prev.length === suspiciousUsers.length ? [] : suspiciousUsers.map((u) => u.id)
    );
  };

  const handleDeleteSelectedSuspiciousUsers = () => {
    if (selectedSuspiciousUserIds.length === 0) {
      window.alert('삭제할 항목을 선택하세요.');
      return;
    }

    if (!window.confirm(`${selectedSuspiciousUserIds.length}건의 어뷰저 항목을 목록에서 제거하시겠습니까?`)) {
      return;
    }

    setSuspiciousUsers((prev) => prev.filter((user) => !selectedSuspiciousUserIds.includes(user.id)));
    setSelectedSuspiciousUserIds([]);
  };

  const handleDeleteAllSuspiciousUsers = () => {
    if (suspiciousUsers.length === 0) {
      return;
    }

    if (!window.confirm(`어뷰저 감지 목록의 ${suspiciousUsers.length}건을 모두 제거하시겠습니까?`)) {
      return;
    }

    setSuspiciousUsers([]);
    setSelectedSuspiciousUserIds([]);
  };

  const handleDeleteAllPayments = async () => {
    if (recentPayments.length === 0) {
      return;
    }

    if (!window.confirm(`최근 결제 ${recentPayments.length}건을 모두 삭제하시겠습니까?`)) {
      return;
    }

    let failedCount = 0;
    for (const payment of recentPayments) {
      try {
        const res = await fetch(`/api/akman/payments/${payment.id}`, { method: 'DELETE' });
        if (!res.ok) {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    if (failedCount > 0) {
      window.alert(`일부 결제 내역(${failedCount}건)은 삭제하지 못했습니다.`);
    }

    await fetchRecentPayments();
  };

  // 검색어 변경 시 사용자 목록 다시 조회 (첫 페이지로)
  // 주의: 검색어가 있을 때만 자동 검색 실행 (빈 검색어는 실행하지 않음)
  useEffect(() => {
    // 검색어가 없으면 실행하지 않음 (초기 로드 제외)
    if (!searchTerm.trim()) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchUsers(1, searchTerm.trim(), true);
      // 검색 시 자동으로 회원 목록 펼치기
      setIsUserListExpanded(true);
    }, 300); // 디바운스 300ms

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // 페이지 변경 핸들러
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    const planValue = activeFilter?.type === 'plan' ? activeFilter.value : null;
    const dateValue = activeFilter?.type === 'date' ? activeFilter.value : null;
    fetchUsers(newPage, null, false, planValue, dateValue);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // 필터 초기화 핸들러
  const handleResetFilter = () => {
    setActiveFilter(null);
    setSearchTerm('');
    setCurrentPage(1);
    fetchUsers(1, null, false, null, null);
  };


  if (sessionStatus !== 'loading' && !isAdmin) {
    return <div>권한 없음</div>;
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <Link
          href="/akman/points"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          포인트 로그 →
        </Link>
        <Link
          href="/akman/payments"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          결제 내역 →
        </Link>
        <Link
          href="/akman/ai-mapping"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          AI 매핑 로그 {aiMappingLogCount > 0 && `(${aiMappingLogCount})`} →
        </Link>
        <Link
          href="/akman/popups"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          팝업 생성 →
        </Link>
      </div>

      <h1 style={{ marginBottom: '20px' }}>EXCLOAD Console</h1>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4 mb-8">
          <div
            className={`p-4 bg-white rounded shadow ${activeFilter?.type === 'all' ? 'ring-2 ring-blue-500' : ''}`}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: activeFilter?.type === 'all' ? '#f0f7ff' : 'white',
            }}
            onClick={() => {
              setActiveFilter({ type: 'all', value: '' });
              setSearchTerm('');
              setCurrentPage(1);
              fetchUsers(1, null, false, null, null);
              setIsUserListExpanded(true);
            }}
            onMouseEnter={(e) => {
              if (activeFilter?.type !== 'all') {
                e.currentTarget.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (activeFilter?.type !== 'all') {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            총 회원
            <div className="text-2xl font-bold">{stats?.totalUsers}</div>
          </div>

          <div
            className={`p-4 bg-white rounded shadow ${activeFilter?.type === 'plan' && activeFilter?.value === 'FREE' ? 'ring-2 ring-blue-500' : ''}`}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: activeFilter?.type === 'plan' && activeFilter?.value === 'FREE' ? '#f0f7ff' : 'white',
            }}
            onClick={() => {
              setActiveFilter({ type: 'plan', value: 'FREE' });
              setSearchTerm('');
              setCurrentPage(1);
              fetchUsers(1, null, false, 'FREE', null);
              setIsUserListExpanded(true);
            }}
            onMouseEnter={(e) => {
              if (!(activeFilter?.type === 'plan' && activeFilter?.value === 'FREE')) {
                e.currentTarget.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (!(activeFilter?.type === 'plan' && activeFilter?.value === 'FREE')) {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            FREE
            <div className="text-2xl font-bold">{stats?.freeUsers}</div>
          </div>

          <div
            className={`p-4 bg-white rounded shadow ${activeFilter?.type === 'plan' && activeFilter?.value === 'PRO' ? 'ring-2 ring-blue-500' : ''}`}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: activeFilter?.type === 'plan' && activeFilter?.value === 'PRO' ? '#f0f7ff' : 'white',
            }}
            onClick={() => {
              setActiveFilter({ type: 'plan', value: 'PRO' });
              setSearchTerm('');
              setCurrentPage(1);
              fetchUsers(1, null, false, 'PRO', null);
              setIsUserListExpanded(true);
            }}
            onMouseEnter={(e) => {
              if (!(activeFilter?.type === 'plan' && activeFilter?.value === 'PRO')) {
                e.currentTarget.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (!(activeFilter?.type === 'plan' && activeFilter?.value === 'PRO')) {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            PRO
            <div className="text-2xl font-bold">{stats?.proUsers}</div>
          </div>

          <div
            className={`p-4 bg-white rounded shadow ${activeFilter?.type === 'plan' && activeFilter?.value === 'YEARLY' ? 'ring-2 ring-blue-500' : ''}`}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: activeFilter?.type === 'plan' && activeFilter?.value === 'YEARLY' ? '#f0f7ff' : 'white',
            }}
            onClick={() => {
              setActiveFilter({ type: 'plan', value: 'YEARLY' });
              setSearchTerm('');
              setCurrentPage(1);
              fetchUsers(1, null, false, 'YEARLY', null);
              setIsUserListExpanded(true);
            }}
            onMouseEnter={(e) => {
              if (!(activeFilter?.type === 'plan' && activeFilter?.value === 'YEARLY')) {
                e.currentTarget.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (!(activeFilter?.type === 'plan' && activeFilter?.value === 'YEARLY')) {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            YEARLY
            <div className="text-2xl font-bold">{stats?.yearlyUsers}</div>
          </div>

          <div
            className={`p-4 bg-white rounded shadow ${activeFilter?.type === 'date' && activeFilter?.value === 'today' ? 'ring-2 ring-blue-500' : ''}`}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: activeFilter?.type === 'date' && activeFilter?.value === 'today' ? '#f0f7ff' : 'white',
            }}
            onClick={() => {
              setActiveFilter({ type: 'date', value: 'today' });
              setSearchTerm('');
              setCurrentPage(1);
              fetchUsers(1, null, false, null, 'today');
              setIsUserListExpanded(true);
            }}
            onMouseEnter={(e) => {
              if (!(activeFilter?.type === 'date' && activeFilter?.value === 'today')) {
                e.currentTarget.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (!(activeFilter?.type === 'date' && activeFilter?.value === 'today')) {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            오늘 가입
            <div className="text-2xl font-bold">{stats?.todayUsers}</div>
          </div>

          <div
            className={`p-4 bg-white rounded shadow ${activeFilter?.type === 'date' && activeFilter?.value === 'thisMonth' ? 'ring-2 ring-blue-500' : ''}`}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: activeFilter?.type === 'date' && activeFilter?.value === 'thisMonth' ? '#f0f7ff' : 'white',
            }}
            onClick={() => {
              setActiveFilter({ type: 'date', value: 'thisMonth' });
              setSearchTerm('');
              setCurrentPage(1);
              fetchUsers(1, null, false, null, 'thisMonth');
              setIsUserListExpanded(true);
            }}
            onMouseEnter={(e) => {
              if (!(activeFilter?.type === 'date' && activeFilter?.value === 'thisMonth')) {
                e.currentTarget.style.backgroundColor = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (!(activeFilter?.type === 'date' && activeFilter?.value === 'thisMonth')) {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            이번달 가입
            <div className="text-2xl font-bold">{stats?.monthlyUsers}</div>
          </div>

          <div className="p-4 bg-white rounded shadow">
            총 매출
            <div className="text-2xl font-bold">₩{(stats?.revenue || 0).toLocaleString()}</div>
          </div>

          <div className="p-4 bg-white rounded shadow">
            이번달 매출
            <div className="text-2xl font-bold">₩{(stats?.monthlyRevenue || 0).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* 어뷰저 감지 대시보드 섹션 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '20px',
          marginBottom: '10px',
          padding: '15px',
          backgroundColor: '#fff5f5',
          borderRadius: '8px',
          border: '1px solid #fecaca',
          cursor: 'pointer',
        }}
        onClick={() => setIsAbuserListExpanded(!isAbuserListExpanded)}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#b91c1c' }}>
            어뷰저 감지 대시보드
          </h2>
          <p style={{ margin: '5px 0 0 0', color: '#7f1d1d', fontSize: '14px' }}>
            {suspiciousUsers.length > 0
              ? `의심 사용자 ${suspiciousUsers.length}명`
              : '현재 등록된 의심 사용자가 없습니다 (데모 데이터 사용 중일 수 있습니다)'}
          </p>
        </div>
        <div style={{ fontSize: '20px', color: '#7f1d1d' }}>
          {isAbuserListExpanded ? '▼' : '▶'}
        </div>
      </div>

      {/* 어뷰저 감지 대시보드 테이블 (접기/펼치기) */}
      {isAbuserListExpanded && (
        <div className="bg-white p-6 rounded shadow mb-8">
          {suspiciousUsers.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              표시할 의심 사용자가 없습니다.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <button
                  onClick={handleDeleteSelectedSuspiciousUsers}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  선택 삭제
                </button>
                <button
                  onClick={handleDeleteAllSuspiciousUsers}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  전체 삭제
                </button>
              </div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid #fee2e2',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#fef2f2' }}>
                    <th
                      style={{
                        border: '1px solid #fecaca',
                        padding: '12px',
                        textAlign: 'center',
                        width: '50px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isAllSuspiciousUsersSelected}
                        onChange={handleToggleAllSuspiciousUsers}
                      />
                    </th>
                    <th style={{ border: '1px solid #fecaca', padding: '12px', textAlign: 'left' }}>
                      Email
                    </th>
                    <th style={{ border: '1px solid #fecaca', padding: '12px', textAlign: 'left' }}>
                      Plan
                    </th>
                    <th style={{ border: '1px solid #fecaca', padding: '12px', textAlign: 'left' }}>
                      deviceId
                    </th>
                    <th style={{ border: '1px solid #fecaca', padding: '12px', textAlign: 'left' }}>
                      IP
                    </th>
                    <th
                      style={{
                        border: '1px solid #fecaca',
                        padding: '12px',
                        textAlign: 'right',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={() => {
                        setAbuserSortKey('signup');
                        setAbuserSortOrder((prev) =>
                          abuserSortKey === 'signup' && prev === 'desc' ? 'asc' : 'desc'
                        );
                      }}
                    >
                      가입횟수{' '}
                      {abuserSortKey === 'signup' ? (abuserSortOrder === 'desc' ? '▼' : '▲') : ''}
                    </th>
                    <th
                      style={{
                        border: '1px solid #fecaca',
                        padding: '12px',
                        textAlign: 'right',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={() => {
                        setAbuserSortKey('download');
                        setAbuserSortOrder((prev) =>
                          abuserSortKey === 'download' && prev === 'desc' ? 'asc' : 'desc'
                        );
                      }}
                    >
                      다운로드수{' '}
                      {abuserSortKey === 'download' ? (abuserSortOrder === 'desc' ? '▼' : '▲') : ''}
                    </th>
                    <th style={{ border: '1px solid #fecaca', padding: '12px', textAlign: 'center' }}>
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...suspiciousUsers]
                    .sort((a, b) => {
                      const key = abuserSortKey === 'signup' ? 'signupCount' : 'downloadCount';
                      const diff = (b as any)[key] - (a as any)[key];
                      return abuserSortOrder === 'desc' ? diff : -diff;
                    })
                    .map((user) => (
                      <tr key={user.id}>
                        <td
                          style={{
                            border: '1px solid #fee2e2',
                            padding: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSuspiciousUserIds.includes(user.id)}
                            onChange={() => handleToggleSuspiciousUser(user.id)}
                          />
                        </td>
                        <td style={{ border: '1px solid #fee2e2', padding: '12px' }}>{user.email}</td>
                        <td style={{ border: '1px solid #fee2e2', padding: '12px' }}>
                          {user.plan === 'UNKNOWN' ? '-' : user.plan}
                        </td>
                        <td style={{ border: '1px solid #fee2e2', padding: '12px' }}>{user.deviceId}</td>
                        <td style={{ border: '1px solid #fee2e2', padding: '12px' }}>{user.ip}</td>
                        <td
                          style={{
                            border: '1px solid #fee2e2',
                            padding: '12px',
                            textAlign: 'right',
                          }}
                        >
                          {user.signupCount.toLocaleString()}
                        </td>
                        <td
                          style={{
                            border: '1px solid #fee2e2',
                            padding: '12px',
                            textAlign: 'right',
                          }}
                        >
                          {user.downloadCount.toLocaleString()}
                        </td>
                        <td
                          style={{
                            border: '1px solid #fee2e2',
                            padding: '12px',
                            textAlign: 'center',
                            fontWeight: 'bold',
                            color: user.status === 'SUSPECT' ? '#b91c1c' : '#16a34a',
                          }}
                        >
                          {user.status === 'SUSPECT' ? '🚨 의심' : '정상'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* 최근 결제 섹션 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '30px',
          marginBottom: '15px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          cursor: 'pointer',
        }}
        onClick={() => setIsPaymentListExpanded(!isPaymentListExpanded)}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
            최근 결제 (최근 7일)
          </h2>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            {recentPayments.length > 0 ? `${recentPayments.length}건` : '결제 내역 없음'}
          </p>
        </div>
        <div style={{ fontSize: '20px', color: '#666' }}>
          {isPaymentListExpanded ? '▼' : '▶'}
        </div>
      </div>

      {/* 최근 결제 테이블 (접기/펼치기) */}
      {isPaymentListExpanded && (
        <div className="bg-white p-6 rounded shadow mb-8">
          {recentPayments.length > 0 ? (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <button
                  onClick={handleDeleteSelectedPayments}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  선택 삭제
                </button>
                <button
                  onClick={handleDeleteAllPayments}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  전체 삭제
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th
                      style={{
                        border: '1px solid #ccc',
                        padding: '12px',
                        textAlign: 'center',
                        width: '50px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isAllPaymentsSelected}
                        onChange={handleToggleAllPayments}
                      />
                    </th>
                    <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>Email</th>
                    <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>Plan</th>
                    <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'right' }}>Amount</th>
                    <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td
                        style={{
                          border: '1px solid #ccc',
                          padding: '12px',
                          textAlign: 'center',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPaymentIds.includes(payment.id)}
                          onChange={() => handleTogglePayment(payment.id)}
                        />
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: '12px' }}>{payment.email}</td>
                      <td style={{ border: '1px solid #ccc', padding: '12px' }}>{payment.plan}</td>
                      <td
                        style={{
                          border: '1px solid #ccc',
                          padding: '12px',
                          textAlign: 'right',
                          fontWeight: 'bold',
                        }}
                      >
                        ₩{payment.amount.toLocaleString()}
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                        {new Date(payment.createdAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              최근 30일간 결제 내역이 없습니다.
            </div>
          )}
        </div>
      )}

      {/* 검색 입력 */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="이메일 검색 (부분 검색 가능)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const trimmedSearch = searchTerm.trim();
              setCurrentPage(1);
              // 검색어가 있으면 검색 실행, 없으면 전체 조회
              if (trimmedSearch) {
                fetchUsers(1, trimmedSearch, true);
                setIsUserListExpanded(true);
              } else {
                fetchUsers(1, null, false);
              }
            }
          }}
          style={{
            flex: 1,
            maxWidth: '400px',
            padding: '10px 16px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none',
          }}
        />
        <button
          onClick={() => {
            const trimmedSearch = searchTerm.trim();
            setCurrentPage(1);
            // 검색어가 있으면 검색 실행, 없으면 전체 조회
            if (trimmedSearch) {
              fetchUsers(1, trimmedSearch, true);
              setIsUserListExpanded(true);
            } else {
              fetchUsers(1, null, false);
            }
          }}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          검색
        </button>
        {searchTerm && (
          <button
            onClick={() => {
              setSearchTerm('');
              setCurrentPage(1);
              const planValue = activeFilter?.type === 'plan' ? activeFilter.value : null;
              const dateValue = activeFilter?.type === 'date' ? activeFilter.value : null;
              fetchUsers(1, null, false, planValue, dateValue);
            }}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            초기화
          </button>
        )}
      </div>

      {/* 회원 목록 섹션 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '30px',
          marginBottom: '15px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          cursor: 'pointer',
        }}
        onClick={() => setIsUserListExpanded(!isUserListExpanded)}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
            회원 목록
          </h2>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            {pagination ? (
              <>
                총 {pagination.totalUsers.toLocaleString()}명
                {searchTerm && ` (검색: "${searchTerm}")`}
                {activeFilter && activeFilter.type === 'plan' && ` (플랜: ${activeFilter.value})`}
                {activeFilter && activeFilter.type === 'date' && activeFilter.value === 'today' && ` (오늘 가입)`}
                {activeFilter && activeFilter.type === 'date' && activeFilter.value === 'thisMonth' && ` (이번달 가입)`}
                {' | '}
                페이지 {pagination.page} / {pagination.totalPages}
                {' | '}
                표시: {users.length}명
              </>
            ) : (
              <>
                총 {users.length}명
                {searchTerm && ` (검색: "${searchTerm}")`}
                {activeFilter && activeFilter.type === 'plan' && ` (플랜: ${activeFilter.value})`}
                {activeFilter && activeFilter.type === 'date' && activeFilter.value === 'today' && ` (오늘 가입)`}
                {activeFilter && activeFilter.type === 'date' && activeFilter.value === 'thisMonth' && ` (이번달 가입)`}
              </>
            )}
          </p>
        </div>
        <div style={{ fontSize: '20px', color: '#666' }}>
          {isUserListExpanded ? '▼' : '▶'}
        </div>
      </div>

      {/* 회원 목록 테이블 (접기/펼치기) */}
      {isUserListExpanded && (
        <>
          {(activeFilter || searchTerm) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
              <button
                onClick={handleResetFilter}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                필터 초기화
              </button>
            </div>
          )}
          <table
            ref={tableRef}
            style={{
              marginTop: '10px',
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
              Points
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              이메일 인증
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              가입일
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          {users.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  border: '1px solid #ccc',
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999',
                }}
              >
                {searchTerm ? '검색 결과가 없습니다.' : '사용자가 없습니다.'}
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.id}>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  <Link
                    href={`/akman/users/${user.id}`}
                    style={{
                      color: '#0066cc',
                      textDecoration: 'none',
                    }}
                  >
                    {user.email}
                  </Link>
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>{user.plan}</td>
                <td style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'right' }}>
                  {user.points.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {user.emailVerified ? (
                    <span style={{ color: 'green' }}>✓ 인증완료</span>
                  ) : (
                    <span style={{ color: 'red' }}>✗ 미인증</span>
                  )}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {new Date(user.createdAt).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  <Link
                    href={`/akman/users/${user.id}`}
                    style={{
                      display: 'inline-block',
                      padding: '6px 12px',
                      fontSize: '13px',
                      backgroundColor: '#0066cc',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontWeight: '500',
                    }}
                  >
                    상세보기
                  </Link>
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
        </>
      )}

      {/* 월별 매출 차트 */}
      <div className="bg-white p-6 rounded shadow mt-10">
        <h2 className="text-lg font-bold mb-4">월 매출</h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="month"/>
            <YAxis/>
            <Tooltip/>

            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#2563eb"
              strokeWidth={3}
            />

          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 월별 가입자 차트 */}
      <div className="bg-white p-6 rounded shadow mt-10">
        <h2 className="text-lg font-bold mb-4">월 가입자</h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={userData}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="month"/>
            <YAxis/>
            <Tooltip/>

            <Line
              type="monotone"
              dataKey="users"
              stroke="#10b981"
              strokeWidth={3}
            />

          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
