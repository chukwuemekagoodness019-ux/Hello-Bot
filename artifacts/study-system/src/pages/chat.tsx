import { useState, useRef, useCallback, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { InputBar } from "@/components/chat/input-bar";
import { MessageList } from "@/components/chat/message-list";
import { ChatSidebar } from "@/components/chat/sidebar";
import { PaymentModal } from "@/components/payment-modal";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useIsOffline } from "@/components/offline-banner";
import { Menu, Flame, Plus, GraduationCap, FileText, MessageSquare, Bell, X, BarChart2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useChatHistory } from "@/hooks/use-chat-history";
import type { ChatMessage } from "@/hooks/use-chat-history";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { useUserMessages } from "@/hooks/use-user-messages";

const BASE = import.meta.env.BASE_URL as string;

// -------------------------------------------------------------------------
// "Ask My Notes" — detects retrospective note queries and pulls archived
// PDF contexts from all localStorage conversations into the AI request.
// -------------------------------------------------------------------------
const NOTES_QUERY_REGEX =
  /\b(my notes?|my document|my upload(?:ed)?|my pdf|what did.*(?:note|document|pdf)|from my|based on my|according to my|ask my notes?|in my notes?|from the (?:pdf|document)|my (?:bio|physics|chem|math|english|history|economics|geography)\w*\s+notes?)\b/i;

function getArchivedNoteContexts(currentMessages: ChatMessage[]): ChatMessage[] {
  try {
    const stored = localStorage.getItem("ai_study_conversations");
    if (!stored) return [];
    const all = JSON.parse(stored) as Array<{
      messages?: Array<{ role: string; content: string }>;
    }>;
    const currentKeys = new Set(
      currentMessages
        .filter((m) => m.role === "system" && m.content.includes("[FILE_CONTEXT:pdf"))
        .map((m) => m.content.slice(0, 200)),
    );
    const seen = new Set<string>();
    const contexts: ChatMessage[] = [];
    for (const conv of all) {
      for (const msg of conv.messages ?? []) {
        if (msg.role === "system" && msg.content.includes("[FILE_CONTEXT:pdf")) {
          const key = msg.content.slice(0, 200);
          if (!seen.has(key) && !currentKeys.has(key)) {
            seen.add(key);
            contexts.push({
              role: "system",
              content: msg.content.replace("[FILE_CONTEXT:pdf", "[ARCHIVED_NOTES:pdf"),
            });
          }
        }
      }
    }
    return contexts;
  } catch {
    return [];
  }
}

