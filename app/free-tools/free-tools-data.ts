import {
  Calculator,
  FileCheck2,
  FileDown,
  FileSpreadsheet,
  Image as ImageIcon,
  QrCode,
  ScanText,
  Files,
  FileStack,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type FreeTool = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  pageDescription?: string;
  icon: LucideIcon;
  category: string;
  enabled: boolean;
  ogImagePath: string;
};

export const freeTools: FreeTool[] = [
  {
    slug: 'margin-calculator',
    name: '원가·마진 계산기',
    shortDescription: '판매가와 비용으로 순이익을 확인합니다.',
    description:
      '판매가, 원가, 쇼핑몰 수수료, 배송비를 입력하면 예상 순이익과 마진율을 계산할 수 있습니다.',
    icon: Calculator,
    category: '계산',
    enabled: true,
    ogImagePath: '/og/free-tools-margin-calculator.png',
  },
  {
    slug: 'duplicate-check',
    name: '주문 엑셀 중복 검사',
    shortDescription: '중복 주문이나 송장 후보를 빠르게 찾습니다.',
    description:
      '주문번호, 연락처, 수취인 정보 등을 기준으로 주문 엑셀에 같은 주문이 반복되어 있는지 확인합니다.',
    icon: FileCheck2,
    category: '엑셀',
    enabled: true,
    ogImagePath: '/og/free-tools-duplicate-check.png',
  },
  {
    slug: 'privacy-mask',
    name: '개인정보 가리기',
    shortDescription: '주문 파일의 개인정보를 가린 파일을 만듭니다.',
    description:
      '주문 엑셀에 포함된 이름, 전화번호, 주소 등의 개인정보를 가린 새 파일을 만듭니다.',
    icon: ScanText,
    category: '보안',
    enabled: true,
    ogImagePath: '/og/free-tools-privacy-mask.png',
  },
  {
    slug: 'image-resize',
    name: '이미지 크기·용량 줄이기',
    shortDescription: '상품 이미지 크기와 용량을 줄입니다.',
    description:
      '상품 등록이나 문의 응대에 쓰는 이미지를 브라우저에서 크기 조절하고 용량을 줄이는 도구입니다.',
    icon: ImageIcon,
    category: '이미지',
    enabled: true,
    ogImagePath: '/og/free-tools-image-resize.png',
  },
  {
    slug: 'image-text-extractor',
    name: '이미지·캡처 글자 추출기',
    shortDescription: '이미지 파일이나 캡처 화면 속 글자를 텍스트로 바꿉니다.',
    description:
      '이미지 파일이나 캡처한 화면 속 글자를 자동으로 읽어 텍스트·엑셀 파일로 저장할 수 있습니다.',
    pageDescription:
      '이미지 파일을 올리거나 캡처한 화면을 바로 붙여넣으면, 안에 있는 글자를 자동으로 읽어 텍스트로 정리합니다. 추출한 글자는 복사하거나 TXT, CSV, 엑셀 파일로 다운로드할 수 있습니다.',
    icon: ScanText,
    category: '이미지',
    enabled: true,
    ogImagePath: '/og/free-tools-image-text-extractor.png',
  },
  {
    slug: 'qr-code',
    name: 'QR코드 만들기',
    shortDescription: '링크와 문구를 QR코드 이미지로 만듭니다.',
    description:
      '링크와 문구를 QR코드로 만들어 이미지로 다운로드합니다.',
    icon: QrCode,
    category: '마케팅',
    enabled: true,
    ogImagePath: '/og/free-tools-qr-code.png',
  },
  {
    slug: 'excel-csv',
    name: '엑셀·CSV 변환',
    shortDescription: '엑셀 파일과 CSV 파일을 서로 변환합니다.',
    description:
      '엑셀 파일을 CSV로, CSV 파일을 엑셀 파일로 변환합니다.',
    icon: FileSpreadsheet,
    category: '엑셀',
    enabled: true,
    ogImagePath: '/og/free-tools-excel-csv.png',
  },
  {
    slug: 'excel-to-pdf',
    name: '엑셀 PDF 변환',
    shortDescription: '엑셀과 CSV 표 데이터를 PDF로 변환합니다.',
    description:
      '엑셀과 CSV의 셀 데이터를 읽기 쉬운 표 형태의 PDF 문서로 변환합니다.',
    icon: FileDown,
    category: '문서',
    enabled: true,
    ogImagePath: '/og/free-tools-excel-to-pdf.png',
  },
  {
    slug: 'image-to-pdf',
    name: '이미지 PDF 변환',
    shortDescription: '여러 이미지를 원하는 순서대로 PDF로 묶습니다.',
    description:
      '여러 이미지를 원하는 순서대로 하나의 PDF 파일로 묶습니다.',
    icon: Files,
    category: '문서',
    enabled: true,
    ogImagePath: '/og/free-tools-image-to-pdf.png',
  },
  {
    slug: 'pdf-merge',
    name: 'PDF 합치기',
    shortDescription: '필요한 페이지만 골라 PDF를 합칩니다.',
    description:
      '필요한 페이지만 골라 원하는 순서대로 하나의 PDF로 합칩니다.',
    icon: FileStack,
    category: '문서',
    enabled: true,
    ogImagePath: '/og/free-tools-pdf-merge.png',
  },
];

export function getFreeTool(slug: string) {
  return freeTools.find((tool) => tool.slug === slug);
}
