import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Volume2, AlertCircle, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/hooks/use-chat-history";

interface MessageListProps {
  messages: ChatMessage[];
  isPending?: boolean;
  isUploading?: boolean;
  streamingMessage?: string;
  error?: string | null;
  onRetry?: () => void;
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

        <div className="space-y-2">
          <p className="text-2xl font-bold tracking-tight">
            <span className="text-neon-cyan">Hello!</span>{" "}
            <span className="text-slate-100">I'm your AI Study Buddy.</span>
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            Ask a question, upload your notes or PDF, or take a quick quiz.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {["📝 Explain a concept", "📄 Upload my notes", "🎯 Quiz me now"].map((chip) => (
            <span key={chip} className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-slate-400 bg-white/[0.04] select-none">
              {chip}
            </span>
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

      {messages.map((msg, idx) => (
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
              <MarkdownContent content={msg.content} />
            )}
          </div>

          {msg.role === "assistant" && (
            <button
              className={`mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all duration-150 ${
                speakingIdx === idx
                  ? "text-primary bg-primary/15"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
              onClick={() => handleTTS(msg.content, idx)}
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
        </div>
      ))}

      {/* Live streaming message */}
      {streamingMessage !== undefined && streamingMessage.length > 0 && (
        <div className="flex flex-col items-start animate-in fade-in duration-200 min-w-0">
          <div className="max-w-[88%] min-w-0 overflow-hidden px-4 py-3 rounded-2xl bubble-ai rounded-bl-sm shadow-xl shadow-black/40">
            <MarkdownContent content={streamingMessage} />
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

      {/* Thinking dots */}
      {isPending && !isUploading && (
        <div className="flex items-start animate-in fade-in duration-200">
          <div className="glass border border-white/8 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-3 shadow-xl">
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "160ms" }} />
              <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "320ms" }} />
            </div>
            <span className="italic text-xs text-slate-400">AI is thinking…</span>
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
