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
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center shadow-xl">
          <span className="text-3xl">📚</span>
        </div>
        <p className="text-xl font-semibold text-slate-100">Ready to study?</p>
        <p className="text-sm text-slate-400 leading-relaxed">
          Ask a question, upload your notes or PDF, or take a quick quiz.
        </p>
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
          className={`flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 ${
            msg.role === "user" ? "items-end" : "items-start"
          }`}
        >
          <div
            className={`max-w-[88%] px-4 py-3 rounded-2xl ${
              msg.role === "user"
                ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-sm shadow-lg shadow-indigo-900/30"
                : "glass border border-white/8 rounded-bl-sm shadow-xl"
            }`}
          >
            {msg.role === "user" ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-white">
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
        <div className="flex flex-col items-start animate-in fade-in duration-200">
          <div className="max-w-[88%] px-4 py-3 rounded-2xl glass border border-white/8 rounded-bl-sm shadow-xl">
            <MarkdownContent content={streamingMessage} />
            <span className="inline-block w-0.5 h-4 bg-primary/70 ml-0.5 animate-pulse align-text-bottom" />
          </div>
        </div>
      )}

      {/* File upload / OCR processing indicator */}
      {isUploading && (
        <div className="flex items-start animate-in fade-in duration-200">
          <div className="glass border border-primary/30 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-3 shadow-xl">
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
              <span className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: "160ms" }} />
              <span className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: "320ms" }} />
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
