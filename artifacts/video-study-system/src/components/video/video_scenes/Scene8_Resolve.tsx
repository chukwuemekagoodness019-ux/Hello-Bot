import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene8_Resolve() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),   // Master, Guaranteed
      setTimeout(() => setPhase(2), 2000),  // Line
      setTimeout(() => setPhase(3), 2500),  // AI STUDY SYSTEM
      setTimeout(() => setPhase(4), 7000),  // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      {...sceneTransitions.fadeBlur}
    >
      <div className="z-10 text-center flex flex-col items-center justify-center w-full px-20">
        
        {/* Top Tagline */}
        <motion.h2 
          className="text-[1.5vw] font-body text-[var(--color-primary)] uppercase tracking-[0.4em] font-medium mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          Mastery, Guaranteed.
        </motion.h2>

        <motion.div
          className="w-px h-16 bg-gradient-to-b from-[var(--color-primary)] to-transparent mb-8"
          initial={{ height: 0, opacity: 0 }}
          animate={phase >= 2 ? { height: 64, opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{ duration: 1, ease: "easeInOut" }}
        />

        {/* Brand */}
        <motion.h1
          className="text-[6vw] font-display text-white tracking-tight leading-none"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          AI STUDY SYSTEM
        </motion.h1>
        
        <motion.div
          className="mt-12 text-[1vw] font-body text-[var(--color-text-secondary)] opacity-50 tracking-widest uppercase"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 1 }}
        >
          Premium Tier Available
        </motion.div>

      </div>
    </motion.div>
  );
}