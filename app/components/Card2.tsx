"use client";

import { motion } from "framer-motion";

const rand = (min: number, max: number) =>
  Math.random() * (max - min) + min;

export function Card2({
  index,
  label,
}: {
  index: number;
  label: string;
}) {
  const initialX = rand(-40, 40);
  return (
    <motion.div
      initial={{
        y: -200,
        x: initialX,
        rotate: rand(-35, 35),
        opacity: 0,
      }}
      animate={{
        y: "80%",
        x: initialX + 36,
        opacity: 1,
      }}
      transition={{
        delay: index * 0.15,
        type: "spring",
        stiffness: 120,
        damping: 25,
      }}
      className="absolute card"
      style={{ zIndex: 20 - index, overflow: 'visible' }}
    >
      {label}
      {/* 3D 큐브 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="cube-wrapper">
          <div className="cube">
            <div className="cube-face cube-face-front"></div>
            <div className="cube-face cube-face-back"></div>
            <div className="cube-face cube-face-right"></div>
            <div className="cube-face cube-face-left"></div>
            <div className="cube-face cube-face-top"></div>
            <div className="cube-face cube-face-bottom"></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
