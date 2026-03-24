'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CardStack } from "@/app/components/CardStack";
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

// 주문 카드 데이터
const orderCards = [
  '쇼핑몰 주문',
  '네이버 주문',
  '카카오톡 주문',
  '엑셀 주문 파일',
  '스마트스토어 주문',
  '오픈마켓 주문',
  '기타 주문',
];

// PHASE enum
enum Phase {
  PHASE_0 = 0, // 초기 상태 (큐브만 회전, 2초)
  PHASE_1 = 1, // 카드 낙하 등장 (2초)
  PHASE_2 = 2, // 카드 → 큐브 흡입 (1초)
  PHASE_3 = 3, // 큐브 가속 회전 (2초)
  PHASE_4 = 4, // 카드 1장 배출 (2초)
}

// Three.js 큐브 컴포넌트 (보라색 그라데이션 재질)
function PurpleGradientCube() {
  const vertexShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;
    
    void main() {
      vPosition = position;
      vNormal = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  
  const fragmentShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;
    
    void main() {
      // 보라색 그라데이션 (globals.css의 큐브 스타일 참고)
      vec3 color1 = vec3(0.576, 0.200, 0.918); // rgba(147, 51, 234)
      vec3 color2 = vec3(0.545, 0.227, 0.929); // rgba(139, 92, 246)
      vec3 color3 = vec3(0.486, 0.227, 0.929); // rgba(124, 58, 237)
      
      // 위치 기반 그라데이션
      float gradient = (vPosition.y + 72.0) / 144.0;
      vec3 gradientColor = mix(color1, color2, gradient);
      gradientColor = mix(gradientColor, color3, sin(vPosition.x * 0.01) * 0.5 + 0.5);
      
      // 노말 기반 조명 효과
      vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
      float lightIntensity = max(dot(vNormal, lightDir), 0.3);
      
      vec3 finalColor = gradientColor * lightIntensity;
      
      gl_FragColor = vec4(finalColor, 0.95);
    }
  `;
  
  return (
    <mesh>
      <boxGeometry args={[144, 144, 144]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent={true}
      />
    </mesh>
  );
}

interface HeroMotionProps {
  enableShake?: boolean;
}

export default function HeroMotion({ enableShake = false }: HeroMotionProps) {
  const heroSectionRef = useRef<HTMLElement>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);
  const cubeContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = [card1Ref, card2Ref, card3Ref];
  const [cubePosition, setCubePosition] = useState<{ x: number; y: number } | null>(null);
  const [ejectedCardPosition, setEjectedCardPosition] = useState<{ left: number; top: number } | null>(null);
  const [phase, setPhase] = useState<Phase>(Phase.PHASE_0);
  const phaseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cubeRotationRef = useRef({ rotateX: 0, rotateY: 0, rotateZ: 0 });

  useEffect(() => {
    // 렌더링 완료 후 실제 크기 및 위치 측정 (한 번만 실행)
    const measureLayout = () => {
      // 큐브(HeroCube) 위치 측정 및 설정
      if (cubeContainerRef.current && card1Ref.current && cardContainerRef.current) {
        const cubeContainer = cubeContainerRef.current;
        const cubeWrapper = cubeContainer.querySelector('div');
        
        if (cubeWrapper && card1Ref.current) {
          const cubeRect = cubeWrapper.getBoundingClientRect();
          const card1Rect = card1Ref.current.getBoundingClientRect();
          const parentRect = cardContainerRef.current.getBoundingClientRect();
          
          // Card 1의 중심점 기준으로 큐브 중심점까지의 상대 위치 계산
          const card1CenterX = card1Rect.left + card1Rect.width / 2 - parentRect.left;
          const card1CenterY = card1Rect.top + card1Rect.height / 2 - parentRect.top;
          const cubeCenterX = cubeRect.left + cubeRect.width / 2 - parentRect.left;
          const cubeCenterY = cubeRect.top + cubeRect.height / 2 - parentRect.top;
          
          // Card 1 중심점 기준 상대 위치
          const relativeX = cubeCenterX - card1CenterX;
          const relativeY = cubeCenterY - card1CenterY;
          
          setCubePosition({ x: relativeX, y: relativeY });
          
          // PHASE 0 시작 (최초 로딩 시 1회 실행)
          setPhase(Phase.PHASE_0);
        }
      }
    };

    // 초기 측정 (한 번만 실행)
    setTimeout(measureLayout, 100);
  }, []);

  // PHASE 전환 로직
  useEffect(() => {
    // 기존 timeout 정리
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
    }

    switch (phase) {
      case Phase.PHASE_0:
        // PHASE 0: 초기 상태 (2초) → PHASE 1로 전환
        phaseTimeoutRef.current = setTimeout(() => {
          setPhase(Phase.PHASE_1);
        }, 2000);
        break;
      
      case Phase.PHASE_1:
        // PHASE 1: 카드 낙하 등장 (2초) → PHASE 2로 전환
        phaseTimeoutRef.current = setTimeout(() => {
          setPhase(Phase.PHASE_2);
        }, 2000);
        break;
      
      case Phase.PHASE_2:
        // PHASE 2: 카드 → 큐브 흡입 (1초) → PHASE 3로 전환
        phaseTimeoutRef.current = setTimeout(() => {
          setPhase(Phase.PHASE_3);
        }, 1000);
        break;
      
      case Phase.PHASE_3:
        // PHASE 3: 큐브 가속 회전 (2초) → PHASE 4로 전환
        phaseTimeoutRef.current = setTimeout(() => {
          // PHASE 4 시작 전에 배출 카드 위치 계산 (Card 3 기준)
          if (cardRefs[2].current && cardContainerRef.current) {
            const card3Rect = cardRefs[2].current.getBoundingClientRect();
            const parentRect = cardContainerRef.current.getBoundingClientRect();
            
            // Card 3의 중심점 기준으로 배출 카드 위치 계산
            const card3CenterX = card3Rect.left + card3Rect.width / 2 - parentRect.left;
            const card3CenterY = card3Rect.top + card3Rect.height / 2 - parentRect.top;
            
            setEjectedCardPosition({
              left: card3CenterX,
              top: card3CenterY,
            });
          }
          setPhase(Phase.PHASE_4);
        }, 2000);
        break;
      
      case Phase.PHASE_4:
        // PHASE 4: 카드 1장 배출 (2초 노출 유지) → PHASE 0으로 리셋
        phaseTimeoutRef.current = setTimeout(() => {
          setPhase(Phase.PHASE_0);
        }, 2000);
        break;
    }

    return () => {
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
      }
    };
  }, [phase]);

  return (
    <div className="w-full">
      <section ref={heroSectionRef} className="pt-4">
        <div className="max-w-4xl">
          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 서비스 설명 텍스트 영역 */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-400">
                Smart Order Management
              </p>
              <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-950 dark:text-zinc-100 leading-tight">
                여러 주문을 한 번에 정리해보세요
              </h1>
              <p className="text-base text-zinc-600 dark:text-zinc-500 leading-loose whitespace-pre-line">
                여러 곳에서 들어오는 주문을 하나씩 정리하느라 답답하셨다면,{'\n'}이제 그 과정을 훨씬 편하게 바꿔보세요.
              </p>
            </div>
          </div>
        </div>

        {/* 카드 컨테이너 */}
        <div
          ref={cardContainerRef}
          className="w-full grid grid-cols-3 gap-8 border-2 border-green-500"
        >
          {/* 카드 1 */}
          <div
            ref={card1Ref}
            className="aspect-[4/3] rounded-lg relative overflow-visible border-2 border-purple-500"
          >
            {/* PHASE 1, 2: 카드 스택 렌더링 */}
            {(phase === Phase.PHASE_1 || phase === Phase.PHASE_2) && (
              <CardStack 
                cubePosition={cubePosition} 
                phase={phase}
              />
            )}
            
            {/* PHASE 4: 단일 카드 1장 배출 */}
            {phase === Phase.PHASE_4 && ejectedCardPosition && (
              <motion.div
                initial={{
                  scale: 0.6,
                  opacity: 0,
                  y: -20,
                }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: 0.6,
                  ease: 'easeOut',
                }}
                className="absolute card"
                style={{
                  left: `${ejectedCardPosition.left}px`,
                  top: `${ejectedCardPosition.top}px`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {orderCards[0]}
              </motion.div>
            )}
          </div>

          {/* 카드 2 */}
          <div
            ref={card2Ref}
            className="aspect-[4/3] rounded-lg bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-shadow flex items-center justify-center border-2 border-purple-500"
          >
            {/* Perspective container */}
            <div className="flex items-center justify-center w-full h-full" style={{ perspective: '800px' }}>
              {/* Cube container */}
              <motion.div 
                ref={cubeContainerRef}
                className="relative"
                style={{
                  width: '288px',
                  height: '288px',
                  transformStyle: 'preserve-3d',
                }}
                animate={
                  phase === Phase.PHASE_3
                    ? {
                        // PHASE 3: 큐브 가속 회전 (현재 위치에서 720deg 추가 회전)
                        rotateX: cubeRotationRef.current.rotateX + 720,
                        rotateY: cubeRotationRef.current.rotateY + 720,
                        rotateZ: cubeRotationRef.current.rotateZ + 720,
                      }
                    : phase === Phase.PHASE_0
                    ? {
                        // PHASE 0: 느린 회전 (rotateX, rotateY만 사용)
                        rotateX: [0, 360],
                        rotateY: [0, 360],
                        rotateZ: 0,
                      }
                    : {
                        // PHASE 1, 2, 4: 현재 회전 상태 유지
                        rotateX: cubeRotationRef.current.rotateX,
                        rotateY: cubeRotationRef.current.rotateY,
                        rotateZ: cubeRotationRef.current.rotateZ,
                      }
                }
                transition={
                  phase === Phase.PHASE_3
                    ? {
                        // PHASE 3: 가속 회전 (2초, easeInOut)
                        duration: 2.0,
                        ease: 'easeInOut',
                        rotateX: { duration: 2.0 },
                        rotateY: { duration: 2.0 },
                        rotateZ: { duration: 2.0 },
                      }
                    : phase === Phase.PHASE_0
                    ? {
                        // PHASE 0: 느린 회전 (2초, linear, 무한 반복)
                        rotateX: { duration: 2.0, repeat: Infinity, ease: 'linear' },
                        rotateY: { duration: 2.0, repeat: Infinity, ease: 'linear' },
                      }
                    : {
                        duration: 0,
                      }
                }
                onAnimationComplete={() => {
                  // PHASE 3 회전 완료 후 현재 회전 상태 업데이트
                  if (phase === Phase.PHASE_3) {
                    cubeRotationRef.current.rotateX += 720;
                    cubeRotationRef.current.rotateY += 720;
                    cubeRotationRef.current.rotateZ += 720;
                  }
                }}
              >
                {/* Three.js 큐브 렌더링 */}
                <Canvas
                  camera={{ position: [0, 0, 800], fov: 50 }}
                  style={{ width: '288px', height: '288px' }}
                  gl={{ antialias: true }}
                >
                  <ambientLight intensity={0.4} />
                  <directionalLight position={[10, 10, 10]} intensity={1.2} />
                  <PurpleGradientCube />
                </Canvas>
              </motion.div>
            </div>
          </div>

          {/* 카드 3 */}
          <div 
            ref={card3Ref}
            className="aspect-[4/3] rounded-lg bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-shadow flex items-center justify-center border-2 border-purple-500"
          >
            {/* 빈 상태 유지 */}
          </div>
        </div>
      </section>
    </div>
  );
}
