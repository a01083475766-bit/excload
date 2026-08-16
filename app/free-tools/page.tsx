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
  const webTools = freeTools.filter((tool) => tool.category !== 'PC프로그램');
  const pcTools = freeTools.filter((tool) => tool.category === 'PC프로그램');

  return (
    <FreeToolsLayout
      title="무료 업무도구"
      description="파일 정리, 이미지 처리, QR코드, 문서 변환까지 설치 없이 바로 사용할 수 있는 간단한 도구를 모았습니다."
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {webTools.map((tool, index) => (
            <FreeToolCard key={tool.slug} tool={tool} index={index} />
          ))}
        </div>

        {pcTools.length > 0 && (
          <section className="space-y-3 border-t border-zinc-300 pt-5">
            <div>
              <h2 className="text-base font-bold text-zinc-950">PC 무료 프로그램</h2>
              <p className="mt-1 text-sm text-zinc-600">
                브라우저가 아니라 Windows PC에 받아 사용하는 무료 프로그램입니다.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pcTools.map((tool, index) => (
                <FreeToolCard key={tool.slug} tool={tool} index={webTools.length + index} />
              ))}
            </div>
          </section>
        )}
      </div>
    </FreeToolsLayout>
  );
}
