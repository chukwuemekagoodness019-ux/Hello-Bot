import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Volume2, AlertCircle, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/hooks/use-chat-history";

interface MessageListProps {
  messages: ChatMessage[];
  isPending?: boolean;
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
      voices.find((v) => /female|woman|zira|karen|samantha|victoria|moira|tessa|fiona|ava|allison|susan|helen/i.test(v.name)) ??
      voices.find((v) => v.name.toLowerCase().includes("female")) ??
      voices[0]
    );
  }
  if (gender === "male") {
    return (
      voices.find((v) => /male|man|daniel|alex|fred|tom|lee|david|jorge|diego|mark/i.test(v.name)) ??
      voices.find((v) => v.name.toLowerCase().includes("male")) ??
      voices[0]
    );
  }
  return voices[0] ?? null;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-p:my-2 prose-pre:bg-muted/60 prose-pre:text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:my-0.5 max-w-none prose-a:text-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export function MessageList({ messages, isPending, streamingMessage, error, onRetry }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("default");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  useEffect(() => {
    if (streamingMessage) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [streamingMessage]);

  const handleTTS = (text: string, idx: number) => {
    if (!("speechSynthesis" in window)) return;
    if (speakingIdx === idx) {
      window.speechSynthesis.cancel();
      setSpeakingIdx(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const setVoiceAndSpeak = () => {
      const voice = getVoice(voiceGender);
      if (voice) utterance.voice = voice;
      utterance.rate = 0.95;
      utterance.pitch = voiceGender === "female" ? 1.15 : voiceGender === "male" ? 0.85 : 1;
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

  const hasAssistantMsg = messages.some((m) => m.role === "assistant") || !!streamingMessage;

  if (messages.length === 0 && !streamingMessage && !isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
          <span className="text-3xl">📚</span>
        </div>
        <p className="text-xl font-semibold text-foreground">Ready to study?</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          Ask a question, upload your notes or PDF, or take a quick quiz.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5 pb-4">
      {hasAssistantMsg && (
        <div className="flex items-center justify-end gap-1 opacity-60 hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Voice:</span>
          {(["default", "female", "male"] as VoiceGender[]).map((g) => (
            <button
              key={g}
              onClick={() => setVoiceGender(g)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                voiceGender === g
                  ? "bg-primary/15 border-primary/40 text-primary font-medium"
                  : "border-white/10 text-muted-foreground hover:border-primary/30"
              }`}
            >
              {g === "default" ? "Auto" : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      )}

      {messages.map((msg, idx) => (
        <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
          <div
            className={`max-w-[88%] px-4 py-3 rounded-2xl ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm shadow-lg shadow-primary/20"
                : "glass rounded-bl-sm shadow-sm"
            }`}
          >
            {msg.role === "user" ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
            ) : (
              <MarkdownContent content={msg.content} />
            )}
          </div>

          {msg.role === "assistant" && (
            <button
              className={`mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${
                speakingIdx === idx ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              onClick={() => handleTTS(msg.content, idx)}
              title={speakingIdx === idx ? "Stop" : "Listen"}
            >
              {speakingIdx === idx ? (
                <><Square className="w-3 h-3 fill-current" /><span>Stop</span></>
              ) : (
                <><Volume2 className="w-3 h-3" /><span>Listen</span></>
              )}
            </button>
          )}
        </div>
      ))}

      {streamingMessage !== undefined && streamingMessage.length > 0 && (
        <div className="flex flex-col items-start">
          <div className="max-w-[88%] px-4 py-3 rounded-2xl glass rounded-bl-sm shadow-sm">
            <MarkdownContent content={streamingMessage} />
            <span className="inline-block w-0.5 h-4 bg-primary/70 ml-0.5 animate-pulse align-text-bottom" />
          </div>
        </div>
      )}

      {isPending && (
        <div className="flex items-start">
          <div className="glass px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2 text-muted-foreground text-sm shadow-sm">
            <span className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: "160ms" }} />
            <span className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: "320ms" }} />
            <span className="ml-1 italic text-xs">Hi-There is thinking…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 px-4 py-2 rounded-lg mb-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 mt-1">
              <RefreshCw className="w-4 h-4" />Retry
            </Button>
          )}
        </div>
      )}

      <div ref={bottomRef} className="h-px" />
    </div>
  );
}