export default function ChatPage() {
  const { data: user, refetch: refetchUser } = useGetMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentConversation, addMessage, startNewChat, getCurrentIdRef, compressConversation } =
    useChatHistory();
  const paymentModal = usePaymentModal();
  const [, setLocation] = useLocation();
  const { messages: adminMessages, unreadCount, open: msgOpen, setOpen: setMsgOpen, handleOpen: handleMsgOpen } =
    useUserMessages(!!user);

  const [localError, setLocalError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  // Phase 3 isolation fix: track which conversation owns the active stream
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const isStreamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Rolling summarization: don't run two summarisations at once.
  const summaryInProgressRef = useRef(false);

  // Exam coaching handoff: read the ?ep= URL param once on mount then clean it.
  // Using a URL param instead of sessionStorage lets the handoff survive opening
  // in a new tab and avoids shared-state race conditions.
  const [pendingExamPrompt] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ep = params.get("ep");
      return ep ? decodeURIComponent(ep) : null;
    } catch {
      return null;
    }
  });
  const pendingFiredRef = useRef(false);

  // Clean the ?ep= param from the URL bar after reading it.
  useEffect(() => {
    if (!pendingExamPrompt) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("ep");
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Last studied subject from exam localStorage history — used by welcome state
  const [lastStudied] = useState<{ subject: string; date: string } | null>(() => {
    try {
      const h = JSON.parse(localStorage.getItem("exam_history") || "[]") as Array<{ subject: string; date: string }>;
      return h.length > 0 ? { subject: h[0].subject, date: h[0].date } : null;
    } catch { return null; }
  });

  // -------------------------------------------------------------------------
  // Core streaming fetch — calls /api/chat/stream, updates streamingContent.
  // Returns full assembled text on success or empty string on failure.
  //
  // Phase 3 FIX: streamingConvId is set at the start so the streaming bubble
  // only appears in the conversation that originated the request, even if the
  // user switches to a different conversation while waiting.
  // -------------------------------------------------------------------------
  const streamChat = useCallback(
    async (
      finalHistory: ChatMessage[],
      convId: string,
      usedVoice = false,
    ): Promise<void> => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setIsPending(true);
      setStreamingContent("");
      setStreamingConvId(convId);
      isStreamingRef.current = false;

      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetch(`${BASE}api/chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: finalHistory, usedVoice }),
            signal: abort.signal,
          });
          break;
        } catch (fetchErr) {
          if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
            setStreamingConvId(null);
            throw fetchErr;
          }
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          } else {
            throw fetchErr;
          }
        }
      }

      try {
        if (!res) throw new Error("No response");

        if (res.status === 402) {
          const data = await res.json().catch(() => ({})) as Record<string, unknown>;
          setIsPending(false);
          setStreamingConvId(null);
          paymentModal.open();
          setLocalError("Daily limit reached. Upgrade to Premium for unlimited access.");
          const kind = typeof data.kind === "string" ? data.kind : "messages";
          if (kind === "voice") setLocalError("Daily voice limit reached. Upgrade for unlimited voice.");
          return;
        }

        if (!res.ok || !res.body) {
          setIsPending(false);
          setStreamingConvId(null);
          setLocalError("Failed to send message. Please retry.");
          return;
        }

        setIsPending(false);
        setIsStreaming(true);
        isStreamingRef.current = true;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") break;
            try {
              const parsed = JSON.parse(raw) as { text?: string };
              if (parsed.text) {
                fullContent += parsed.text;
                setStreamingContent(fullContent);
              }
            } catch {
              // Ignore malformed SSE frames
            }
          }
        }

        isStreamingRef.current = false;
        setIsStreaming(false);
        setStreamingContent("");
        setStreamingConvId(null);

        const finalText = fullContent.trim()
          ? fullContent
          : "Something went wrong. Please try again.";
        addMessage({ role: "assistant", content: finalText }, convId);
        refetchUser();
      } catch (err: unknown) {
        isStreamingRef.current = false;
        setIsStreaming(false);
        setIsPending(false);
        setStreamingContent("");
        setStreamingConvId(null);
        if (err instanceof Error && err.name === "AbortError") return;
        setLocalError("Connection lost. Please retry.");
      }
    },
    [addMessage, paymentModal, refetchUser],
  );

  // -------------------------------------------------------------------------
  // Build the ordered history for AI: system context first, then chat.
  // -------------------------------------------------------------------------
  const buildHistory = (
    preMessages: ChatMessage[],
    userMsg: ChatMessage,
  ): ChatMessage[] => {
    const systemMsgs = preMessages.filter((m) => m.role === "system");
    const chatMsgs = preMessages.filter((m) => m.role !== "system");
    return systemMsgs.length > 0
      ? [...systemMsgs, ...chatMsgs, userMsg]
      : [...chatMsgs, userMsg];
  };

  // -------------------------------------------------------------------------
  // Rolling summarization constants.
  // Trigger when a conversation accumulates ≥30 non-system messages (15 turns).
  // Keep the last 10 messages verbatim; summarise everything older.
  // -------------------------------------------------------------------------
  const SUMMARY_THRESHOLD = 30;
  const KEEP_RECENT = 10;

  // Fires in the background after each AI response. Uses the snapshot of
  // `preMessages` taken at the start of handleSend so we don't need to
  // re-read state (which may still be stale in a closure). The actual
  // compress call uses setConversations(prev => …) inside the context so it
  // always operates on the very latest state regardless of stale closures.
  const triggerSummarize = useCallback(
    async (convId: string, preMessages: ChatMessage[]) => {
      // +2 for the user message and AI response just added.
      const chatCount =
        preMessages.filter((m) => m.role !== "system").length + 2;
      if (chatCount < SUMMARY_THRESHOLD) return;
      if (summaryInProgressRef.current) return;

      // Identify the older chat messages (from the pre-exchange snapshot)
      // that should be compressed. We keep KEEP_RECENT - 2 from preMessages
      // (the remaining 2 slots are filled by the user+assistant just added).
      const chatMsgs = preMessages.filter(
        (m) =>
          m.role !== "system" &&
          !m.content.startsWith("[CONVERSATION_SUMMARY]"),
      );
      const keepFromPre = Math.max(0, KEEP_RECENT - 2);
      const compressCount = chatMsgs.length - keepFromPre;
      if (compressCount <= 0) return;

      const msgsToCompress = chatMsgs.slice(0, compressCount);
      summaryInProgressRef.current = true;
      try {
        const res = await fetch(`${BASE}api/chat/summarize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgsToCompress }),
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { summary?: string };
        if (data.summary) {
          compressConversation(convId, data.summary, KEEP_RECENT);
        }
      } catch {
        // Non-critical — silently swallow. The full history is still intact.
      } finally {
        summaryInProgressRef.current = false;
      }
    },
    [compressConversation],
  );

  // Fire pending exam coaching prompt once user data arrives (safe forward ref — fires after render)
  useEffect(() => {
    if (!pendingExamPrompt || !user || pendingFiredRef.current) return;
    pendingFiredRef.current = true;
    const timer = setTimeout(() => void handleSend(pendingExamPrompt), 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pendingExamPrompt]);

  // -------------------------------------------------------------------------
  // Send a text message — async so we can await the stream and then check
  // whether the conversation needs background summarization.
  // -------------------------------------------------------------------------
  const handleSend = async (content: string, usedVoice = false) => {
    const userMsg: ChatMessage = { role: "user", content };
    const preMessages = currentConversation?.messages ?? [];
    const convId = addMessage(userMsg);
    setLocalError(null);

    // "Ask My Notes" — inject archived PDF contexts from past conversations
    // when the user asks a retrospective question about their documents.
    let history = buildHistory(preMessages, userMsg);
    if (NOTES_QUERY_REGEX.test(content)) {
      const archived = getArchivedNoteContexts(preMessages);
      if (archived.length > 0) {
        const sysMsgs = history.filter((m) => m.role === "system");
        const otherMsgs = history.filter((m) => m.role !== "system");
        history = [...sysMsgs, ...archived, ...otherMsgs];
      }
    }

    await streamChat(history, convId, usedVoice);
    void triggerSummarize(convId, preMessages);
  };

  // -------------------------------------------------------------------------
  // Retry last user message
  // -------------------------------------------------------------------------
  const handleRetry = () => {
    const convId = getCurrentIdRef();
    if (!convId || !currentConversation) return;
    const history = currentConversation.messages;
    const lastMsg = history[history.length - 1];
    if (lastMsg?.role !== "user") return;

    setLocalError(null);
    const systemMsgs = history.filter((m) => m.role === "system");
    const chatMsgs = history.filter((m) => m.role !== "system");
    const finalHistory =
      systemMsgs.length > 0 ? [...systemMsgs, ...chatMsgs] : history;

    void streamChat(finalHistory, convId);
  };

  // -------------------------------------------------------------------------
  // Handle file upload (image or PDF).
  // -------------------------------------------------------------------------
  const handleUpload = async (file: File, instruction?: string) => {
    const isImage = file.type.startsWith("image/");
    const trimmedInstruction = instruction?.trim() ?? "";

    const userContent = trimmedInstruction
      ? `${isImage ? "📷" : "📄"} ${file.name} — ${trimmedInstruction}`
      : `${isImage ? "📷 Uploaded image" : "📄 Uploaded PDF"}: ${file.name}`;

    const userMsg: ChatMessage = { role: "user", content: userContent };
    const preMessages = currentConversation?.messages ?? [];
    const convId = addMessage(userMsg);
    setLocalError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (trimmedInstruction) {
        formData.append("prompt", trimmedInstruction);
      }

      const res = await fetch(`${BASE}api/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.status === 402) {
        paymentModal.open();
        return;
      }

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        addMessage(
          {
            role: "assistant",
            content: `⚠️ ${errData.error ?? "Upload failed. Please try another file."}`,
          },
          convId,
        );
        return;
      }

      const data = (await res.json()) as {
        summary?: string;
        contextNote?: string;
        filename?: string;
        kind?: string;
      };
      const contextNote = data.contextNote?.trim() ?? "";
      const summary = data.summary?.trim() ?? "";
      const kindLabel = data.kind === "pdf" ? "📄 PDF Analyzed" : "🖼️ Image Analyzed";
      void summary;

      if (contextNote) {
        const contextLabel = isImage
          ? `[FILE_CONTEXT:image filename="${file.name}"]\n\nThe user uploaded an image. Here is the complete analysis:\n\n${contextNote}`
          : `[FILE_CONTEXT:pdf filename="${file.name}"]\n\nThe user uploaded a PDF. Here is the extracted text:\n\n${contextNote}`;
        addMessage({ role: "system", content: contextLabel }, convId);
      }

      setIsUploading(false);

      if (trimmedInstruction) {
        const systemMsgs = preMessages.filter((m) => m.role === "system");
        const chatMsgs = preMessages.filter((m) => m.role !== "system");
        const contextMsg: ChatMessage | null = contextNote
          ? {
              role: "system",
              content: isImage
                ? `[FILE_CONTEXT:image filename="${file.name}"]\n\nThe user uploaded an image. Here is the complete analysis:\n\n${contextNote}`
                : `[FILE_CONTEXT:pdf filename="${file.name}"]\n\nThe user uploaded a PDF. Here is the extracted text:\n\n${contextNote}`,
            }
          : null;

        const finalHistory: ChatMessage[] = [
          ...systemMsgs,
          ...chatMsgs,
          userMsg,
          ...(contextMsg ? [contextMsg] : []),
        ];

        await streamChat(finalHistory, convId);
      } else {
        const intentMsg =
          data.kind === "pdf"
            ? `**${kindLabel}: ${data.filename ?? file.name}**\n\nYour PDF is loaded and ready. What would you like me to do?\n\n- **Summarize** — give me a full summary\n- **Explain** — break down key concepts\n- **Quiz me** — create practice questions\n- **Translate** — translate the content\n\nOr just ask me anything about it.`
            : `**${kindLabel}: ${data.filename ?? file.name}**\n\nImage uploaded and analysed. What would you like me to do?\n\n- **Describe** — explain what's in the image\n- **Extract text** — read any text shown\n- **Summarize** — summarize the content\n- **Quiz me** — create questions from it\n\nOr ask me anything about it.`;
        addMessage({ role: "assistant", content: intentMsg }, convId);
        refetchUser();
      }
    } catch {
      addMessage(
        { role: "assistant", content: "⚠️ Unable to process the file. Please try again." },
        convId,
      );
    } finally {
      setIsUploading(false);
    }
  };

  const pwaInstall = usePwaInstall();
  const isOffline = useIsOffline();
  const isBusy = isPending || isStreaming || isUploading;
  const hasDocContext = (currentConversation?.messages ?? []).some(
    (m) => m.role === "system" && m.content.includes("[FILE_CONTEXT:pdf"),
  );
  const visibleMessages = (currentConversation?.messages ?? []).filter(
    (m) => m.role !== "system",
  );

  // Only show the streaming bubble in the conversation that started the stream
  const activeStreamingContent =
    streamingContent && currentConversation?.id === streamingConvId
      ? streamingContent
      : undefined;

  return (
    <div className="flex h-full w-full chat-page-bg text-foreground overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all duration-300 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Admin messages panel */}
      {msgOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMsgOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-sidebar shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                Messages from Admin
              </h2>
              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setMsgOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {adminMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No messages yet.</p>
              ) : (
                [...adminMessages].reverse().map((msg) => (
                  <div key={msg.id} className="bg-white/5 rounded-xl p-4 border border-white/8">
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      From {msg.fromAdmin} · {new Date(msg.ts).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-sidebar border-r border-white/8 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:static md:w-72 flex-shrink-0`}
      >
        <ChatSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col h-full relative min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-white/8 bg-slate-950/95 backdrop-blur-sm sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="font-semibold text-lg tracking-tight">AI Tutor</h1>
          </div>
          <div className="flex items-center gap-2">
            {user?.streak && (
              <div className="flex items-center gap-1.5 text-orange-500 bg-orange-500/10 px-2.5 py-1 rounded-full text-sm font-medium border border-orange-500/20">
                <Flame className="w-4 h-4 fill-current" />
                {user.streak.currentStreak}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex gap-2"
              onClick={startNewChat}
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
            <PwaInstallButton
              canInstall={pwaInstall.canInstall}
              isIOS={pwaInstall.isIOS}
              install={pwaInstall.install}
              showIOSGuide={pwaInstall.showIOSGuide}
              closeIOSGuide={pwaInstall.closeIOSGuide}
            />
            {/* Admin messages notification bell */}
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="w-9 h-9 rounded-full text-slate-400 hover:text-slate-200"
                onClick={handleMsgOpen}
                title="Messages from Admin"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </div>
            <Link href="/exam">
              <Button
                size="icon"
                className="w-9 h-9 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 transition-transform active:scale-95"
                title="Exam Mode"
              >
                <FileText className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/quiz">
              <Button
                size="icon"
                className="w-9 h-9 rounded-full bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-transform active:scale-95"
                title="Practice Quiz"
              >
                <GraduationCap className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/profile">
              <Button
                size="icon"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/10 transition-transform active:scale-95"
                title="Academic Profile"
              >
                <User className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </header>

        <PwaInstallBanner canInstall={pwaInstall.canInstall} install={pwaInstall.install} />

        {/* Messages area — overscroll-none prevents iOS bounce interfering with input */}
        <div className="flex-1 overflow-y-auto overscroll-none px-4 sm:px-6 pt-4 sm:pt-6 pb-[230px] md:pb-6">
          <MessageList
            messages={visibleMessages}
            isPending={isPending && currentConversation?.id === streamingConvId}
            isUploading={isUploading}
            streamingMessage={activeStreamingContent}
            error={localError}
            onRetry={handleRetry}
            onSend={handleSend}
            streak={user?.streak?.currentStreak}
            displayName={user?.displayName ?? null}
            lastStudied={lastStudied}
            onMilestoneTick={refetchUser}
          />
        </div>

        {/* Input bar — fixed above bottom nav on mobile.
            bg-background (solid) is intentional: prevents message text from
            bleeding through the bar as users scroll. Do NOT use glass/transparent. */}
        <div className="fixed left-0 right-0 input-bar-bottom md:static md:bottom-auto p-3 bg-background border-t border-white/8 z-40 shrink-0">
          {hasDocContext && (
            <div className="flex justify-end mb-2 px-1">
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border select-none"
                style={{
                  background: "rgba(15, 12, 30, 0.7)",
                  borderColor: "rgba(56, 189, 248, 0.2)",
                  color: "#38bdf8",
                }}
              >
                🎓 Lecturer Style Active
              </div>
            </div>
          )}
          <InputBar onSend={handleSend} onUpload={handleUpload} disabled={isBusy || isOffline} />
        </div>
      </div>

      {/* Solid background barrier — sits at z-[15], below the nav (z-20) but above
          scroll content. Blocks message text from showing through the semi-transparent
          glass nav. Height matches nav-safe exactly. Do NOT remove. */}
      <div
        className="fixed bottom-0 left-0 right-0 md:hidden bg-background z-[15]"
        style={{ height: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
        aria-hidden="true"
      />

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-20 glass border-t border-white/8 flex md:hidden nav-safe">
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary"
          onClick={() => setSidebarOpen(false)}
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
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors"
          onClick={() => setLocation("/dashboard")}
        >
          <BarChart2 className="w-5 h-5" />
          <span className="text-[10px] font-medium">Stats</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors"
          onClick={() => setLocation("/profile")}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-medium">Profile</span>
        </button>
      </nav>

      <PaymentModal />
    </div>
  );
}
