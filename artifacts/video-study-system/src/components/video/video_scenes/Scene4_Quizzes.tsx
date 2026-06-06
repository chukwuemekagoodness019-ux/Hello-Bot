import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene4_Quizzes() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Title
      setTimeout(() => setPhase(2), 1200),  // Question UI
      setTimeout(() => setPhase(3), 2500),  // Select answer
      setTimeout(() => setPhase(4), 3500),  // Difficulty scales up
      setTimeout(() => setPhase(5), 6000),  // Exit prep
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-row-reverse items-center justify-between px-[10vw]"
      {...sceneTransitions.wipe}
    >
      {/* Right side (Text): Typography */}
      <div className="w-[40%] flex flex-col justify-center items-end text-right">
        <motion.div
          className="w-12 h-[2px] bg-[var(--color-primary)] mb-8"
          initial={{ width: 0 }}
          animate={phase >= 1 ? { width: 48 } : { width: 0 }}
          transition={{ duration: 0.8, ease: "circOut" }}
        />
        <motion.h2 
          className="text-[4vw] font-display text-white leading-tight mb-4"
          initial={{ opacity: 0, x: 30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          Adaptive<br/>
          <span className="text-[var(--color-primary)]">Practice</span>
        </motion.h2>
        <motion.p
          className="text-[1.5vw] font-body text-[var(--color-text-secondary)] font-light max-w-md"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.6 }}
        >
          Questions dynamically scale in difficulty as your mastery grows.
        </motion.p>
      </div>

      {/* Left side: Quiz Abstraction */}
      <div className="w-[50%] relative h-[60vh] flex flex-col justify-center border-l border-white/10 pl-12">
        
        {/* Difficulty Meter */}
        <motion.div 
          className="absolute -left-6 top-1/2 -translate-y-1/2 h-[80%] w-12 flex flex-col items-center justify-between py-4"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1 }}
        >
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] rotate-[-90deg] mb-8 whitespace-nowrap">Hard</div>
          <div className="w-1 flex-1 bg-white/5 rounded-full relative overflow-hidden flex flex-col-reverse">
            <motion.div 
              className="w-full bg-[var(--color-primary)]"
              initial={{ height: "30%" }}
              animate={phase >= 4 ? { height: "85%" } : { height: "30%" }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] rotate-[-90deg] mt-8 whitespace-nowrap">Easy</div>
        </motion.div>

        {/* Question Block */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8 }}
        >
          <div className="w-[80%] h-4 bg-white/20 rounded mb-3" />
          <div className="w-[60%] h-4 bg-white/20 rounded" />
        </motion.div>

        {/* Answers */}
        <div className="space-y-4 w-[90%]">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-full h-16 border rounded-lg flex items-center px-6 relative overflow-hidden"
              initial={{ opacity: 0, x: -20, borderColor: 'rgba(255,255,255,0.1)' }}
              animate={{ 
                opacity: phase >= 2 ? 1 : 0, 
                x: phase >= 2 ? 0 : -20,
                borderColor: (phase >= 3 && i === 1) ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                backgroundColor: (phase >= 3 && i === 1) ? 'rgba(212,175,55,0.1)' : 'transparent'
              }}
              transition={{ 
                duration: 0.6, 
                delay: phase >= 2 ? 0.2 + (i * 0.1) : 0,
                borderColor: { duration: 0.3 }
              }}
            >
              <div className="w-6 h-6 rounded-full border border-white/20 mr-4 flex items-center justify-center">
                {(phase >= 3 && i === 1) && (
                  <motion.div 
                    className="w-3 h-3 rounded-full bg-[var(--color-primary)]"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  />
                )}
              </div>
              <div className={`h-2 rounded ${i === 1 && phase >= 3 ? 'bg-[var(--color-primary)]/50' : 'bg-white/10'}`} style={{ width: `${40 + (i * 15)}%` }} />
            </motion.div>
          ))}
        </div>

      </div>
    </motion.div>
  );
}