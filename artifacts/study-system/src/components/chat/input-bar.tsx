import { useState, useRef, useEffect } from "react";
import { Send, Plus, Image, FileText, X, Mic, MicOff, Square, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

const BASE = import.meta.env.BASE_URL as string;

const FEEDBACK_CATEGORIES = [
  { id: "bug", label: "Bug Report" },
  { id: "payment", label: "Payment Issue" },
  { id: "support", label: "Support Request" },
  { id: "general", label: "General Feedback" },
];

interface InputBarProps {
  onSend: (text: string, usedVoice?: boolean) => void;
  onUpload: (file: File, instruction?: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, onUpload, disabled }: InputBarProps) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { flags } = useFeatureFlags();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleSend = () => {
    if (disabled) return;
    if (pendingFile) {
      onUpload(pendingFile, input.trim() || undefined);
      setPendingFile(null);
      setInput("");
    } else if (input.trim()) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const validateAndSetFile = (file: File | undefined, type: "image" | "pdf") => {
    if (!file) return;
    if (type === "image") {
      if (!flags.image_upload) {
        toast({ title: "Image upload is temporarily unavailable.", variant: "destructive" });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast({ title: "Please upload an image file", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Image must be under 5MB", variant: "destructive" });
        return;
      }
    } else {
      if (!flags.pdf_upload) {
        toast({ title: "PDF upload is temporarily unavailable.", variant: "destructive" });
        return;
      }
      if (file.type !== "application/pdf") {
        toast({ title: "Please upload a PDF file", variant: "destructive" });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "PDF must be under 10MB", variant: "destructive" });
        return;
      }
    }
    setPendingFile(file);
    setMenuOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndSetFile(e.target.files?.[0], "image");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndSetFile(e.target.files?.[0], "pdf");
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  const removePendingFile = () => setPendingFile(null);

  const stopVoice = () => {
    recognitionRef.current?.stop();
    recognitionRef.current?.abort();
    setIsListening(false);
  };

  const startVoice = () => {
    if (!flags.voice) {
      toast({ title: "Voice input is temporarily unavailable.", variant: "destructive" });
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Voice not supported in this browser",
        description: "Try Chrome or Edge for voice input.",
        variant: "destructive",
      });
      return;
    }
    setMenuOpen(false);

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-NG";

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === "not-allowed") {
        toast({
          title: "Microphone permission denied.",
          description: "Allow microphone access in your browser settings.",
          variant: "destructive",
        });
      } else if (event.error !== "aborted") {
        toast({ title: "Didn't catch that. Please try again." });
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleVoiceToggle = () => {
    setMenuOpen(false);
    if (isListening) stopVoice();
    else startVoice();
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMsg.trim()) return;
    setFeedbackSubmitting(true);
    try {
      const res = await fetch(`${BASE}api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: feedbackCategory, message: feedbackMsg }),
      });
      if (!res.ok) throw new Error("Failed");
      setFeedbackDone(true);
      setTimeout(() => {
        setFeedbackOpen(false);
        setFeedbackDone(false);
        setFeedbackMsg("");
        setFeedbackCategory("general");
      }, 2000);
    } catch {
      toast({ title: "Failed to send feedback. Please try again.", variant: "destructive" });
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const canSend = !disabled && (!!pendingFile || !!input.trim());

  const hasSeparatorBeforeVoice = flags.image_upload || flags.pdf_upload;
  const hasSeparatorBeforeFeedback = flags.image_upload || flags.pdf_upload || flags.voice;

  return (
    <div className="max-w-3xl mx-auto relative">
      <input type="file" ref={imageInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
      <input type="file" ref={pdfInputRef} onChange={handlePdfChange} accept="application/pdf" className="hidden" />

      {isListening && (
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-card border border-primary text-primary px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in zoom-in duration-200 z-10 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium">Listening… tap + to stop</span>
        </div>
      )}

      {feedbackOpen && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setFeedbackOpen(false)}
        >
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Send Feedback</h3>
              <button
                onClick={() => setFeedbackOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {feedbackDone ? (
              <div className="p-8 text-center">
                <div className="text-3xl mb-2">✓</div>
                <p className="text-sm text-muted-foreground">Thanks for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="p-4 space-y-3">
                <select
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <textarea
                  value={feedbackMsg}
                  onChange={(e) => setFeedbackMsg(e.target.value)}
                  placeholder="Describe your issue or feedback…"
                  rows={4}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="sm"
                  disabled={feedbackSubmitting || !feedbackMsg.trim()}
                >
                  {feedbackSubmitting ? "Sending…" : "Send Feedback"}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-in slide-in-from-bottom-2 duration-150 min-w-[180px]"
        >
          {flags.image_upload && (
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors text-left"
              onClick={() => { setMenuOpen(false); setTimeout(() => imageInputRef.current?.click(), 0); }}
              disabled={disabled}
            >
              <Image className="w-4 h-4 text-primary shrink-0" />
              <span>Upload Image</span>
            </button>
          )}
          {flags.pdf_upload && (
            <>
              {flags.image_upload && <div className="h-px bg-border mx-3" />}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors text-left"
                onClick={() => { setMenuOpen(false); setTimeout(() => pdfInputRef.current?.click(), 0); }}
                disabled={disabled}
              >
                <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                <span>Upload PDF</span>
              </button>
            </>
          )}
          {flags.voice && (
            <>
              {hasSeparatorBeforeVoice && <div className="h-px bg-border mx-3" />}
              <button
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors text-left ${isListening ? "text-red-500" : ""}`}
                onClick={handleVoiceToggle}
              >
                {isListening
                  ? <MicOff className="w-4 h-4 shrink-0" />
                  : <Mic className="w-4 h-4 text-blue-400 shrink-0" />}
                <span>{isListening ? "Stop Listening" : "Voice Input"}</span>
              </button>
            </>
          )}
          {hasSeparatorBeforeFeedback && <div className="h-px bg-border mx-3" />}
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent transition-colors text-left"
            onClick={() => { setMenuOpen(false); setFeedbackOpen(true); }}
          >
            <MessageSquarePlus className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Send Feedback</span>
          </button>
        </div>
      )}

      <div className="flex flex-col bg-card rounded-2xl border border-border shadow-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
        {pendingFile && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-lg px-3 py-1.5 text-sm max-w-full">
              {pendingFile.type.startsWith("image/") ? (
                <Image className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 shrink-0 text-orange-400" />
              )}
              <span className="truncate max-w-[200px] text-xs font-medium">{pendingFile.name}</span>
              <button
                onClick={removePendingFile}
                className="ml-1 text-primary/60 hover:text-primary transition-colors shrink-0"
                title="Remove file"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">+ add instruction below</span>
          </div>
        )}

        <div className="flex items-end gap-2 p-2">
          <div className="flex flex-col justify-end pb-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`w-8 h-8 rounded-full transition-colors ${
                menuOpen
                  ? "bg-primary/15 text-primary ring-1 ring-primary"
                  : isListening
                  ? "bg-red-500/20 text-red-500 ring-1 ring-red-500/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              disabled={disabled}
              onClick={() => setMenuOpen((o) => !o)}
              title={isListening ? "Stop listening" : "More options"}
            >
              {menuOpen ? <X className="w-4 h-4" /> : isListening ? <MicOff className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingFile ? "Add an instruction (optional)… (Ctrl+Enter to send)" : "Ask a question… (Ctrl+Enter to send, Enter for new line)"}
            className="min-h-[44px] max-h-32 bg-transparent border-0 focus-visible:ring-0 resize-none p-2.5 shadow-none text-base placeholder:text-muted-foreground/60"
            rows={1}
            disabled={disabled}
          />

          <div className="flex items-end gap-1 pb-1 shrink-0">
            {flags.voice && !pendingFile && (
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-full transition-colors ${
                  isListening
                    ? "bg-red-500/20 text-red-500 ring-1 ring-red-500/50 animate-pulse"
                    : "text-muted-foreground hover:text-blue-400"
                }`}
                disabled={disabled}
                onClick={handleVoiceToggle}
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-4 h-4" />}
              </Button>
            )}
            <Button
              size="icon"
              className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-30"
              onClick={handleSend}
              disabled={!canSend}
              title="Send (Ctrl+Enter)"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
