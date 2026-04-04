import { create } from 'zustand';
import type { EnglishNormalizationRow } from '@/app/lib/refinement-engine/hint-engine/e-prime-ai';

export type UploadedFile = File;

interface FileMetadata {
  name: string;
  size: number;
  lastModified: number;
  type: string;
}

// 확장된 NormalizationResult 타입 (파일명, 원본 행번호, 원본 행 데이터 포함)
export interface ExtendedNormalizationResult extends EnglishNormalizationRow {
  fileName?: string;
  originalRowIndex?: number;
  originalRowData?: Record<string, any>;
  originalHeaders?: string[]; // 원본 엑셀 헤더 배열 (한글/원문 그대로, 원본 순서 유지)
  id?: string;
  isBundleable?: boolean;
  bundleGroupSize?: number;
}

type FileType = 'excel' | 'kakao';

interface ExcelPreviewData {
  excelData: string[][]; // 첫 번째 행은 헤더, 나머지는 데이터 행
  normalizedResults: ExtendedNormalizationResult[];
  uploadId?: string; // 엑셀 업로드 시점에 생성된 고유 ID
}

interface UploadedFilesState {
  files: {
    excel: UploadedFile[];
    kakao: UploadedFile[];
  };
  metadata: {
    excel: FileMetadata[];
    kakao: FileMetadata[];
  }; // localStorage에서 복원된 메타데이터
  // 엑셀 미리보기 데이터 (전역 상태로 관리)
  excelPreviewData: ExcelPreviewData | null;
  // 선택된 행 인덱스 (정규화된 결과 테이블 기준)
  selectedRowIndex: number | null;
  // 현재 파일 미리보기 데이터 (작업 세션 상태 - 새로고침 후에도 유지)
  currentFilePreviewData: ExtendedNormalizationResult[];
  // 미리보기 실행 여부 (작업 세션 상태 - 새로고침 후에도 유지)
  isPreviewConfirmed: boolean;
  addFiles: (type: FileType, newFiles: UploadedFile[]) => void;
  removeFile: (type: FileType, index: number) => void;
  clearFiles: (type: FileType) => void;
  loadMetadata: () => void; // localStorage에서 메타데이터 로드
  restoreMetadata: (type: FileType, metadata: FileMetadata[]) => void; // 히스토리에서 메타데이터 복원
  // 엑셀 미리보기 데이터 관리 함수
  setExcelPreviewData: (data: ExcelPreviewData | null) => void;
  addExcelPreviewData: (normalizedResults: ExtendedNormalizationResult[], uploadId?: string) => void;
  removeExcelPreviewDataByFileName: (fileName: string) => void;
  clearExcelPreviewData: () => void;
  // 선택된 행 인덱스 관리 함수
  setSelectedRowIndex: (index: number | null) => void;
  // 현재 파일 미리보기 데이터 관리 함수 (작업 세션 상태)
  setCurrentFilePreviewData: (data: ExtendedNormalizationResult[]) => void;
  setIsPreviewConfirmed: (confirmed: boolean) => void;
  clearCurrentFilePreviewData: () => void; // 택배업로드파일 다운받기 성공 시에만 호출
}

// File 객체는 직렬화할 수 없으므로, 메타데이터만 localStorage에 저장
// 실제 File 객체는 메모리에 유지되므로 새로고침 후에는 사라지지만,
// 메타데이터는 유지되어 목록을 표시할 수 있음

