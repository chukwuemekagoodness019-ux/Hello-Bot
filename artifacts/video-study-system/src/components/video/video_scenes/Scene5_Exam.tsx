import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene5_Exam() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Grid / structure appears
      setTimeout(() => setPhase(2), 1500),  // Lock & Title
      setTimeout(() => setPhase(3), 2800),  // ERI stat
      setTimeout(() => setPhase(4), 6500),  // Exit prep
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      {...sceneTransitions.zoomThrough}
    >
      {/* Background Grid - strictly academic */}
      <motion.div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '4vw 4vw'
        }}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, opacity: 0.1 } : { scale: 1.2, opacity: 0 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />

      <div className="z-10 flex flex-col items-center w-full relative">
        
        {/* The Lock/Shield Graphic */}
        <motion.div
          className="relative w-[12vw] h-[12vw] rounded-full border-2 border-[var(--color-primary)] flex items-center justify-center mb-10"
          initial={{ rotateX: 90, opacity: 0 }}
          animate={phase >= 2 ? { rotateX: 0, opacity: 1 } : { rotateX: 90, opacity: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Internal rotating elements */}
          <motion.div 
            className="absolute inset-2 border border-white/20 rounded-full border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          <svg className="w-10 h-10 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </motion.div>

        {/* Title */}
        <motion.h2
          className="text-[5vw] font-display text-white uppercase tracking-widest leading-none mb-6"
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={phase >= 2 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 20, filter: 'blur(10px)' }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          Formal Exam Mode
        </motion.h2>
        
        <motion.p
          className="text-[1.5vw] font-body text-[var(--color-text-secondary)] font-light tracking-wide uppercase mb-12"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          High-Stakes Simulation • Anti-Cheat
        </motion.p>

        {/* ERI Stat */}
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.8, ease: "backOut" }}
        >
          <div className="text-[var(--color-primary)] text-[1vw] uppercase tracking-[0.2em] mb-2 font-bold">Exam Readiness Index</div>
          <div className="text-[4vw] font-mono font-light text-white leading-none">94<span className="text-[2vw] text-white/50">%</span></div>
        </motion.div>

      </div>
    </motion.div>
  );
}