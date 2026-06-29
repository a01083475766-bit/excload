import { notFound } from 'next/navigation';
import { FreeToolsLayout } from '@/app/free-tools/_components/FreeToolsLayout';
import { ToolWorkspace } from '@/app/free-tools/_components/ToolWorkspace';
import { freeTools, getFreeTool } from '@/app/free-tools/free-tools-data';
import { pageMetadata } from '@/app/lib/seo-metadata';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return freeTools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const tool = getFreeTool(slug);

  if (!tool) {
    return pageMetadata('무료도구 - 엑클로드(EXCLOAD)', '엑클로드 무료도구 페이지입니다.', '/free-tools');
  }

  return pageMetadata(
    `${tool.name} - 쇼핑몰 운영 무료도구 | 엑클로드`,
    tool.pageDescription ?? tool.description,
    `/free-tools/${tool.slug}`,
    {
      image: {
        url: tool.ogImagePath,
        alt: `${tool.name} 무료도구 미리보기`,
      },
    },
  );
}

export default async function FreeToolDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const tool = getFreeTool(slug);

  if (!tool) notFound();

  return (
    <FreeToolsLayout
      activeSlug={tool.slug}
      title="사장님을 위한 무료 업무도구"
      description="파일 정리, 이미지 처리, QR코드, 문서 변환까지 설치 없이 바로 사용할 수 있는 간단한 도구를 모았습니다."
    >
      <ToolWorkspace tool={tool} />
    </FreeToolsLayout>
  );
}
