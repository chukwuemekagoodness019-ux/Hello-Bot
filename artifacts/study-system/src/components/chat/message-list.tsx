import { useRef, useEffect, useState } from "react";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Volume2, AlertCircle, RefreshCw, Square, Target, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/hooks/use-chat-history";
import { useToast } from "@/hooks/use-toast";

interface MessageListProps {
  messages: ChatMessage[];
  isPending?: boolean;
  isUploading?: boolean;
  streamingMessage?: string;
  error?: string | null;
  onRetry?: () => void;
  onSend?: (text: string) => void;
  streak?: number;
  displayName?: string | null;
  lastStudied?: { subject: string; date: string } | null;
  onMilestoneTick?: () => void;
}

type VoiceGender = "default" | "female" | "male";

function getVoice(gender: VoiceGender): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (gender === "female") {
    return (
      voices.find((v) =>
        /female|woman|zira|karen|samantha|victoria|moira|tessa|fiona|ava|allison|susan|helen/i.test(
          v.name,
        ),
      ) ??
      voices.find((v) => v.name.toLowerCase().includes("female")) ??
      voices[0]
    );
  }
  if (gender === "male") {
    return (
      voices.find((v) =>
        /male|man|daniel|alex|fred|tom|lee|david|jorge|diego|mark/i.test(v.name),
      ) ??
      voices.find((v) => v.name.toLowerCase().includes("male")) ??
      voices[0]
    );
  }
  return voices[0] ?? null;
}

const BASE = import.meta.env.BASE_URL as string;
const QUIZ_BRIDGE_REGEX = /\[TRIGGER_QUIZ_BRIDGE:\s*([^\]]+)\]\s*$/i;

function parseQuizBridge(content: string): { text: string; topic: string | null } {
  const match = QUIZ_BRIDGE_REGEX.exec(content);
  if (!match) return { text: content, topic: null };
  return {
    text: content.slice(0, match.index).trimEnd(),
    topic: match[1].trim(),
  };
}

const ROADMAP_REGEX = /\[START_ROADMAP\]([\s\S]*?)\[END_ROADMAP\]/i;

function parseRoadmap(content: string): { text: string; milestones: string[] | null } {
  const match = ROADMAP_REGEX.exec(content);
  if (!match) return { text: content, milestones: null };
  const milestones = match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const stripped = (
    content.slice(0, match.index) + content.slice(match.index + match[0].length)
  ).trim();
  return { text: stripped, milestones: milestones.length > 0 ? milestones : null };
}

// djb2-style hash — converts a milestone list into a short stable key.
function fingerprintMilestones(milestones: string[]): string {
  const str = milestones.join("|");
  let h = 0;
  for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}

interface StoredRoadmap {
  milestones: string[];
  checked: number[];
}

