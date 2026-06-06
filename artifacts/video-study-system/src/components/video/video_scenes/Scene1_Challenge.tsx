import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene1_Challenge() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // First text
      setTimeout(() => setPhase(2), 4500),  // Second text
      setTimeout(() => setPhase(3), 8500),  // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      {...sceneTransitions.fadeBlur}
    >
      {/* Background chaotic lines to represent knowledge noise */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 15 }).map((_, i) => (
          <motion.path
            key={i}
            d={`M${Math.random() * 100},${Math.random() * 100} Q${Math.random() * 100},${Math.random() * 100} ${Math.random() * 100},${Math.random() * 100} T${Math.random() * 100},${Math.random() * 100}`}
            fill="transparent"
            stroke="var(--color-primary)"
            strokeWidth="0.2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ 
              pathLength: [0, 1, 1],
              opacity: phase >= 3 ? 0 : [0, 0.5, 0],
              pathOffset: [0, 0, 1]
            }}
            transition={{ 
              duration: 4 + Math.random() * 4,
              repeat: Infinity,
              ease: "linear",
              delay: i * 0.2
            }}
          />
        ))}
      </svg>

      <div className="z-10 text-center flex flex-col items-center justify-center w-full px-20">
        
        {/* Phase 1 Text */}
        <motion.h1 
          className="text-[5vw] font-display text-white leading-tight tracking-tight max-w-[70vw]"
          initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
          animate={phase >= 1 && phase < 2 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: -30, filter: 'blur(10px)' }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          The weight of modern academia.
        </motion.h1>

        {/* Phase 2 Text */}
        <motion.h2
          className="absolute text-[6vw] font-display text-[var(--color-primary)] leading-none tracking-tight max-w-[80vw]"
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(15px)' }}
          animate={phase >= 2 && phase < 3 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : { opacity: 0, scale: 1.1, filter: 'blur(15px)' }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Too much data.<br/>
          <span className="text-white">Too little time.</span>
        </motion.h2>

      </div>
    </motion.div>
  );
}