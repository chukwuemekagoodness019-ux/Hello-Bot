import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAnalytics } from "@/contexts/analytics-context";
import {
  Flame, TrendingDown, Map, ChevronRight, ArrowLeft,
  MessageSquare, GraduationCap, FileText, BarChart2,
  Trophy, CheckCircle2, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentModal } from "@/components/payment-modal";

const BASE = import.meta.env.BASE_URL as string;

// ── Types ──────────────────────────────────────────────────────────────────────

interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  bestScore: number;
  lastActiveDate: string | null;
}

interface WeaknessEntry {
  subject: string;
  avgPercent: number;
  attempts: number;
  lastAttemptAt: string;
}

interface RecentAttempt {
  subject: string;
  percent: number;
  score: number;
  total: number;
  createdAt: string;
}

interface DashboardData {
  streak: StreakInfo;
  weaknesses: WeaknessEntry[];
  recentAttempts: RecentAttempt[];
}

// ── Roadmap helpers ────────────────────────────────────────────────────────────

interface StoredRoadmap {
  milestones: string[];
  checked: number[];
}

interface ActiveRoadmap {
  lsKey: string;
  milestones: string[];
  checked: Set<number>;
}

function loadActiveRoadmaps(): ActiveRoadmap[] {
  const result: ActiveRoadmap[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("roadmap_")) continue;
      try {
        const stored = JSON.parse(
          localStorage.getItem(key) ?? "null",
        ) as StoredRoadmap | null;
        if (!stored?.milestones?.length) continue;
        const checkedSet = new Set(stored.checked ?? []);
        if (checkedSet.size < stored.milestones.length) {
          result.push({ lsKey: key, milestones: stored.milestones, checked: checkedSet });
        }
      } catch {}
    }
  } catch {}
  return result;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StreakBanner({ streak }: { streak: StreakInfo }) {
  const days = streak.currentStreak;
  const label =
    days === 0
      ? "No active streak — start studying today!"
      : days === 1
      ? "1-day streak — keep it up!"
      : `${days}-day streak — you're on fire!`;

  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-4 shadow-xl shadow-orange-500/10"
      style={{
        background:
          "linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(239,68,68,0.10) 100%)",
        border: "1px solid rgba(251,146,60,0.30)",
        backdropFilter: "blur(12px)",
      }}
    >
      <span className="text-5xl select-none" role="img" aria-label="fire">
        🔥
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-orange-300 font-bold text-lg leading-tight">{label}</p>
        <div className="flex gap-4 mt-1.5">
          <span className="text-xs text-slate-400">
            Best streak:{" "}
            <span className="text-slate-200 font-semibold">{streak.bestStreak} days</span>
          </span>
          <span className="text-xs text-slate-400">
            Best score:{" "}
            <span className="text-slate-200 font-semibold">{streak.bestScore}%</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function WeaknessTerminal({
  weaknesses,
  onRemediate,
}: {
  weaknesses: WeaknessEntry[];
  onRemediate: (subject: string) => void;
}) {
  if (weaknesses.length === 0) {
    return (
      <div
        className="rounded-2xl p-5 text-center"
        style={{
          background: "rgba(15,12,30,0.65)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <p className="text-slate-400 text-sm">
          🎉 No weak subjects detected in the last 30 days.
        </p>
        <p className="text-slate-500 text-xs mt-1">Keep taking quizzes to populate this section.</p>
      </div>
    );
  }

  function barColor(pct: number) {
    if (pct < 40) return "#ef4444";
    if (pct < 60) return "#f97316";
    return "#eab308";
  }

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-xl"
      style={{
        background: "rgba(15,12,30,0.65)",
        border: "1px solid rgba(239,68,68,0.20)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
        <TrendingDown className="w-4 h-4 text-red-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-red-400">
          Weak Subjects
        </span>
        <span className="ml-auto text-[10px] text-slate-500">last 30 days · avg &lt; 70%</span>
      </div>
      <div className="p-3 space-y-2">
        {weaknesses.map((w) => (
          <div
            key={w.subject}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-200 truncate">{w.subject}</span>
                <span
                  className="text-sm font-bold ml-2 tabular-nums shrink-0"
                  style={{ color: barColor(w.avgPercent) }}
                >
                  {w.avgPercent}%
                </span>
              </div>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${w.avgPercent}%`,
                    background: barColor(w.avgPercent),
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {w.attempts} attempt{w.attempts !== 1 ? "s" : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs h-7 px-2.5 border-red-400/30 text-red-300 hover:bg-red-500/10"
              onClick={() => onRemediate(w.subject)}
            >
              Remediate
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapWidget({ roadmaps }: { roadmaps: ActiveRoadmap[] }) {
  const [list, setList] = useState<ActiveRoadmap[]>(roadmaps);

  const toggle = (lsKey: string, i: number) => {
    setList((prev) =>
      prev.map((r) => {
        if (r.lsKey !== lsKey) return r;
        const next = new Set(r.checked);
        if (next.has(i)) next.delete(i); else next.add(i);
        try {
          localStorage.setItem(lsKey, JSON.stringify({ milestones: r.milestones, checked: [...next] }));
        } catch {}
        return { ...r, checked: next };
      }).filter((r) => r.checked.size < r.milestones.length),
    );
  };

  if (list.length === 0) {
    return (
      <div
        className="rounded-2xl p-5 text-center"
        style={{
          background: "rgba(15,12,30,0.65)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Map className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">No active study roadmaps.</p>
        <p className="text-slate-500 text-xs mt-1">
          Ask the AI tutor to generate a roadmap in Chat and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((r) => {
        const done = r.checked.size;
        const total = r.milestones.length;
        return (
          <div
            key={r.lsKey}
            className="rounded-2xl overflow-hidden shadow-xl"
            style={{
              background: "rgba(15,12,30,0.65)",
              border: "1px solid rgba(56,189,248,0.18)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400">
                📋 Study Roadmap
              </span>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {done}/{total} completed
              </span>
            </div>
            <div className="h-1 bg-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
            <div className="p-3 space-y-1.5">
              {r.milestones.map((ms, i) => (
                <button
                  key={i}
                  onClick={() => toggle(r.lsKey, i)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all duration-150 ${
                    r.checked.has(i)
                      ? "bg-cyan-500/8 border border-cyan-500/20"
                      : "bg-white/[0.03] border border-white/8 hover:border-cyan-500/25 hover:bg-white/5"
                  }`}
                >
                  {r.checked.has(i) ? (
                    <CheckCircle2 className="mt-0.5 shrink-0 w-4 h-4 text-cyan-400" />
                  ) : (
                    <Circle className="mt-0.5 shrink-0 w-4 h-4 text-white/30" />
                  )}
                  <span
                    className={`leading-relaxed break-words [overflow-wrap:anywhere] ${
                      r.checked.has(i) ? "line-through text-slate-500" : "text-slate-300"
                    }`}
                  >
                    {ms}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentActivity({ attempts }: { attempts: RecentAttempt[] }) {
  if (attempts.length === 0) return null;

  function pctColor(p: number) {
    if (p >= 80) return "text-emerald-400";
    if (p >= 60) return "text-yellow-400";
    return "text-red-400";
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(15,12,30,0.65)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
          Recent Activity
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {attempts.map((a, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 font-medium truncate">{a.subject}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {a.score}/{a.total} correct ·{" "}
                {new Date(a.createdAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric",
                })}
              </p>
            </div>
            <span className={`text-sm font-bold tabular-nums ${pctColor(a.percent)}`}>
              {a.percent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roadmaps] = useState<ActiveRoadmap[]>(() => loadActiveRoadmaps());

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}api/dashboard`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<DashboardData>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load dashboard.");
        setLoading(false);
      });
  }, []);

  const { trackEvent } = useAnalytics();

  const handleRemediate = (subject: string) => {
    trackEvent("Weakness Remediated", { subject });
    const prompt = `I need help with ${subject}. My average score on this topic is below 70%. Please give me a targeted review with explanations and examples to help me improve.`;
    setLocation(`/?ep=${encodeURIComponent(prompt)}`);
  };

  return (
    <div
      className="min-h-full flex flex-col pb-24"
      style={{ background: "linear-gradient(160deg, #090514 0%, #0d0922 100%)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/8"
        style={{ background: "rgba(9,5,20,0.92)", backdropFilter: "blur(12px)" }}
      >
        <button
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/8 transition-colors"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-base">Academic Dashboard</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-xl mx-auto w-full">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div
            className="rounded-2xl p-5 text-center"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.20)",
            }}
          >
            <p className="text-red-400 text-sm font-medium">
              Could not load dashboard data.
            </p>
            <p className="text-slate-500 text-xs mt-1">{error}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {data && !loading && (
          <>
            <StreakBanner streak={data.streak} />

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 px-1">
                Weak Subjects
              </h2>
              <WeaknessTerminal
                weaknesses={data.weaknesses}
                onRemediate={handleRemediate}
              />
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 px-1">
                Study Roadmaps
              </h2>
              <RoadmapWidget roadmaps={roadmaps} />
            </section>

            {data.recentAttempts.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 px-1">
                  Recent Attempts
                </h2>
                <RecentActivity attempts={data.recentAttempts} />
              </section>
            )}
          </>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 inset-x-0 z-20 border-t border-white/8 flex md:hidden nav-safe"
        style={{ background: "rgba(9,5,20,0.98)" }}
      >
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors"
          onClick={() => setLocation("/")}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-medium">Chat</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors"
          onClick={() => setLocation("/quiz")}
        >
          <GraduationCap className="w-5 h-5" />
          <span className="text-[10px] font-medium">Quiz</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors"
          onClick={() => setLocation("/exam")}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-medium">Exam</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary"
        >
          <BarChart2 className="w-5 h-5" />
          <span className="text-[10px] font-medium">Stats</span>
        </button>
      </nav>

      <PaymentModal />
    </div>
  );
}
