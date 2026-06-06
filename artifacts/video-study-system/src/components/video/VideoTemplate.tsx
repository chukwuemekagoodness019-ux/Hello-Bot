import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1_Challenge } from './video_scenes/Scene1_Challenge';
import { Scene2_Solution } from './video_scenes/Scene2_Solution';
import { Scene3_Tutor } from './video_scenes/Scene3_Tutor';
import { Scene4_Quizzes } from './video_scenes/Scene4_Quizzes';
import { Scene5_Exam } from './video_scenes/Scene5_Exam';
import { Scene6_Dashboard } from './video_scenes/Scene6_Dashboard';
import { Scene7_Outcome } from './video_scenes/Scene7_Outcome';
import { Scene8_Resolve } from './video_scenes/Scene8_Resolve';

export const SCENE_DURATIONS: Record<string, number> = {
  challenge: 10000,
  solution: 9000,
  tutor: 7500,
  quizzes: 7000,
  exam: 7500,
  dashboard: 7000,
  outcome: 6000,
  resolve: 8000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  challenge: Scene1_Challenge,
  solution: Scene2_Solution,
  tutor: Scene3_Tutor,
  quizzes: Scene4_Quizzes,
  exam: Scene5_Exam,
  dashboard: Scene6_Dashboard,
  outcome: Scene7_Outcome,
  resolve: Scene8_Resolve,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="w-full h-screen overflow-hidden relative bg-[var(--color-bg-dark)]">
      
      {/* Persistent Background Layer */}
      <div className="absolute inset-0 z-0">
        <div className="noise-overlay" />
        
        {/* Soft slow-drifting radial gradient for depth */}
        <motion.div 
          className="absolute w-[120vw] h-[120vh] -top-[10vh] -left-[10vw] opacity-30"
          style={{ background: 'radial-gradient(circle at center, rgba(15,23,42,0.8) 0%, rgba(2,6,23,1) 70%)' }}
          animate={{
            scale: [1, 1.05, 0.95, 1],
            x: ['0%', '2%', '-2%', '0%'],
            y: ['0%', '-2%', '2%', '0%']
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />

        {/* Global Accent Glow — shifts position with scene */}
        <motion.div
          className="absolute w-[50vw] h-[50vw] rounded-full blur-[120px]"
          style={{ background: 'var(--color-primary)' }}
          animate={{
            x: ['-20vw', '50vw', '80vw', '20vw', '-20vw', '60vw', '10vw', '-10vw'][sceneIndex] ?? '-20vw',
            y: ['-10vh', '30vh', '-20vh', '60vh', '-10vh', '20vh', '50vh', '-5vh'][sceneIndex] ?? '-10vh',
            scale: [1, 1.5, 0.8, 1.2, 1, 1.3, 0.9, 1.1][sceneIndex] ?? 1,
            opacity: [0.05, 0.12, 0.08, 0.15, 0.05, 0.10, 0.07, 0.12][sceneIndex] ?? 0.07,
          }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Persistent Midground Layer: Frame Borders */}
      <div className="absolute inset-8 border border-white/5 pointer-events-none z-40">
        {/* Subtle corner accents */}
        <div className="absolute top-0 left-0 w-4 h-px bg-[var(--color-primary)] opacity-50" />
        <div className="absolute top-0 left-0 w-px h-4 bg-[var(--color-primary)] opacity-50" />
        <div className="absolute top-0 right-0 w-4 h-px bg-[var(--color-primary)] opacity-50" />
        <div className="absolute top-0 right-0 w-px h-4 bg-[var(--color-primary)] opacity-50" />
        <div className="absolute bottom-0 left-0 w-4 h-px bg-[var(--color-primary)] opacity-50" />
        <div className="absolute bottom-0 left-0 w-px h-4 bg-[var(--color-primary)] opacity-50" />
        <div className="absolute bottom-0 right-0 w-4 h-px bg-[var(--color-primary)] opacity-50" />
        <div className="absolute bottom-0 right-0 w-px h-4 bg-[var(--color-primary)] opacity-50" />
      </div>

      {/* Foreground Content */}
      <div className="absolute inset-0 z-10">
        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
