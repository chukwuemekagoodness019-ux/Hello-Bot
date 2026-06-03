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
  // Monotonically-increasing session counter.  Each call to startRecognitionInstance
  // increments this and closes over the value as `mySessionId`.  Every event handler
  // checks `sessionIdRef.current === mySessionId` before doing any work, so events
  // from stale / already-ended instances are immediately dropped even if they arrive
  // late from the browser's event queue — the primary cause of word duplication.
  const sessionIdRef = useRef<number>(0);
  const voiceBaseRef = useRef<string>("");
  const finalTranscriptRef = useRef<string>("");
  const processedIndexRef = useRef<number>(0);
  const manualStopRef = useRef<boolean>(false);
  const restartTimeRef = useRef<number>(0);
  const restartBaseRef = useRef<string>("");
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
    // Invalidate current session FIRST so any in-flight or queued events are
    // dropped before the abort triggers its own onend/onerror callbacks.
    sessionIdRef.current += 1;
    manualStopRef.current = true;
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    setIsListening(false);
  };

  // How long after an auto-restart to suppress Chrome's echo of previous speech.
  const ECHO_WINDOW_MS = 1200;

  const startRecognitionInstance = (SpeechRecognition: any) => {
    // ── Session isolation ──────────────────────────────────────────────────
    // Increment the global counter FIRST.  The old instance's handlers (if any
    // fire late from the browser queue) will find their closed-over mySessionId
    // no longer matches sessionIdRef.current and will return immediately — this
    // is the root cause fix for word duplication on Android Chrome, where buffered
    // onresult events from a just-ended session arrive after the new session starts.
    const mySessionId = (sessionIdRef.current += 1);

    // Hard-kill any previous instance AFTER bumping the counter so its onend
    // (if abort triggers one) also sees a stale ID and does nothing.
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-NG";

    // ── Guard helper — every handler calls this first ──────────────────────
    const isCurrentSession = () => sessionIdRef.current === mySessionId;

    recognition.onstart = () => {
      if (!isCurrentSession()) return;
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      // Drop events from any session that is no longer current.
      // This is the single most important guard: it prevents stale buffered
      // events from old recognition instances from contaminating voiceBaseRef.
      if (!isCurrentSession()) return;

      const now = Date.now();
      const inEchoWindow =
        restartTimeRef.current > 0 &&
        now - restartTimeRef.current < ECHO_WINDOW_MS;
      const snapshot = restartBaseRef.current.toLowerCase();

      // ── Final commit loop ────────────────────────────────────────────────
      // Start from processedIndexRef (not event.resultIndex) so Chrome
      // re-firing resultIndex=0 on internal resets cannot double-add finals.
      for (let i = processedIndexRef.current; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const t = event.results[i][0].transcript.trim();
          if (t) {
            // Secondary echo guard: within ECHO_WINDOW_MS of a restart, skip
            // any final whose text already exists in the pre-restart snapshot.
            const isEcho =
              inEchoWindow &&
              snapshot.length > 0 &&
              snapshot.includes(t.toLowerCase());
            if (!isEcho) {
              const base = voiceBaseRef.current;
              voiceBaseRef.current = base ? base + " " + t : t;
            }
          }
          processedIndexRef.current = i + 1;
        }
      }

      // ── Interim display ──────────────────────────────────────────────────
      // Use processedIndexRef (not event.resultIndex) so already-committed text
      // never appears in the interim suffix, preventing duplicate display when
      // Chrome fires an internal reset with resultIndex=0.
      let interimTranscript = "";
      for (let i = processedIndexRef.current; i < event.results.length; i++) {
        if (!event.results[i].isFinal) {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      const base = voiceBaseRef.current;
      const live = interimTranscript.trim();

      // Suppress interim echo during window.
      const liveIsEcho =
        inEchoWindow &&
        snapshot.length > 0 &&
        live.length > 0 &&
        snapshot.includes(live.toLowerCase());
      const displayLive = liveIsEcho ? "" : live;

      setInput(displayLive ? (base ? base + " " + displayLive : displayLive) : base);
    };

    recognition.onerror = (event: any) => {
      if (!isCurrentSession()) return;
      if (event.error === "not-allowed") {
        manualStopRef.current = true;
        setIsListening(false);
        toast({
          title: "Microphone permission denied.",
          description: "Allow microphone access in your browser settings.",
          variant: "destructive",
        });
      }
      // "no-speech" / "aborted" / network errors: let onend handle restart.
    };

    recognition.onend = () => {
      // Only the current session may restart. If a previous session fires onend
      // late (e.g. after abort()), its mySessionId no longer matches → ignored.
      if (!isCurrentSession()) return;

      finalTranscriptRef.current = "";
      processedIndexRef.current = 0;

      if (!manualStopRef.current) {
        // Snapshot base and timestamp for echo suppression in the new session.
        restartTimeRef.current = Date.now();
        restartBaseRef.current = voiceBaseRef.current;
        // Always create a fresh instance; calling .start() on an ended instance
        // throws InvalidStateError in Chrome.
        try {
          startRecognitionInstance(SpeechRecognition);
          recognitionRef.current?.start();
        } catch {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    return recognition;
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

    // Reset all voice state BEFORE startRecognitionInstance increments the
    // session ID. The function itself kills the previous instance internally
    // (after bumping the counter) so no explicit abort is needed here — doing
    // it here before the counter bump would let the old onend pass the session
    // check and attempt a spurious restart.
    voiceBaseRef.current = input.trim();
    finalTranscriptRef.current = "";
    processedIndexRef.current = 0;
    manualStopRef.current = false;
    restartTimeRef.current = 0;
    restartBaseRef.current = "";

    const recognition = startRecognitionInstance(SpeechRecognition);
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


  return (
    <div className="max-w-3xl mx-auto relative">
      <input type="file" ref={imageInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
      <input type="file" ref={pdfInputRef} onChange={handlePdfChange} accept="application/pdf" className="hidden" />

      {isListening && (
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 glass border border-primary/40 text-primary px-4 py-2 rounded-full shadow-xl shadow-indigo-900/30 flex items-center gap-2 animate-in zoom-in duration-200 z-10 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium">Listening… tap mic to stop</span>
        </div>
      )}

      {feedbackOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setFeedbackOpen(false)}
        >
          <div className="w-full max-w-sm glass border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <h3 className="font-semibold text-sm text-slate-100">Send Feedback</h3>
              <button
                onClick={() => setFeedbackOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {feedbackDone ? (
              <div className="p-8 text-center">
                <div className="text-3xl mb-2">✓</div>
                <p className="text-sm text-slate-400">Thanks for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="p-4 space-y-3">
                <select
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900">{c.label}</option>
                  ))}
                </select>
                <textarea
                  value={feedbackMsg}
                  onChange={(e) => setFeedbackMsg(e.target.value)}
                  placeholder="Describe your issue or feedback…"
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
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
          className="absolute bottom-full left-0 mb-2 glass border border-white/10 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden animate-in slide-in-from-bottom-2 duration-150 min-w-[180px]"
        >
          {flags.image_upload && (
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/8 transition-colors text-left text-slate-200"
              onClick={() => { setMenuOpen(false); setTimeout(() => imageInputRef.current?.click(), 0); }}
              disabled={disabled}
            >
              <Image className="w-4 h-4 text-primary shrink-0" />
              <span>Upload Image</span>
            </button>
          )}
          {flags.pdf_upload && (
            <>
              {flags.image_upload && <div className="h-px bg-white/8 mx-3" />}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/8 transition-colors text-left text-slate-200"
                onClick={() => { setMenuOpen(false); setTimeout(() => pdfInputRef.current?.click(), 0); }}
                disabled={disabled}
              >
                <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                <span>Upload PDF</span>
              </button>
            </>
          )}
          <div className="h-px bg-white/8 mx-3" />
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/8 transition-colors text-left text-slate-200"
            onClick={() => { setMenuOpen(false); setFeedbackOpen(true); }}
          >
            <MessageSquarePlus className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Send Feedback</span>
          </button>
        </div>
      )}

      <div className="flex flex-col glass border border-white/8 rounded-2xl shadow-xl shadow-black/30 focus-within:border-primary/50 focus-within:shadow-indigo-900/20 transition-all duration-200">
        {pendingFile && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <div className="flex items-center gap-2 bg-primary/15 border border-primary/25 text-primary rounded-lg px-3 py-1.5 text-sm max-w-full">
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
            <span className="text-xs text-slate-500">+ add instruction below</span>
          </div>
        )}

        <div className="flex items-end gap-2 p-2">
          <div className="flex flex-col justify-end pb-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`w-8 h-8 rounded-full transition-all duration-150 ${
                menuOpen
                  ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                  : isListening
                  ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/40 animate-pulse"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/8"
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
            placeholder={pendingFile ? "Add an instruction (optional)…" : "Ask anything…"}
            className="min-h-[44px] max-h-32 bg-transparent border-0 focus-visible:ring-0 resize-none p-2.5 shadow-none text-base text-slate-100 placeholder:text-slate-500"
            rows={1}
            disabled={disabled}
          />

          <div className="flex items-end gap-1 pb-1 shrink-0">
            {flags.voice && !pendingFile && (
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-full transition-all duration-150 ${
                  isListening
                    ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/40 animate-pulse"
                    : "text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
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
              className="w-8 h-8 rounded-full bg-primary hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40 transition-all duration-150 active:scale-95 disabled:opacity-30"
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
