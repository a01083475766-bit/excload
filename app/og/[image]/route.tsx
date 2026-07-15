import { ImageResponse } from 'next/og';
import { freeTools, getFreeTool } from '@/app/free-tools/free-tools-data';

export const runtime = 'edge';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;
const FREE_TOOLS_INDEX_IMAGE = 'free-tools.png';

type RouteProps = {
  params: Promise<{ image: string }>;
};

type OgImageData = {
  title: string;
  description: string;
  category: string;
};

function resolveOgImageData(image: string): OgImageData | null {
  if (image === FREE_TOOLS_INDEX_IMAGE) {
    return {
      title: '쇼핑몰 운영 무료도구',
      description:
        '온라인 판매와 주문 관리에 필요한 간단한 무료도구를 설치 없이 바로 사용할 수 있습니다.',
      category: '무료도구',
    };
  }

  const slug = image.replace(/^free-tools-/, '').replace(/\.png$/, '');
  const tool = getFreeTool(slug);

  if (!tool || image !== `free-tools-${tool.slug}.png`) {
    return null;
  }

  return {
    title: tool.name,
    description: tool.description,
    category: tool.category,
  };
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { image } = await params;
  const imageData = resolveOgImageData(image);

  if (!imageData) {
    return new Response('Not Found', { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 48%, #dbeafe 100%)',
          color: '#111827',
          fontFamily: '"Malgun Gothic", "Noto Sans KR", sans-serif',
          padding: 70,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -90,
            top: -100,
            width: 380,
            height: 380,
            borderRadius: 999,
            background: '#bfdbfe',
            opacity: 0.55,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 95,
            bottom: -130,
            width: 300,
            height: 300,
            borderRadius: 999,
            background: '#dbeafe',
            opacity: 0.8,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 76,
                height: 76,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 22,
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 38,
                fontWeight: 900,
              }}
            >
              E
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: '#1d4ed8', fontSize: 38, fontWeight: 900 }}>엑클로드</div>
              <div
                style={{
                  color: '#64748b',
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: 6,
                  marginTop: 2,
                }}
              >
                EXCLOAD
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: 999,
              background: '#dcfce7',
              color: '#047857',
              fontSize: 24,
              fontWeight: 800,
              padding: '14px 24px',
            }}
          >
            무료 사용 가능
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 850 }}>
          <div
            style={{
              alignSelf: 'flex-start',
              borderRadius: 999,
              background: '#dbeafe',
              color: '#1d4ed8',
              fontSize: 26,
              fontWeight: 900,
              padding: '12px 22px',
            }}
          >
            {imageData.category}
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -3, lineHeight: 1.1 }}>
            {imageData.title}
          </div>
          <div style={{ color: '#475569', fontSize: 34, fontWeight: 700, lineHeight: 1.35 }}>
            {imageData.description}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#334155',
            fontSize: 25,
            fontWeight: 800,
          }}
        >
          <div>회원가입 없이 · 설치 없이 · 브라우저에서 바로 사용</div>
          <div>excload.com</div>
        </div>
      </div>
    ),
    {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
    },
  );
}