export const useUploadedFilesStore = create<UploadedFilesState>()((set, get) => ({
  files: {
    excel: [],
    kakao: [],
  },
  metadata: {
    excel: [],
    kakao: [],
  },
  excelPreviewData: null,
  selectedRowIndex: null,
  currentFilePreviewData: [],
  isPreviewConfirmed: false,
  addFiles: (type: FileType, newFiles: UploadedFile[]) => {
    set((state) => {
      // 중복 체크: 이름과 크기가 같은 파일은 제외
      const uniqueNewFiles = newFiles.filter(
        (newFile) =>
          !state.files[type].some(
            (existing) =>
              existing.name === newFile.name &&
              existing.size === newFile.size
          )
      );
      const updatedFiles = [...state.files[type], ...uniqueNewFiles];
      
      // 메타데이터 업데이트 (실제 File 객체와 메타데이터 모두)
      const updatedMetadata = updatedFiles.map((file) => ({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        type: file.type,
      }));
      
      // localStorage에 메타데이터 저장
      try {
        const allMetadata = {
          excel: type === 'excel' ? updatedMetadata : state.metadata.excel,
          kakao: type === 'kakao' ? updatedMetadata : state.metadata.kakao,
        };
        localStorage.setItem('uploaded-files-metadata', JSON.stringify(allMetadata));
      } catch (error) {
        console.error('Failed to save file metadata to localStorage:', error);
        alert('파일 메타데이터를 저장하는 중 오류가 발생했습니다. 브라우저의 저장 공간을 확인해주세요.');
      }
      
      return { 
        files: {
          ...state.files,
          [type]: updatedFiles,
        },
        metadata: {
          ...state.metadata,
          [type]: updatedMetadata,
        },
      };
    });
  },
  removeFile: (type: FileType, index: number) => {
    set((state) => {
      // 제거할 파일 정보 가져오기
      const fileToRemove = state.files[type][index];
      const updatedFiles = state.files[type].filter((_, i) => i !== index);
      const updatedMetadata = state.metadata[type].filter((_, i) => i !== index);
      
      // 엑셀 파일인 경우 관련 미리보기 데이터도 제거
      let updatedPreviewData = state.excelPreviewData;
      let updatedSelectedRowIndex = state.selectedRowIndex;
      if (type === 'excel' && fileToRemove && updatedPreviewData) {
        // 해당 파일의 normalizedResults 제거
        const filteredResults = updatedPreviewData.normalizedResults.filter(
          (result) => result.fileName !== fileToRemove.name
        );
        
        // 모든 결과가 제거되면 previewData를 null로 설정하고 선택된 행 인덱스도 초기화
        if (filteredResults.length === 0) {
          updatedPreviewData = null;
          updatedSelectedRowIndex = null;
        } else {
          updatedPreviewData = {
            ...updatedPreviewData,
            normalizedResults: filteredResults,
          };
          // 선택된 행이 제거된 파일에 속한 경우 선택 해제
          // 정확한 인덱스 매칭은 복잡하므로, 파일 제거 시 선택 상태를 초기화
          updatedSelectedRowIndex = null;
        }
      }
      
      // localStorage 업데이트
      try {
        const allMetadata = {
          excel: type === 'excel' ? updatedMetadata : state.metadata.excel,
          kakao: type === 'kakao' ? updatedMetadata : state.metadata.kakao,
        };
        localStorage.setItem('uploaded-files-metadata', JSON.stringify(allMetadata));
      } catch (error) {
        console.error('Failed to save file metadata to localStorage:', error);
        alert('파일 메타데이터를 저장하는 중 오류가 발생했습니다. 브라우저의 저장 공간을 확인해주세요.');
      }
      
      return { 
        files: {
          ...state.files,
          [type]: updatedFiles,
        },
        metadata: {
          ...state.metadata,
          [type]: updatedMetadata,
        },
        excelPreviewData: updatedPreviewData,
        selectedRowIndex: updatedSelectedRowIndex,
      };
    });
  },
  clearFiles: (type: FileType) => {
    set((state) => {
      const newMetadata = {
        excel: type === 'excel' ? [] : state.metadata.excel,
        kakao: type === 'kakao' ? [] : state.metadata.kakao,
      };
      
      // 엑셀 파일인 경우 미리보기 데이터도 초기화
      const updatedPreviewData = type === 'excel' ? null : state.excelPreviewData;
      // 엑셀 파일인 경우 선택된 행 인덱스도 초기화
      const updatedSelectedRowIndex = type === 'excel' ? null : state.selectedRowIndex;
      
      // localStorage 업데이트
      try {
        localStorage.setItem('uploaded-files-metadata', JSON.stringify(newMetadata));
      } catch (error) {
        console.error('Failed to clear file metadata from localStorage:', error);
        alert('파일 메타데이터를 초기화하는 중 오류가 발생했습니다. 브라우저의 저장 공간을 확인해주세요.');
      }
      
      return {
        files: {
          ...state.files,
          [type]: [],
        },
        metadata: newMetadata,
        excelPreviewData: updatedPreviewData,
        selectedRowIndex: updatedSelectedRowIndex,
      };
    });
  },
  loadMetadata: () => {
    try {
      const savedMetadata = localStorage.getItem('uploaded-files-metadata');
      if (savedMetadata) {
        try {
          const parsed = JSON.parse(savedMetadata);
          // 이전 형식과의 호환성을 위해 체크
          if (Array.isArray(parsed)) {
            // 이전 형식: 배열 -> excel에 할당
            const metadata = parsed as FileMetadata[];
            set({ 
              metadata: {
                excel: metadata,
                kakao: [],
              },
            });
          } else {
            // 새 형식: { excel, kakao }
            const metadata = parsed as { excel: FileMetadata[]; kakao: FileMetadata[] };
            set({ 
              metadata: {
                excel: metadata.excel || [],
                kakao: metadata.kakao || [],
              },
            });
          }
        } catch (parseError) {
          console.error('Failed to parse file metadata from localStorage:', parseError);
          alert('저장된 파일 메타데이터를 불러오는 중 오류가 발생했습니다.');
        }
      }
    } catch (error) {
      console.error('Failed to load file metadata from localStorage:', error);
      alert('저장된 파일 메타데이터를 불러올 수 없습니다. 브라우저의 저장 공간을 확인해주세요.');
    }
  },
  restoreMetadata: (type: FileType, metadata: FileMetadata[]) => {
    set((state) => {
      const updatedMetadata = {
        excel: type === 'excel' ? metadata : state.metadata.excel,
        kakao: type === 'kakao' ? metadata : state.metadata.kakao,
      };
      
      // localStorage에 메타데이터 저장
      try {
        localStorage.setItem('uploaded-files-metadata', JSON.stringify(updatedMetadata));
      } catch (error) {
        console.error('Failed to restore file metadata to localStorage:', error);
        alert('파일 메타데이터를 복원하는 중 오류가 발생했습니다. 브라우저의 저장 공간을 확인해주세요.');
      }
      
      return {
        ...state,
        metadata: updatedMetadata,
      };
    });
  },
  // 엑셀 미리보기 데이터 설정 (전체 교체)
  setExcelPreviewData: (data: ExcelPreviewData | null) => {
    set({ excelPreviewData: data });
  },
  // 엑셀 미리보기 데이터 추가 (기존 데이터에 추가)
  addExcelPreviewData: (normalizedResults: ExtendedNormalizationResult[], uploadId?: string) => {
    set((state) => {
      if (!state.excelPreviewData) {
        // 기존 데이터가 없으면 새로 생성
        return {
          excelPreviewData: {
            excelData: [],
            normalizedResults: normalizedResults,
            uploadId: uploadId,
          },
        };
      } else {
        // 기존 데이터에 추가
        return {
          excelPreviewData: {
            ...state.excelPreviewData,
            normalizedResults: [...state.excelPreviewData.normalizedResults, ...normalizedResults],
            uploadId: uploadId || state.excelPreviewData.uploadId,
          },
        };
      }
    });
  },
  // 파일명으로 미리보기 데이터 제거
  removeExcelPreviewDataByFileName: (fileName: string) => {
    set((state) => {
      if (!state.excelPreviewData) {
        return state;
      }
      
      const filteredResults = state.excelPreviewData.normalizedResults.filter(
        (result) => result.fileName !== fileName
      );
      
      // 모든 결과가 제거되면 previewData를 null로 설정
      if (filteredResults.length === 0) {
        return { excelPreviewData: null };
      }
      
      return {
        excelPreviewData: {
          ...state.excelPreviewData,
          normalizedResults: filteredResults,
        },
      };
    });
  },
  // 엑셀 미리보기 데이터 초기화
  clearExcelPreviewData: () => {
    set({ excelPreviewData: null, selectedRowIndex: null });
  },
  // 선택된 행 인덱스 설정
  setSelectedRowIndex: (index: number | null) => {
    set({ selectedRowIndex: index });
  },
  // 현재 파일 미리보기 데이터 설정 (localStorage 저장하지 않음)
  setCurrentFilePreviewData: (data: ExtendedNormalizationResult[]) => {
    set({ currentFilePreviewData: data });
  },
  // 미리보기 확인 여부 설정 (localStorage 저장하지 않음)
  setIsPreviewConfirmed: (confirmed: boolean) => {
    set({ isPreviewConfirmed: confirmed });
  },
  // 현재 파일 미리보기 데이터 초기화 (택배업로드파일 다운받기 성공 시에만 호출)
  clearCurrentFilePreviewData: () => {
    set({ 
      currentFilePreviewData: [],
      isPreviewConfirmed: false,
    });
  },
}));

