import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene7_Outcome() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Text 1
      setTimeout(() => setPhase(2), 3000),  // Text 2
      setTimeout(() => setPhase(3), 5000),  // Exit prep
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      {...sceneTransitions.crossDissolve}
    >
      <div className="z-10 text-center flex flex-col items-center justify-center w-full px-20">
        
        {/* Phase 1 Text */}
        <motion.h2 
          className="absolute text-[4vw] font-display text-[var(--color-text-secondary)] italic font-light tracking-wide"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={phase >= 1 && phase < 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.05 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Not just a tool.
        </motion.h2>

        {/* Phase 2 Text */}
        <motion.h1
          className="absolute text-[6vw] font-display text-white leading-none tracking-tight"
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : { opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Your Academic Partner.
        </motion.h1>

      </div>
    </motion.div>
  );
}