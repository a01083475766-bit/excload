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
    tool.description,
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
      title="쇼핑몰 운영 무료도구"
      description="온라인 판매와 주문 관리에 필요한 간단한 도구를 무료로 이용해 보세요. 별도의 프로그램 설치 없이 바로 사용할 수 있습니다."
    >
      <ToolWorkspace tool={tool} />
    </FreeToolsLayout>
  );
}
