import { create } from 'zustand';
import { getSession } from 'next-auth/react';

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

/** 구버전: 계정 미구분 저장 (한 브라우저에 하나) */
const LEGACY_STORAGE_KEY = 'history-sessions';

function scopedStorageKey(userId: string): string {
  return `history-sessions:${userId}`;
}

const RETENTION_MS = 20 * 24 * 60 * 60 * 1000;

function filterByRetention(parsed: HistorySession[]): HistorySession[] {
  const now = Date.now();
  return parsed.filter((session) => {
    if (!session.createdAt) return false;
    const createdAtMs =
      typeof session.createdAt === 'string'
        ? new Date(session.createdAt).getTime()
        : (session.createdAt as unknown as number);
    return now - createdAtMs <= RETENTION_MS;
  });
}

interface HistoryStoreState {
  /** 현재 로그인 사용자 DB id — 변환 저장·조회 단위 */
  historyUserId: string | null;
  setHistoryUserId: (id: string | null) => void;
  clearSessionsInMemory: () => void;

  sessions: HistorySession[];
  addSession: (session: Omit<HistorySession, 'id' | 'createdAt'>) => void;
  removeSession: (id: string) => void;
  removeSessions: (ids: string[]) => void;
  updateSession: (id: string, updates: Partial<Omit<HistorySession, 'id' | 'createdAt'>>) => void;
  getSession: (id: string) => HistorySession | undefined;
  clearAllSessions: () => void;
  getSessionsBySourceType: (sourceType: SourceType) => HistorySession[];
  loadSessions: () => void;
}

const saveSessionsToStorage = (userId: string | null, sessions: HistorySession[]) => {
  if (!userId) return;
  try {
    localStorage.setItem(scopedStorageKey(userId), JSON.stringify(sessions));
  } catch (error) {
    console.error('Failed to save history sessions to localStorage:', error);
  }
};

/**
 * 레거시 `history-sessions`는 사용자 구분 없이 섞였을 수 있음.
 * 구버전 키에만 데이터가 있으면 지금 로그인한 계정 키로 한 번 옮긴 뒤 레거시를 삭제합니다(과거 데이터는 계정 구분 없음).
 */
const loadSessionsFromStorageForUser = (userId: string): HistorySession[] => {
  try {
    const scopedRaw = localStorage.getItem(scopedStorageKey(userId));
    let raw = scopedRaw;
    let fromLegacy = false;

    if (!raw) {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        raw = legacyRaw;
        fromLegacy = true;
      }
    }

    if (!raw) return [];

    const parsed = JSON.parse(raw) as HistorySession[];
    const filtered = filterByRetention(parsed);
    saveSessionsToStorage(userId, filtered);

    if (fromLegacy) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    return filtered;
  } catch (error) {
    console.error('Failed to load history sessions from localStorage:', error);
  }
  return [];
};

export const useHistoryStore = create<HistoryStoreState>()((set, get) => ({
  historyUserId: null,

  setHistoryUserId: (id) =>
    set((state) => {
      if (state.historyUserId === id) return {};
      return { historyUserId: id, sessions: [] };
    }),

  clearSessionsInMemory: () => set({ sessions: [] }),

  sessions: [],

  addSession: (sessionData) => {
    const userId = get().historyUserId;
    if (!userId) {
      // StoreInitializer의 useEffect보다 먼저 저장이 호출되면 id가 비어 있을 수 있음 → 세션에서 보강
      void getSession().then((session) => {
        const uid = session?.user?.id;
        if (!uid) {
          console.warn('[historyStore] addSession: 세션에 user.id 없음 — 저장 생략');
          return;
        }
        get().setHistoryUserId(uid);
        get().loadSessions();
        get().addSession(sessionData);
      });
      return;
    }

    const newSession: HistorySession = {
      ...sessionData,
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const updatedSessions = [newSession, ...state.sessions];
      const now = Date.now();
      const cleanedSessions = updatedSessions.filter((session) => {
        if (!session.createdAt) return false;
        const createdAtMs =
          typeof session.createdAt === 'string'
            ? new Date(session.createdAt).getTime()
            : (session.createdAt as unknown as number);
        return now - createdAtMs <= RETENTION_MS;
      });
      saveSessionsToStorage(userId, cleanedSessions);
      return { sessions: cleanedSessions };
    });
  },

  removeSession: (id) => {
    const userId = get().historyUserId;
    set((state) => {
      const updatedSessions = state.sessions.filter((session) => session.id !== id);
      if (userId) saveSessionsToStorage(userId, updatedSessions);
      return { sessions: updatedSessions };
    });
  },

  removeSessions: (ids) => {
    const userId = get().historyUserId;
    set((state) => {
      const updatedSessions = state.sessions.filter((session) => !ids.includes(session.id));
      if (userId) saveSessionsToStorage(userId, updatedSessions);
      return { sessions: updatedSessions };
    });
  },

  updateSession: (id, updates) => {
    const userId = get().historyUserId;
    set((state) => {
      const updatedSessions = state.sessions.map((session) =>
        session.id === id ? { ...session, ...updates } : session
      );
      if (userId) saveSessionsToStorage(userId, updatedSessions);
      return { sessions: updatedSessions };
    });
  },

  getSession: (id) => {
    return get().sessions.find((session) => session.id === id);
  },

  clearAllSessions: () => {
    const userId = get().historyUserId;
    set({ sessions: [] });
    if (userId) saveSessionsToStorage(userId, []);
  },

  getSessionsBySourceType: (sourceType) => {
    return get().sessions.filter((session) => session.sourceType === sourceType);
  },

  loadSessions: () => {
    const userId = get().historyUserId;
    if (!userId) {
      set({ sessions: [] });
      return;
    }
    const loadedSessions = loadSessionsFromStorageForUser(userId);
    set({ sessions: loadedSessions });
  },
}));
