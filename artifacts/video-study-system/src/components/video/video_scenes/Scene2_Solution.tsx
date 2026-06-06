import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene2_Solution() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Geometric shapes form
      setTimeout(() => setPhase(2), 2500),  // Clarity text
      setTimeout(() => setPhase(3), 5000),  // Brand reveal
      setTimeout(() => setPhase(4), 8500),  // Exit prep
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      {...sceneTransitions.scaleFade}
    >
      {/* Midground: Sacred geometry / AI structure forming */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
        <motion.div 
          className="w-[40vw] h-[40vw] border border-[var(--color-primary)] rounded-full absolute"
          initial={{ scale: 0, opacity: 0, rotate: -90 }}
          animate={{ scale: phase >= 1 ? 1 : 0, opacity: phase >= 1 ? 0.3 : 0, rotate: phase >= 1 ? 0 : -90 }}
          transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div 
          className="w-[28vw] h-[28vw] border border-white/20 rounded-full absolute"
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: phase >= 1 ? 1 : 2, opacity: phase >= 1 ? 0.5 : 0 }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
        />
        <motion.div 
          className="w-[40vw] h-[40vw] border border-[var(--color-primary)] absolute"
          style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
          initial={{ scale: 0, opacity: 0, rotate: 45 }}
          animate={{ scale: phase >= 1 ? 1 : 0, opacity: phase >= 1 ? 0.15 : 0, rotate: phase >= 1 ? 0 : 45 }}
          transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
        />
      </div>

      <div className="z-10 text-center flex flex-col items-center justify-center w-full">
        
        {/* Phase 2: Clarity */}
        <motion.h2 
          className="absolute text-[3.5vw] font-body text-[var(--color-text-secondary)] tracking-widest uppercase font-light"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 && phase < 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{ duration: 1 }}
        >
          Clarity through Intelligence
        </motion.h2>

        {/* Phase 3: Brand */}
        <motion.div
          className="absolute flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
          animate={phase >= 3 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : { opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="text-[7vw] font-display text-white tracking-tight leading-none mb-4">
            AI STUDY SYSTEM
          </h1>
          <div className="w-[10vw] h-[1px] bg-[var(--color-primary)]" />
        </motion.div>

      </div>
    </motion.div>
  );
}