import { FreeToolCard } from '@/app/free-tools/_components/FreeToolCard';
import { FreeToolsLayout } from '@/app/free-tools/_components/FreeToolsLayout';
import { freeTools } from '@/app/free-tools/free-tools-data';
import { pageMetadata } from '@/app/lib/seo-metadata';

export const metadata = pageMetadata(
  '쇼핑몰 운영 무료도구 - 엑클로드(EXCLOAD)',
  '온라인 판매와 주문 관리에 필요한 간단한 무료도구를 설치 없이 바로 사용할 수 있습니다.',
  '/free-tools',
  {
    image: {
      url: '/og/free-tools.png',
      alt: '엑클로드 쇼핑몰 운영 무료도구 미리보기',
    },
  },
);

export default function FreeToolsPage() {
  return (
    <FreeToolsLayout
      title="사장님을 위한 무료 업무도구"
      description="파일 정리, 이미지 처리, QR코드, 문서 변환까지 설치 없이 바로 사용할 수 있는 간단한 도구를 모았습니다."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {freeTools.map((tool, index) => (
          <FreeToolCard key={tool.slug} tool={tool} index={index} />
        ))}
      </div>
    </FreeToolsLayout>
  );
}
