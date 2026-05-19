import { useState, useRef, useCallback } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { InputBar } from "@/components/chat/input-bar";
import { MessageList } from "@/components/chat/message-list";
import { ChatSidebar } from "@/components/chat/sidebar";
import { PaymentModal } from "@/components/payment-modal";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { useIsOffline } from "@/components/offline-banner";
import { Menu, Flame, Plus, GraduationCap, FileText, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useChatHistory } from "@/hooks/use-chat-history";
import type { ChatMessage } from "@/hooks/use-chat-history";
import { usePaymentModal } from "@/hooks/use-payment-modal";

const BASE = import.meta.env.BASE_URL as string;

export default function ChatPage() {
  const { data: user, refetch: refetchUser } = useGetMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentConversation, addMessage, startNewChat, getCurrentIdRef } =
    useChatHistory();
  const paymentModal = usePaymentModal();
  const [, setLocation] = useLocation();

  const [localError, setLocalError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const isStreamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // -------------------------------------------------------------------------
  // Core streaming fetch — calls /api/chat/stream, updates streamingContent.
  // Returns full assembled text on success or empty string on failure.
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
          if (fetchErr instanceof Error && fetchErr.name === "AbortError") throw fetchErr;
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
          paymentModal.open();
          setLocalError("Daily limit reached. Upgrade to Premium for unlimited access.");
          const kind = typeof data.kind === "string" ? data.kind : "messages";
          if (kind === "voice") setLocalError("Daily voice limit reached. Upgrade for unlimited voice.");
          return;
        }

        if (!res.ok || !res.body) {
          setIsPending(false);
          setLocalError("Failed to send message. Please retry.");
          return;
        }

        // Stream started — hide "thinking" dots, show live content
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
  // Send a text message
  // -------------------------------------------------------------------------
  const handleSend = (content: string, usedVoice = false) => {
    const userMsg: ChatMessage = { role: "user", content };
    const preMessages = currentConversation?.messages ?? [];
    const convId = addMessage(userMsg);
    setLocalError(null);
    void streamChat(buildHistory(preMessages, userMsg), convId, usedVoice);
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
  //
  // When the user also typed an instruction:
  //   → upload for context only, stream ONE combined AI response.
  // When no instruction:
  //   → show the file analysis/summary as the assistant reply.
  // -------------------------------------------------------------------------
  const handleUpload = async (file: File, instruction?: string) => {
    const isImage = file.type.startsWith("image/");
    const trimmedInstruction = instruction?.trim() ?? "";

    // User-visible label for their message
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

      // Always inject the file context as a hidden system message
      if (contextNote) {
        const contextLabel = isImage
          ? `[FILE_CONTEXT:image filename="${file.name}"]\n\nThe user uploaded an image. Here is the complete analysis:\n\n${contextNote}`
          : `[FILE_CONTEXT:pdf filename="${file.name}"]\n\nThe user uploaded a PDF. Here is the extracted text:\n\n${contextNote}`;
        addMessage({ role: "system", content: contextLabel }, convId);
      }

      setIsUploading(false);

      if (trimmedInstruction) {
        // --- Single combined response (file context + instruction) ---
        // Build history: existing context → existing chat → upload label msg
        //   → new system context → instruction (merged into userMsg already)
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
        // --- No instruction: ask intent-first for both images and PDFs ---
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

  const isOffline = useIsOffline();
  const isBusy = isPending || isStreaming || isUploading;
  const visibleMessages = (currentConversation?.messages ?? []).filter(
    (m) => m.role !== "system",
  );

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-all duration-300 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:static md:w-80 flex-shrink-0`}
      >
        <ChatSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col h-full relative min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 shrink-0">
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
            <PwaInstallButton />
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
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[160px] md:pb-6">
          <MessageList
            messages={visibleMessages}
            isPending={isPending}
            isUploading={isUploading}
            streamingMessage={streamingContent || undefined}
            error={localError}
            onRetry={handleRetry}
          />
        </div>

        {/* Input bar — fixed above bottom nav on mobile */}
        <div className="fixed left-0 right-0 bottom-[56px] md:static md:bottom-auto p-3 bg-background border-t border-border z-30 shrink-0">
          <InputBar onSend={handleSend} onUpload={handleUpload} disabled={isBusy || isOffline} />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-border flex md:hidden h-14">
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary"
          onClick={() => setSidebarOpen(false)}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-medium">Chat</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setLocation("/quiz")}
        >
          <GraduationCap className="w-5 h-5" />
          <span className="text-[10px] font-medium">Quiz</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setLocation("/exam")}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] font-medium">Exam</span>
        </button>
      </nav>

      <PaymentModal />
    </div>
  );
}
