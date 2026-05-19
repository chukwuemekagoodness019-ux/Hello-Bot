import { useEffect, useState } from "react";

const QUOTES = [
  { text: "The beautiful thing about learning is that nobody can take it away from you.", author: "B.B. King" },
  { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" },
  { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Strive for progress, not perfection.", author: "Hi-There AI" },
  { text: "Every expert was once a beginner.", author: "Hi-There AI" },
  { text: "Consistency beats intensity. Show up every day.", author: "Hi-There AI" },
  { text: "A little progress each day adds up to big results.", author: "Hi-There AI" },
  { text: "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.", author: "Brian Herbert" },
  { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Push yourself, because no one else is going to do it for you.", author: "Hi-There AI" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Hi-There AI" },
  { text: "Don't watch the clock — do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Knowledge is power. Sharing knowledge is the beginning of wisdom.", author: "Hi-There AI" },
];

const SESSION_KEY = "hi_there_splash_shown";

export function MotivationalSplash() {
  const [visible, setVisible] = useState(() => {
    try { return !sessionStorage.getItem(SESSION_KEY); } catch { return false; }
  });
  const [fading, setFading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  useEffect(() => {
    if (!visible) return;
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}

    const start = Date.now();
    const total = 5500;
    const raf = requestAnimationFrame(function tick() {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / total) * 100));
      if (elapsed < total) requestAnimationFrame(tick);
    });

    const fadeTimer = setTimeout(() => setFading(true), total);
    const hideTimer = setTimeout(() => setVisible(false), total + 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [visible]);

  const handleSkip = () => {
    setFading(true);
    setTimeout(() => setVisible(false), 400);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-center px-8 transition-opacity duration-500 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-transparent to-purple-950/30 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-sm">
        <div className="w-20 h-20 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mb-6 shadow-xl shadow-primary/20">
          <span className="text-4xl">📚</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-1 tracking-tight">Hi-There</h1>
        <p className="text-sm text-muted-foreground mb-10">Your smart academic companion</p>

        <blockquote className="max-w-xs">
          <p className="text-base font-medium text-foreground/90 leading-relaxed italic">
            "{quote.text}"
          </p>
          <footer className="mt-4 text-xs text-muted-foreground">— {quote.author}</footer>
        </blockquote>

        <div className="mt-12 w-48 h-0.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <button
          onClick={handleSkip}
          className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg border border-white/10 hover:border-white/20"
        >
          Skip →
        </button>
      </div>
    </div>
  );
}
