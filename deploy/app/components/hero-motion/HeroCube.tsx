'use client';

import { useEffect, useRef } from 'react';

export default function HeroCube() {
  const cubeWrapperRef = useRef<HTMLDivElement>(null);
  const cubeInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measureCube = () => {
      if (cubeWrapperRef.current && cubeInnerRef.current) {
        const wrapperRect = cubeWrapperRef.current.getBoundingClientRect();
        const innerRect = cubeInnerRef.current.getBoundingClientRect();
        const innerStyles = window.getComputedStyle(cubeInnerRef.current);
        
        console.log('【HeroCube 상세 분석】');
        console.log(`  - 외부 컨테이너: ${wrapperRect.width.toFixed(2)}px × ${wrapperRect.height.toFixed(2)}px`);
        console.log(`  - 내부 회전 요소: ${innerRect.width.toFixed(2)}px × ${innerRect.height.toFixed(2)}px`);
        console.log(`  - transform: ${innerStyles.transform}`);
        
        // Transform으로 인한 시각적 크기 계산
        // rotateX(20deg) rotateY(30deg) 적용 시
        // 투영 크기 = 원본 크기 × cos(회전각)
        const angleX = 20 * Math.PI / 180;
        const angleY = 30 * Math.PI / 180;
        const visualWidth = 120 * Math.cos(angleY);
        const visualHeight = 120 * Math.cos(angleX);
        console.log(`  - 계산된 시각적 크기 (투영): 약 ${visualWidth.toFixed(2)}px × ${visualHeight.toFixed(2)}px`);
        console.log(`  - 실제 측정된 크기: ${innerRect.width.toFixed(2)}px × ${innerRect.height.toFixed(2)}px`);
      }
    };

    setTimeout(measureCube, 150);
  }, []);

  return (
    <div
      ref={cubeWrapperRef}
      style={{
        width: '120px',
        height: '120px',
        perspective: '1000px',
      }}
    >
      <div
        ref={cubeInnerRef}
        style={{
          width: '120px',
          height: '120px',
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: 'rotateX(20deg) rotateY(30deg)',
        }}
      >
      {/* 앞면 */}
      <div
        style={{
          position: 'absolute',
          width: '120px',
          height: '120px',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          transform: 'translateZ(60px)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
        }}
      />
      {/* 뒷면 */}
      <div
        style={{
          position: 'absolute',
          width: '120px',
          height: '120px',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          transform: 'translateZ(-60px) rotateY(180deg)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(124, 58, 237, 0.3)',
        }}
      />
      {/* 오른쪽면 */}
      <div
        style={{
          position: 'absolute',
          width: '120px',
          height: '120px',
          background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
          transform: 'rotateY(90deg) translateZ(60px)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(167, 139, 250, 0.3)',
        }}
      />
      {/* 왼쪽면 */}
      <div
        style={{
          position: 'absolute',
          width: '120px',
          height: '120px',
          background: 'linear-gradient(135deg, #5b21b6 0%, #6d28d9 100%)',
          transform: 'rotateY(-90deg) translateZ(60px)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(109, 40, 217, 0.3)',
        }}
      />
      {/* 위쪽면 */}
      <div
        style={{
          position: 'absolute',
          width: '120px',
          height: '120px',
          background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
          transform: 'rotateX(90deg) translateZ(60px)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
        }}
      />
      {/* 아래쪽면 */}
      <div
        style={{
          position: 'absolute',
          width: '120px',
          height: '120px',
          background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
          transform: 'rotateX(-90deg) translateZ(60px)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(79, 70, 229, 0.3)',
        }}
      />
      </div>
    </div>
  );
}
