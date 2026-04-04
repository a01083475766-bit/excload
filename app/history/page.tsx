'use client';

import { useState, useEffect } from 'react';
import { Clock, Search, Filter, Calendar, FileText, Download, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useHistoryStore } from '@/app/store/historyStore';
import type { HistorySession } from '@/app/store/historyStore';
import * as XLSX from 'xlsx';

interface HistoryItem {
  id: string;
  title: string;
  type: 'excel' | 'text' | 'image';
  createdAt: string;
  fileCount: number;
  orderCount: number;
  status: 'completed' | 'processing' | 'failed';
}

export default function HistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'excel' | 'text' | 'image'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null); // 펼쳐진 히스토리 ID
  
  // 히스토리 스토어에서 세션 가져오기
  const sessions = useHistoryStore((state) => state.sessions);
  const removeSessions = useHistoryStore((state) => state.removeSessions);
  const removeSession = useHistoryStore((state) => state.removeSession);
  const loadSessions = useHistoryStore((state) => state.loadSessions);

  // 컴포넌트 마운트 시 세션 로드
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 최근 작업 정렬 고정 (createdAt DESC)
  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA; // DESC: 최신순
  });

  // HistorySession을 HistoryItem 형태로 변환 (세션 정보도 함께 저장)
  const historyItemsWithSessions = sortedSessions.map((session: HistorySession) => {
    // sourceType을 type으로 매핑 (excel -> excel, image -> image, kakao -> text)
    const type: 'excel' | 'text' | 'image' = 
      session.sourceType === 'excel' ? 'excel' 
      : session.sourceType === 'image' ? 'image'
      : 'text'; // 'kakao' 또는 기타 경우 'text'로 매핑
    
    // 파일명에서 제목 추출 (다운로드 파일명이 있으면 사용, 없으면 첫 번째 파일명 사용)
    const title = session.downloadedFileName 
      ? session.downloadedFileName.replace('.xlsx', '').replace('.xls', '')
      : session.files[0]?.name || '주문 변환';
    
    return {
      id: session.id,
      title,
      type,
      createdAt: session.createdAt,
      fileCount: session.files.length,
      orderCount: session.orderCount || 0, // 주문 건수 (없으면 0)
      status: 'completed' as const,
      session, // 원본 세션 정보 저장 (resultRows 접근용)
    };
  });

  const historyItems = historyItemsWithSessions.map(({ session, ...item }) => item);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'excel':
        return '엑셀';
      case 'text':
        return '텍스트';
      case 'image':
        return '이미지';
      default:
        return '';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'excel':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'text':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
      case 'image':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300';
      default:
        return '';
    }
  };

  // 검색어 하이라이트 함수
  const highlightText = (text: string, searchTerm: string): string => {
    if (!searchTerm || !text) {
      return String(text || '');
    }

    // 특수문자 이스케이프 처리
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 대소문자 구분 없이 검색어 하이라이트
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    
    return String(text).replace(
      regex,
      '<span class="text-blue-600 font-semibold">$1</span>'
    );
  };

  const filteredItemsWithSessions = historyItemsWithSessions.filter((item) => {
    // 필터 조건 확인
    const matchesFilter = selectedFilter === 'all' || item.type === selectedFilter;
    if (!matchesFilter) {
      return false;
    }

    // 검색어가 없으면 필터만 적용
    if (!searchQuery.trim()) {
      return true;
    }

    const searchTerm = searchQuery.toLowerCase();
    const session = item.session;

    // 1. session id에서 검색
    if (session?.id?.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // 2. downloadedFileName에서 검색
    if (session?.downloadedFileName?.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // 3. files.name에서 검색
    if (session?.files?.some((file) => file.name?.toLowerCase().includes(searchTerm))) {
      return true;
    }

    // 4. sourceType에서 검색
    if (session?.sourceType?.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // 5. courier에서 검색
    if (session?.courier?.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // 6. 제목에서 검색
    if (item.title.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // 7. resultRows 내부 데이터에서 검색
    if (!session?.resultRows || session.resultRows.length === 0) {
      return false;
    }

    // resultRows의 모든 row를 순회하며 검색
    return session.resultRows.some((row: any) => {
      if (!row.data) {
        return false;
      }
      
      // row.data 객체의 모든 값에서 검색어 포함 여부 확인
      return Object.values(row.data).some((value) => {
        if (value === null || value === undefined) {
          return false;
        }
        return String(value).toLowerCase().includes(searchTerm);
      });
    });
  });

  const filteredItems = filteredItemsWithSessions.map(({ session, ...item }) => item);

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(item => item.id));
    }
  };

  // 개별 선택/해제
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
  };

  // 선택 삭제
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) {
      alert('삭제할 항목을 선택해주세요.');
      return;
    }

    if (confirm(`선택한 ${selectedIds.length}개의 변환 내역을 삭제하시겠습니까?`)) {
      removeSessions(selectedIds);
      setSelectedIds([]);
      // 펼쳐진 항목이 삭제되면 expandedId 초기화
      if (selectedIds.includes(expandedId || '')) {
        setExpandedId(null);
      }
    }
  };

  // 히스토리 카드 클릭 (펼침/닫힘)
  const handleCardClick = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // 개별 삭제
  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
    if (confirm('이 변환 내역을 삭제하시겠습니까?')) {
      removeSession(id);
      if (expandedId === id) {
        setExpandedId(null);
      }
    }
  };

  // 재다운로드
  const handleRedownload = (session: HistorySession, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
    
    if (!session.resultRows || session.resultRows.length === 0) {
      alert('다운로드할 주문 데이터가 없습니다.');
      return;
    }

    try {
      // 세션에서 courier 정보 가져오기 (courierHeaders는 resultRows에서 추출)
      // resultRows는 PreviewRowWithId[] 형태이므로 data에서 헤더 추출
      const firstRow = session.resultRows[0];
      if (!firstRow || !firstRow.data) {
        alert('주문 데이터 형식이 올바르지 않습니다.');
        return;
      }

      // 헤더 추출 (첫 번째 행의 data에서 모든 키 추출)
      const headers = Object.keys(firstRow.data);
      
      // 데이터 생성
      const excelRows = session.resultRows.map((rowWithId: any) => {
        return headers.map((header) => {
          return rowWithId.data?.[header] ?? '';
        });
      });

      const excelData = [headers, ...excelRows];

      // 엑셀 파일 생성
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

      // 파일명 생성
      const now = new Date();
      const fileName = session.downloadedFileName || `주문정리파일_${now
        .toISOString()
        .replace(/[-:]/g, "")
        .slice(0, 15)}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('재다운로드 오류:', error);
      alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-950 dark:text-zinc-100 mb-2">
            지난 변환 내역
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            이전에 처리한 주문 변환 내역을 확인할 수 있습니다.
          </p>
        </div>

        {/* 총 작업 수 표시 */}
        <div className="mb-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            총 변환 작업: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{sessions.length}</span>건
          </p>
        </div>

        {/* 검색 및 필터 */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input
                type="text"
                placeholder="변환 내역 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Enter 키 검색 지원 (실시간 필터링이 이미 구현되어 있으므로 별도 처리 불필요)
                    e.preventDefault();
                  }
                }}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex gap-2">
              {(['all', 'excel', 'text', 'image'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedFilter(filter)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    selectedFilter === filter
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {filter === 'all' ? '전체' : getTypeLabel(filter)}
                </button>
              ))}
            </div>
          </div>
          
          {/* 보관 정책 안내 */}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            변환 내역은 이 브라우저에 20일 동안 저장됩니다. 브라우저 데이터 삭제 시 내역이 사라질 수 있으니 필요한 파일은 미리 다운로드해 주세요.
          </p>
        </div>

        {/* 선택 액션 버튼 */}
        {filteredItems.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 rounded-lg font-medium text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              {selectedIds.length === filteredItems.length ? '전체 해제' : '전체 선택'}
            </button>
            {selectedIds.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="px-4 py-2 rounded-lg font-medium text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                선택 삭제 ({selectedIds.length})
              </button>
            )}
          </div>
        )}

        {/* 변환내역 목록 */}
        <div className="space-y-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                작업 내역이 없습니다.
              </p>
            </div>
          ) : (
            filteredItemsWithSessions.map((itemWithSession) => {
              const { session, ...item } = itemWithSession;
              const isExpanded = expandedId === item.id;
              
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                >
                  {/* 카드 헤더 (클릭 가능) */}
                  <div
                    onClick={() => handleCardClick(item.id)}
                    className="p-5 lg:p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* 체크박스 */}
                      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                          className="w-5 h-5 rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:checked:bg-blue-600"
                        />
                      </div>

                      {/* 항목 정보 */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            {item.title}
                          </h3>
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${getTypeColor(item.type)}`}>
                            {getTypeLabel(item.type)}
                          </span>
                          {/* 펼침/닫힘 아이콘 */}
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-zinc-400 ml-auto" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-zinc-400 ml-auto" />
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-4 h-4" />
                            <span>파일 {item.fileCount}개 · 주문 {item.orderCount}건</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 결과 테이블 영역 (펼침 시 표시) */}
                  {isExpanded && session?.resultRows && session.resultRows.length > 0 && (
                    <div className="border-t border-zinc-200 dark:border-zinc-800">
                      {/* 결과 테이블 */}
                      <div className="p-4 lg:p-6">
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                            변환 결과
                          </h4>
                          <div 
                            className="overflow-x-auto overflow-y-auto"
                            style={{ maxHeight: '400px' }}
                          >
                            <table className="text-sm border-collapse w-full">
                              <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                                <tr>
                                  {Object.keys(session.resultRows[0]?.data || {}).map((header) => (
                                    <th
                                      key={header}
                                      className="px-3 py-2 text-left border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium whitespace-nowrap"
                                    >
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {session.resultRows.map((row: any, rowIndex: number) => {
                                  // 검색어가 포함된 행인지 확인
                                  const searchTerm = searchQuery.trim().toLowerCase();
                                  const isRowMatched = searchTerm && row.data
                                    ? Object.values(row.data).some((value: any) =>
                                        String(value || '').toLowerCase().includes(searchTerm)
                                      )
                                    : false;
                                  
                                  // 행 클래스명 결정
                                  const rowClassName = isRowMatched
                                    ? "border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 bg-blue-100"
                                    : "border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800";
                                  
                                  return (
                                    <tr
                                      key={row.rowId || rowIndex}
                                      className={rowClassName}
                                    >
                                      {Object.keys(session.resultRows?.[0]?.data || {}).map((header) => {
                                        const cellValue = row.data?.[header] ?? '';
                                        const cellText = String(cellValue);
                                        const highlightedText = searchQuery.trim() 
                                          ? highlightText(cellText, searchQuery.trim())
                                          : cellText;
                                        
                                        return (
                                          <td
                                            key={header}
                                            className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 whitespace-nowrap"
                                            dangerouslySetInnerHTML={{
                                              __html: highlightedText
                                            }}
                                          />
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 하단 버튼 */}
                        <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                          {/* 왼쪽: 재다운로드 */}
                          <button
                            onClick={(e) => handleRedownload(session, e)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            엑셀 다시 다운로드
                          </button>
                          
                          {/* 오른쪽: 삭제, 닫기 */}
                          <div className="flex gap-3">
                            <button
                              onClick={(e) => handleDeleteItem(item.id, e)}
                              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              삭제
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedId(null);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-zinc-600 hover:bg-zinc-700 text-white rounded-lg font-medium text-sm transition-colors"
                            >
                              <X className="w-4 h-4" />
                              닫기
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