function RoadmapCard({ milestones, onMilestoneTick }: { milestones: string[]; onMilestoneTick?: () => void }) {
  const lsKey = `roadmap_${fingerprintMilestones(milestones)}`;

  const [checked, setChecked] = useState<Set<number>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(lsKey) ?? "null") as StoredRoadmap | null;
      if (stored?.checked) return new Set(stored.checked);
    } catch {}
    return new Set<number>();
  });

  // Persist to localStorage whenever the checked state changes.
  useEffect(() => {
    try {
      const data: StoredRoadmap = { milestones, checked: [...checked] };
      localStorage.setItem(lsKey, JSON.stringify(data));
    } catch {}
  }, [checked, lsKey, milestones]);

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
        onMilestoneTick?.();
      }
      return next;
    });
  };

  const done = checked.size;
  const total = milestones.length;

  return (
    <div
      className="mt-3 w-full max-w-[88%] rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400 shadow-xl shadow-black/40"
      style={{
        background: "rgba(15, 12, 30, 0.65)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(56, 189, 248, 0.18)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400">
          📋 Study Roadmap
        </span>
        <span className="text-[10px] text-slate-500 tabular-nums font-medium">
          {done}/{total} completed
        </span>
      </div>
      {total > 0 && (
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        {milestones.map((milestone, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all duration-150 ${
              checked.has(i)
                ? "bg-cyan-500/8 border border-cyan-500/20"
                : "bg-white/[0.03] border border-white/8 hover:border-cyan-500/25 hover:bg-white/5"
            }`}
          >
            <div
              className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
                checked.has(i) ? "bg-cyan-500 border-cyan-500" : "border-white/30"
              }`}
            >
              {checked.has(i) && (
                <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span
              className={`leading-relaxed break-words [overflow-wrap:anywhere] ${
                checked.has(i) ? "line-through text-slate-500" : "text-slate-300"
              }`}
            >
              {milestone}
            </span>
          </button>
        ))}
      </div>
      {done === total && total > 0 && (
        <div className="px-4 py-3 border-t border-white/8 text-center">
          <p className="text-xs font-medium" style={{ color: "#34d399" }}>
            🎉 Roadmap complete — you&apos;re exam ready!
          </p>
        </div>
      )}
    </div>
  );
}

function QuizBridgeCard({ topic }: { topic: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: topic,
          difficulty: "medium",
          questionType: "objective",
          numQuestions: 3,
          timeMinutes: 5,
        }),
      });
      if (res.status === 402) {
        toast({ title: "Daily quiz limit reached — upgrade to Premium for unlimited quizzes.", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error("Generation failed");
      const quiz = await res.json();
      sessionStorage.setItem("quizBridgeData", JSON.stringify(quiz));
      setLocation("/quiz");
    } catch {
      toast({ title: "Could not generate quiz. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 w-full max-w-[88%] rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-950/60 to-indigo-900/30 backdrop-blur-sm px-4 py-4 shadow-lg shadow-indigo-950/30 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/30">
          <Target className="h-4 w-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400 mb-1">Professor's Recommendation</p>
          <p className="text-sm text-slate-300 leading-relaxed">
            Your concept retention for <span className="font-semibold text-indigo-300">{topic}</span> can be locked in with a quick review. Tap below to generate a 3-question mastery check.
          </p>
        </div>
      </div>
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-500/90 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 active:scale-[0.98] shadow-md shadow-indigo-900/40 ring-1 ring-indigo-500/40"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating Quiz…
          </>
        ) : (
          <>
            <Target className="h-3.5 w-3.5" />
            Generate Quick Mastery Quiz
          </>
        )}
      </button>
    </div>
  );
}

function buildMemoryLine(subject: string, dateStr: string): string {
  try {
    const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
    if (diffDays <= 0) return `You studied ${subject} today. Keep the momentum going!`;
    if (diffDays === 1) return `You last reviewed ${subject} yesterday. Let's build on that foundation today.`;
    if (diffDays <= 7) return `You last reviewed ${subject} ${diffDays} days ago. Time to reinforce before it fades.`;
    return `You last studied ${subject} over a week ago. A quick review session will do wonders.`;
  } catch {
    return "";
  }
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="ai-prose max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export function MessageList({
  messages,
  isPending,
  isUploading,
  streamingMessage,
  error,
  onRetry,
  onSend,
  streak,
  displayName,
  lastStudied,
  onMilestoneTick,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("default");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  useEffect(() => {
    if (streamingMessage) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [streamingMessage]);

  const stripForTTS = (text: string): string =>
    text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/#+\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
      .replace(/[⚠️✓→←↑↓●•◦]\s*/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const handleTTS = (text: string, idx: number) => {
    if (!("speechSynthesis" in window)) return;
    if (speakingIdx === idx) {
      window.speechSynthesis.cancel();
      setSpeakingIdx(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleaned = stripForTTS(text);
    const utterance = new SpeechSynthesisUtterance(cleaned);

    const setVoiceAndSpeak = () => {
      const voice = getVoice(voiceGender);
      if (voice) utterance.voice = voice;
      utterance.rate = 0.95;
      utterance.pitch =
        voiceGender === "female" ? 1.15 : voiceGender === "male" ? 0.85 : 1;
      setSpeakingIdx(idx);
      utterance.onend = () => setSpeakingIdx(null);
      utterance.onerror = () => setSpeakingIdx(null);
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        setVoiceAndSpeak();
      };
    } else {
      setVoiceAndSpeak();
    }
  };

  const hasAssistantMsg =
    messages.some((m) => m.role === "assistant") || !!streamingMessage;

  if (messages.length === 0 && !streamingMessage && !isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-5 max-w-sm mx-auto px-4 pb-8">
        {/* Mascot: dark metallic robot with glowing cyan eyes, graduation cap, headphones */}
        <div className="relative shrink-0 select-none" aria-hidden="true">
          <svg width="148" height="168" viewBox="0 0 160 180" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="mg-head" x1="42" y1="44" x2="118" y2="116" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1e1735"/>
                <stop offset="100%" stopColor="#0d0b1a"/>
              </linearGradient>
              <radialGradient id="mg-eye" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00e5ff"/>
                <stop offset="65%" stopColor="#009ec4"/>
                <stop offset="100%" stopColor="#004d66"/>
              </radialGradient>
              <radialGradient id="mg-eyeglow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(0,229,255,0.35)"/>
                <stop offset="100%" stopColor="rgba(0,229,255,0)"/>
              </radialGradient>
              <linearGradient id="mg-body" x1="52" y1="118" x2="108" y2="168" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1a1730"/>
                <stop offset="100%" stopColor="#0d0b1e"/>
              </linearGradient>
              <linearGradient id="mg-arm" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#18153a"/>
                <stop offset="100%" stopColor="#0d0b1e"/>
              </linearGradient>
              <filter id="mg-glow">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {/* Headphone arc */}
            <path d="M32 88 Q32 52 80 52 Q128 52 128 88" stroke="rgba(0,229,255,0.6)" strokeWidth="5" fill="none" strokeLinecap="round"/>
            <rect x="22" y="84" width="16" height="24" rx="6" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.55)" strokeWidth="1.5"/>
            <rect x="122" y="84" width="16" height="24" rx="6" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.55)" strokeWidth="1.5"/>
            {/* Graduation cap — flat board */}
            <rect x="36" y="20" width="88" height="13" rx="3" fill="#312e81"/>
            <rect x="48" y="31" width="64" height="14" rx="3" fill="#1e1b4b"/>
            {/* Center button */}
            <circle cx="80" cy="20" r="4.5" fill="#00E5FF" opacity="0.9"/>
            {/* Tassel */}
            <line x1="114" y1="22" x2="126" y2="44" stroke="rgba(0,229,255,0.65)" strokeWidth="1.5"/>
            <circle cx="126" cy="47" r="3.5" fill="rgba(0,229,255,0.75)"/>
            {/* Robot head */}
            <rect x="42" y="44" width="76" height="74" rx="17" fill="url(#mg-head)"/>
            <rect x="42" y="44" width="76" height="74" rx="17" fill="none" stroke="rgba(56,189,248,0.22)" strokeWidth="1.5"/>
            {/* Eye glows */}
            <ellipse cx="64" cy="79" rx="14" ry="14" fill="url(#mg-eyeglow)" filter="url(#mg-glow)"/>
            <ellipse cx="96" cy="79" rx="14" ry="14" fill="url(#mg-eyeglow)" filter="url(#mg-glow)"/>
            {/* Eyes */}
            <ellipse cx="64" cy="79" rx="9.5" ry="9" fill="url(#mg-eye)"/>
            <ellipse cx="96" cy="79" rx="9.5" ry="9" fill="url(#mg-eye)"/>
            {/* Eye highlights */}
            <ellipse cx="61" cy="76" rx="3.5" ry="3" fill="rgba(255,255,255,0.48)"/>
            <ellipse cx="93" cy="76" rx="3.5" ry="3" fill="rgba(255,255,255,0.48)"/>
            {/* Smile */}
            <path d="M 66 98 Q 80 110 94 98" stroke="rgba(0,229,255,0.7)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            {/* Body */}
            <rect x="50" y="120" width="60" height="52" rx="13" fill="url(#mg-body)"/>
            <rect x="50" y="120" width="60" height="52" rx="13" fill="none" stroke="rgba(56,189,248,0.18)" strokeWidth="1"/>
            {/* Chest panel */}
            <rect x="62" y="130" width="36" height="24" rx="5" fill="rgba(0,229,255,0.04)" stroke="rgba(56,189,248,0.22)" strokeWidth="1"/>
            <circle cx="71" cy="142" r="4" fill="rgba(0,229,255,0.82)" filter="url(#mg-glow)"/>
            <circle cx="80" cy="142" r="2.5" fill="rgba(99,102,241,0.8)"/>
            <circle cx="89" cy="142" r="4" fill="rgba(0,229,255,0.82)" filter="url(#mg-glow)"/>
            {/* Arms */}
            <rect x="28" y="124" width="20" height="38" rx="10" fill="#18153a" stroke="rgba(56,189,248,0.14)" strokeWidth="1"/>
            <rect x="112" y="124" width="20" height="38" rx="10" fill="#18153a" stroke="rgba(56,189,248,0.14)" strokeWidth="1"/>
          </svg>
          {/* Subtle glow halo behind mascot */}
          <div className="absolute inset-0 -z-10 blur-3xl opacity-30" style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(0,229,255,0.35) 0%, transparent 70%)" }} />
        </div>

        {(streak ?? 0) >= 2 && (
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 border border-orange-500/25 bg-orange-500/8 shadow-sm"
            style={{ boxShadow: "0 0 14px rgba(249,115,22,0.12)" }}
          >
            <span className="text-lg leading-none select-none" aria-hidden="true">🔥</span>
            <span className="text-sm font-bold text-orange-400">{streak}-Day Study Streak</span>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-2xl font-bold tracking-tight">
            {displayName ? (
              <>
                <span className="text-neon-cyan">Hey, {displayName}!</span>{" "}
                <span className="text-slate-100">Ready to study?</span>
              </>
            ) : (
              <>
                <span className="text-neon-cyan">Hello!</span>{" "}
                <span className="text-slate-100">I'm your AI Study Buddy.</span>
              </>
            )}
          </p>
          {lastStudied && (() => {
            const line = buildMemoryLine(lastStudied.subject, lastStudied.date);
            return line ? (
              <p className="text-xs text-slate-500 leading-relaxed">{line}</p>
            ) : null;
          })()}
          <p className="text-sm text-slate-400 leading-relaxed">
            Ask a question, upload your notes or PDF, or take a quick quiz.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {[
            { label: "📝 Explain a concept", msg: "Can you explain a key concept for me?" },
            { label: "📄 Upload my notes", msg: "I want to study from my PDF or notes — how do I upload them?" },
            { label: "🎯 Quiz me now", msg: "Quiz me on my recent study topics." },
          ].map(({ label, msg }) => (
            <button
              key={label}
              onClick={() => onSend?.(msg)}
              className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-slate-400 bg-white/[0.04] hover:bg-white/[0.08] hover:text-slate-200 hover:border-white/20 transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5 pb-4">
      {hasAssistantMsg && (
        <div className="flex items-center justify-end gap-1 opacity-50 hover:opacity-100 transition-opacity duration-200">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider mr-1">
            Voice:
          </span>
          {(["default", "female", "male"] as VoiceGender[]).map((g) => (
            <button
              key={g}
              onClick={() => setVoiceGender(g)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all duration-150 ${
                voiceGender === g
                  ? "bg-primary/20 border-primary/50 text-primary font-medium"
                  : "border-white/10 text-slate-400 hover:border-primary/30 hover:text-slate-300"
              }`}
            >
              {g === "default" ? "Auto" : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      )}

      {messages.map((msg, idx) => {
        const { text: afterRoadmap, milestones } =
          msg.role === "assistant"
            ? parseRoadmap(msg.content)
            : { text: msg.content, milestones: null };
        const { text: displayContent, topic: bridgeTopic } =
          msg.role === "assistant"
            ? parseQuizBridge(afterRoadmap)
            : { text: afterRoadmap, topic: null };
        return (
          <div
            key={idx}
            className={`flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 min-w-0 ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[88%] min-w-0 overflow-hidden px-4 py-3 rounded-2xl ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 text-white rounded-br-sm shadow-lg shadow-indigo-900/40 ring-1 ring-white/10"
                  : "bubble-ai rounded-bl-sm shadow-xl shadow-black/40"
              }`}
            >
              {msg.role === "user" ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-white break-words [overflow-wrap:anywhere]">
                  {msg.content}
                </div>
              ) : (
                <MarkdownContent content={displayContent} />
              )}
            </div>

            {msg.role === "assistant" && (
              <button
                className={`mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all duration-150 ${
                  speakingIdx === idx
                    ? "text-primary bg-primary/15"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }`}
                onClick={() => handleTTS(displayContent, idx)}
                title={speakingIdx === idx ? "Stop" : "Listen"}
              >
                {speakingIdx === idx ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3 h-3" />
                    <span>Listen</span>
                  </>
                )}
              </button>
            )}

            {milestones && milestones.length > 0 && (
              <RoadmapCard milestones={milestones} onMilestoneTick={onMilestoneTick} />
            )}
            {bridgeTopic && <QuizBridgeCard topic={bridgeTopic} />}
          </div>
        );
      })}

      {/* Live streaming message */}
      {streamingMessage !== undefined && streamingMessage.length > 0 && (
        <div className="flex flex-col items-start animate-in fade-in duration-200 min-w-0">
          <div className="max-w-[88%] min-w-0 overflow-hidden px-4 py-3 rounded-2xl bubble-ai rounded-bl-sm shadow-xl shadow-black/40">
            <MarkdownContent content={parseQuizBridge(parseRoadmap(streamingMessage).text).text} />
            <span className="inline-block w-0.5 h-4 bg-primary/70 ml-0.5 animate-pulse align-text-bottom" />
          </div>
        </div>
      )}

      {/* File upload / OCR processing indicator */}
      {isUploading && (
        <div className="flex items-start animate-in fade-in duration-200">
          <div className="glass border border-primary/20 bg-primary/5 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-3 shadow-xl shadow-indigo-900/20">
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "160ms" }} />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "320ms" }} />
            </div>
            <span className="italic text-xs text-slate-400">Analysing file… please wait</span>
          </div>
        </div>
      )}

      {/* Premium AI thinking state */}
      {isPending && !isUploading && (
        <div className="flex items-start animate-in fade-in duration-200">
          <div className="bubble-ai rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-3 shadow-xl">
            {/* Mini mascot head — dark chassis, glowing cyan eyes */}
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" aria-hidden="true">
              <defs>
                <radialGradient id="ti-eye" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#00e5ff"/>
                  <stop offset="100%" stopColor="#0077aa"/>
                </radialGradient>
                <filter id="ti-glow">
                  <feGaussianBlur stdDeviation="1.2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              {/* Cap board */}
              <rect x="5" y="3" width="22" height="4" rx="1" fill="#312e81"/>
              <rect x="10" y="7" width="12" height="3" rx="1" fill="#1e1b4b"/>
              <circle cx="16" cy="3" r="1.5" fill="#00e5ff" opacity="0.9"/>
              {/* Head */}
              <rect x="7" y="9" width="18" height="17" rx="5" fill="#1a1535"/>
              <rect x="7" y="9" width="18" height="17" rx="5" fill="none" stroke="rgba(56,189,248,0.3)" strokeWidth="1"/>
              {/* Eyes glow */}
              <ellipse cx="12" cy="17" rx="3.5" ry="3.5" fill="rgba(0,229,255,0.2)" filter="url(#ti-glow)"/>
              <ellipse cx="20" cy="17" rx="3.5" ry="3.5" fill="rgba(0,229,255,0.2)" filter="url(#ti-glow)"/>
              {/* Eyes */}
              <ellipse cx="12" cy="17" rx="2.5" ry="2.4" fill="url(#ti-eye)"/>
              <ellipse cx="20" cy="17" rx="2.5" ry="2.4" fill="url(#ti-eye)"/>
              {/* Highlights */}
              <ellipse cx="11.2" cy="16.2" rx="0.9" ry="0.8" fill="rgba(255,255,255,0.55)"/>
              <ellipse cx="19.2" cy="16.2" rx="0.9" ry="0.8" fill="rgba(255,255,255,0.55)"/>
              {/* Smile */}
              <path d="M 12.5 22 Q 16 24.5 19.5 22" stroke="rgba(0,229,255,0.65)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
            </svg>
            <div className="flex gap-1.5 items-center">
              <span className="w-2 h-2 rounded-full bg-[#00E5FF]/70 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-[#00E5FF]/70 animate-bounce" style={{ animationDelay: "160ms" }} />
              <span className="w-2 h-2 rounded-full bg-[#00E5FF]/70 animate-bounce" style={{ animationDelay: "320ms" }} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl mb-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 glass border-white/10 hover:border-white/20">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          )}
        </div>
      )}

      <div ref={bottomRef} className="h-px" />
    </div>
  );
}
