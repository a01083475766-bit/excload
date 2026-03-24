import { create } from 'zustand';

export type SourceType = 'excel' | 'kakao' | 'image';

export interface FileMetadata {
  name: string;
  size: number;
  lastModified: number;
  type: string;
}

export interface SenderInfo {
  name: string;
  phone: string;
  address: string;
}

export interface HistorySession {
  id: string;
  createdAt: string; // ISO string for serialization
  sourceType: SourceType;
  files: FileMetadata[];
  senderInfo: SenderInfo | null;
  courier: string | null;
  downloadedFileName?: string; // 생성된 택배사 업로드용 파일명
  orderCount?: number; // 생성된 주문 건수
  resultRows?: any[]; // 변환된 주문 데이터 (히스토리 복원용)
}

interface HistoryStoreState {
  sessions: HistorySession[];
  addSession: (session: Omit<HistorySession, 'id' | 'createdAt'>) => void;
  removeSession: (id: string) => void;
  removeSessions: (ids: string[]) => void; // 여러 세션을 한 번에 삭제
  updateSession: (id: string, updates: Partial<Omit<HistorySession, 'id' | 'createdAt'>>) => void;
  getSession: (id: string) => HistorySession | undefined;
  clearAllSessions: () => void;
  getSessionsBySourceType: (sourceType: SourceType) => HistorySession[];
  loadSessions: () => void; // localStorage에서 세션 로드
}

// localStorage에 세션 저장
const saveSessionsToStorage = (sessions: HistorySession[]) => {
  try {
    localStorage.setItem('history-sessions', JSON.stringify(sessions));
  } catch (error) {
    console.error('Failed to save history sessions to localStorage:', error);
    // 사용자에게 알림 (히스토리 저장 실패는 치명적이지 않으므로 조용히 처리)
    // 필요시 alert를 추가할 수 있으나, 자동 저장이므로 사용자 경험을 위해 조용히 처리
  }
};

// localStorage에서 세션 로드
// 실행 타이밍: 앱 초기화 시 (StoreInitializer 컴포넌트의 useEffect에서 loadSessions() 호출 시)
//             또는 히스토리 페이지에서 수동으로 loadSessions() 호출 시
// 히스토리 정리 로직: 이 함수 내부에서 30일 이상 된 항목을 자동으로 필터링하여 삭제
const loadSessionsFromStorage = (): HistorySession[] => {
  try {
    const savedSessions = localStorage.getItem('history-sessions');
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions) as HistorySession[];
      
      // 히스토리 정리 로직: 30일 이상 된 항목 자동 삭제
      // 실행 시점: localStorage에서 세션을 로드할 때마다 실행됨
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000; // 30일을 밀리초로 변환
      const now = Date.now();
      
      const filteredSessions = parsed.filter((session) => {
        if (!session.createdAt) {
          return false; // createdAt이 없으면 삭제
        }
        
        // ISO string 또는 timestamp를 밀리초로 변환
        const createdAtMs = typeof session.createdAt === 'string' 
          ? new Date(session.createdAt).getTime()
          : session.createdAt;
        
        // 30일 이내인 항목만 유지
        return (now - createdAtMs) <= thirtyDaysInMs;
      });
      
      // 필터링된 결과가 원본과 다르면 localStorage에 저장 (정리된 결과 반영)
      if (filteredSessions.length !== parsed.length) {
        saveSessionsToStorage(filteredSessions);
      }
      
      return filteredSessions;
    }
  } catch (error) {
    console.error('Failed to load history sessions from localStorage:', error);
    // 로드 실패는 조용히 처리 (히스토리가 없으면 빈 배열 반환)
  }
  return [];
};

export const useHistoryStore = create<HistoryStoreState>()((set, get) => ({
  sessions: [],

  addSession: (sessionData) => {
    const newSession: HistorySession = {
      ...sessionData,
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const updatedSessions = [newSession, ...state.sessions];
      
      // 20일 자동 정리: createdAt 기준 20일 초과 세션 자동 삭제
      const twentyDaysInMs = 20 * 24 * 60 * 60 * 1000; // 20일을 밀리초로 변환
      const now = Date.now();
      
      const cleanedSessions = updatedSessions.filter((session) => {
        if (!session.createdAt) {
          return false; // createdAt이 없으면 삭제
        }
        
        // ISO string을 밀리초로 변환
        const createdAtMs = typeof session.createdAt === 'string' 
          ? new Date(session.createdAt).getTime()
          : session.createdAt;
        
        // 20일 이내인 항목만 유지
        return (now - createdAtMs) <= twentyDaysInMs;
      });
      
      saveSessionsToStorage(cleanedSessions);
      return { sessions: cleanedSessions };
    });
  },

  removeSession: (id) => {
    set((state) => {
      const updatedSessions = state.sessions.filter((session) => session.id !== id);
      saveSessionsToStorage(updatedSessions);
      return { sessions: updatedSessions };
    });
  },

  removeSessions: (ids) => {
    set((state) => {
      const updatedSessions = state.sessions.filter((session) => !ids.includes(session.id));
      saveSessionsToStorage(updatedSessions);
      return { sessions: updatedSessions };
    });
  },

  updateSession: (id, updates) => {
    set((state) => {
      const updatedSessions = state.sessions.map((session) =>
        session.id === id ? { ...session, ...updates } : session
      );
      saveSessionsToStorage(updatedSessions);
      return { sessions: updatedSessions };
    });
  },

  getSession: (id) => {
    return get().sessions.find((session) => session.id === id);
  },

  clearAllSessions: () => {
    set({ sessions: [] });
    saveSessionsToStorage([]);
  },

  getSessionsBySourceType: (sourceType) => {
    return get().sessions.filter((session) => session.sourceType === sourceType);
  },

  loadSessions: () => {
    const loadedSessions = loadSessionsFromStorage();
    set({ sessions: loadedSessions });
  },
}));

