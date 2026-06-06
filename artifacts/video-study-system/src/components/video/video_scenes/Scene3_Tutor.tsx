import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene3_Tutor() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Title
      setTimeout(() => setPhase(2), 1500),  // User Message
      setTimeout(() => setPhase(3), 2800),  // AI Processing line
      setTimeout(() => setPhase(4), 3800),  // AI Response
      setTimeout(() => setPhase(5), 6500),  // Exit prep
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-between px-[10vw]"
      {...sceneTransitions.slideLeft}
    >
      {/* Left side: Typography */}
      <div className="w-[40%] flex flex-col justify-center">
        <motion.div
          className="w-12 h-[2px] bg-[var(--color-primary)] mb-8"
          initial={{ width: 0 }}
          animate={phase >= 1 ? { width: 48 } : { width: 0 }}
          transition={{ duration: 0.8, ease: "circOut" }}
        />
        <motion.h2 
          className="text-[4vw] font-display text-white leading-tight mb-4"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          Always-On<br/>
          <span className="text-[var(--color-primary)]">AI Tutor</span>
        </motion.h2>
        <motion.p
          className="text-[1.5vw] font-body text-[var(--color-text-secondary)] font-light max-w-md"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.6 }}
        >
          Upload your notes, ask complex questions, and master concepts instantly.
        </motion.p>
      </div>

      {/* Right side: Abstract UI Representation */}
      <div className="w-[50%] relative h-[60vh] flex flex-col justify-end">
        
        {/* User Message */}
        <motion.div 
          className="self-end bg-[var(--color-bg-muted)] border border-white/10 rounded-2xl rounded-tr-sm p-6 mb-6 w-[80%]"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="w-[60%] h-3 bg-white/20 rounded mb-3" />
          <div className="w-[40%] h-3 bg-white/20 rounded" />
        </motion.div>

        {/* AI Processing indicator */}
        <motion.div
          className="self-start mb-6 px-4"
          initial={{ opacity: 0 }}
          animate={phase >= 3 && phase < 4 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex gap-2">
            <motion.div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} />
            <motion.div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.1 }} />
            <motion.div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} />
          </div>
        </motion.div>

        {/* AI Response */}
        <motion.div 
          className="self-start bg-[rgba(212,175,55,0.05)] border border-[var(--color-primary)]/30 rounded-2xl rounded-tl-sm p-6 w-[90%]"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={phase >= 4 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="w-full h-3 bg-[var(--color-primary)]/40 rounded mb-4" />
          <div className="w-[90%] h-3 bg-[var(--color-primary)]/40 rounded mb-4" />
          <div className="w-[75%] h-3 bg-[var(--color-primary)]/40 rounded" />
          
          <motion.div 
            className="mt-6 w-full h-[100px] border border-[var(--color-primary)]/20 rounded flex items-center justify-center overflow-hidden relative"
            initial={{ height: 0, opacity: 0 }}
            animate={phase >= 4 ? { height: 100, opacity: 1 } : { height: 0, opacity: 0 }}
            transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          >
            {/* Diagram abstraction */}
            <motion.div className="absolute inset-0 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent" />
            <svg className="w-[80%] h-[60%]" viewBox="0 0 100 40">
              <motion.path 
                d="M0,20 Q25,5 50,20 T100,20" 
                fill="none" 
                stroke="var(--color-primary)" 
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={phase >= 4 ? { pathLength: 1 } : { pathLength: 0 }}
                transition={{ duration: 1.5, delay: 1 }}
              />
            </svg>
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}