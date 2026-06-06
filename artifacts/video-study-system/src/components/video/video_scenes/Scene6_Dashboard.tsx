import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video/animations';

export function Scene6_Dashboard() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Title
      setTimeout(() => setPhase(2), 1200),  // Chart axes
      setTimeout(() => setPhase(3), 2000),  // Data polygon
      setTimeout(() => setPhase(4), 6000),  // Exit prep
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-between px-[10vw]"
      {...sceneTransitions.slideRight}
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
          Precision<br/>
          <span className="text-[var(--color-primary)]">Analytics</span>
        </motion.h2>
        <motion.p
          className="text-[1.5vw] font-body text-[var(--color-text-secondary)] font-light max-w-md"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.6 }}
        >
          Identify weak subjects and optimize your study roadmap automatically.
        </motion.p>
      </div>

      {/* Right side: Abstract Radar Chart */}
      <div className="w-[50%] relative flex items-center justify-center h-full">
        <div className="relative w-[30vw] h-[30vw]">
          
          {/* Radar Axes */}
          {[0, 60, 120, 180, 240, 300].map((angle, i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white/10 origin-left"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={phase >= 2 ? { scaleX: 0.5, opacity: 1, rotate: angle } : { scaleX: 0, opacity: 0 }}
              transition={{ duration: 1, delay: i * 0.1, ease: "circOut" }}
            />
          ))}

          {/* Concentric Hexagons */}
          {[0.3, 0.6, 1].map((scale, i) => (
            <motion.div
              key={`hex-${i}`}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ scale: 0, opacity: 0 }}
              animate={phase >= 2 ? { scale, opacity: 1 } : { scale: 0, opacity: 0 }}
              transition={{ duration: 1.5, delay: i * 0.2, ease: "easeOut" }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full text-white/10" style={{ overflow: 'visible' }}>
                <polygon points="50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </motion.div>
          ))}

          {/* Data Polygon */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center drop-shadow-[0_0_15px_rgba(212,175,55,0.4)]"
            initial={{ scale: 0, opacity: 0, rotate: -20 }}
            animate={phase >= 3 ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0, opacity: 0, rotate: -20 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          >
             <svg viewBox="0 0 100 100" className="w-full h-full text-[var(--color-primary)]" style={{ overflow: 'visible' }}>
                <path 
                  d="M50,15 L85,35 L75,80 L50,95 L20,70 L15,40 Z" 
                  fill="currentColor" fillOpacity="0.15" 
                  stroke="currentColor" strokeWidth="1.5" 
                />
                {/* Data points */}
                <circle cx="50" cy="15" r="1.5" fill="#fff" />
                <circle cx="85" cy="35" r="1.5" fill="#fff" />
                <circle cx="75" cy="80" r="1.5" fill="#fff" />
                <circle cx="50" cy="95" r="1.5" fill="#fff" />
                <circle cx="20" cy="70" r="1.5" fill="#fff" />
                <circle cx="15" cy="40" r="1.5" fill="#fff" />
             </svg>
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}