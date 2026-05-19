import { useState, useRef, useCallback } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { InputBar } from "@/components/chat/input-bar";
import { MessageList } from "@/components/chat/message-list";
import { ChatSidebar } from "@/components/chat/sidebar";
import { PaymentModal } from "@/components/payment-modal";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { useIsOffline } from "@/components/offline-banner";
import { Menu, Flame, Plus, GraduationCap, FileText, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useChatHistory } from "@/hooks/use-chat-history";
import type { ChatMessage } from "@/hooks/use-chat-history";
import { usePaymentModal } from "@/hooks/use-payment-modal";

const BASE = import.meta.env.BASE_URL as string;

export default function ChatPage() {
  const { data: user, refetch: refetchUser } = useGetMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentConversation, addMessage, startNewChat, getCurrentIdRef } = useChatHistory();
  const paymentModal = usePaymentModal();
  const [, setLocation] = useLocation();

  const [localError, setLocalError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const isStreamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const streamChat = useCallback(async (finalHistory: ChatMessage[], convId: string, usedVoice = false): Promise<void> => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setIsPending(true);
    setStreamingContent("");
    isStreamingRef.current = false;

    try {
      const res = await fetch(`${BASE}api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: finalHistory, usedVoice }),
        signal: abort.signal,
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        setIsPending(false);
        paymentModal.open();
        const kind = typeof data.kind === "string" ? data.kind : "messages";
        setLocalError(kind === "voice" ? "Daily voice limit reached. Upgrade for unlimited voice." : "Daily limit reached. Upgrade to Premium for unlimited access.");
        return;
      }

      if (!res.ok || !res.body) {
        setIsPending(false);
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
            if (parsed.text) { fullContent += parsed.text; setStreamingContent(fullContent); }
          } catch { /* ignore */ }
        }
      }

      isStreamingRef.current = false;
      setIsStreaming(false);
      setStreamingContent("");
      const finalText = fullContent.trim() ? fullContent : "Something went wrong. Please try again.";
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
  }, [addMessage, paymentModal, refetchUser]);

  const buildHistory = (preMessages: ChatMessage[], userMsg: ChatMessage): ChatMessage[] => {
    const systemMsgs = preMessages.filter((m) => m.role === "system");
    const chatMsgs = preMessages.filter((m) => m.role !== "system");
    return systemMsgs.length > 0 ? [...systemMsgs, ...chatMsgs, userMsg] : [...chatMsgs, userMsg];
  };

  const handleSend = (content: string, usedVoice = false) => {
    const userMsg: ChatMessage = { role: "user", content };
    const preMessages = currentConversation?.messages ?? [];
    const convId = addMessage(userMsg);
    setLocalError(null);
    void streamChat(buildHistory(preMessages, userMsg), convId, usedVoice);
  };

  const handleRetry = () => {
    const convId = getCurrentIdRef();
    if (!convId || !currentConversation) return;
    const history = currentConversation.messages;
    const lastMsg = history[history.length - 1];
    if (lastMsg?.role !== "user") return;
    setLocalError(null);
    const systemMsgs = history.filter((m) => m.role === "system");
    const chatMsgs = history.filter((m) => m.role !== "system");
    void streamChat(systemMsgs.length > 0 ? [...systemMsgs, ...chatMsgs] : history, convId);
  };

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
      const res = await fetch(`${BASE}api/upload`, { method: "POST", body: formData });

      if (res.status === 402) { paymentModal.open(); return; }

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        addMessage({ role: "assistant", content: `⚠️ ${errData.error ?? "Upload failed. Please try another file."}` }, convId);
        return;
      }

      const data = (await res.json()) as { summary?: string; contextNote?: string; filename?: string; kind?: string; };
      const contextNote = data.contextNote?.trim() ?? "";
      const summary = data.summary?.trim() ?? "";
      const kindLabel = data.kind === "pdf" ? "📄 PDF Analyzed" : "🖼️ Image Analyzed";

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
          ? { role: "system", content: isImage ? `[FILE_CONTEXT:image filename="${file.name}"]\n\nThe user uploaded an image. Here is the complete analysis:\n\n${contextNote}` : `[FILE_CONTEXT:pdf filename="${file.name}"]\n\nThe user uploaded a PDF. Here is the extracted text:\n\n${contextNote}` }
          : null;
        const finalHistory: ChatMessage[] = [...systemMsgs, ...chatMsgs, userMsg, ...(contextMsg ? [contextMsg] : [])];
        await streamChat(finalHistory, convId);
      } else {
        if (data.kind === "pdf") {
          addMessage({ role: "assistant", content: `**${kindLabel}: ${data.filename ?? file.name}**\n\n📄 Your PDF is ready. Ask me anything — I can summarize sections, explain concepts, or create practice questions from it.` }, convId);
        } else {
          addMessage({ role: "assistant", content: `**${kindLabel}: ${data.filename ?? file.name}**\n\n${summary || "Image processed. Ask me anything about it."}` }, convId);
        }
        refetchUser();
      }
    } catch {
      addMessage({ role: "assistant", content: "⚠️ Unable to process the file. Please try again." }, convId);
    } finally {
      setIsUploading(false);
    }
  };

  const isOffline = useIsOffline();
  const isBusy = isPending || isStreaming || isUploading;
  const visibleMessages = (currentConversation?.messages ?? []).filter((m) => m.role !== "system");

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all duration-300 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:static md:w-72 flex-shrink-0`}>
        <ChatSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col h-full relative min-w-0 overflow-hidden">
        <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary hidden md:block" />
              <h1 className="font-bold text-lg tracking-tight">Hi-There</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.streak && (
              <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full text-sm font-semibold border border-orange-500/20">
                <Flame className="w-4 h-4 fill-current" />
                {user.streak.currentStreak}
              </div>
            )}
            <Button variant="outline" size="sm" className="hidden sm:flex gap-2 border-white/10 hover:border-white/20" onClick={startNewChat}>
              <Plus className="w-4 h-4" />New Chat
            </Button>
            <PwaInstallButton />
            <Link href="/exam">
              <Button size="icon" className="w-9 h-9 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/25" title="Exam Mode">
                <FileText className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/quiz">
              <Button size="icon" className="w-9 h-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25" title="Practice Quiz">
                <GraduationCap className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[160px] md:pb-6">
          <MessageList messages={visibleMessages} isPending={isPending} streamingMessage={streamingContent || undefined} error={localError} onRetry={handleRetry} />
        </div>

        <div className="fixed left-0 right-0 bottom-[56px] md:static md:bottom-auto p-3 bg-background/95 backdrop-blur border-t border-border z-30 shrink-0">
          <InputBar onSend={handleSend} onUpload={handleUpload} disabled={isBusy || isOffline} />
        </div>
      </div>

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-border flex md:hidden h-14">
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary" onClick={() => setSidebarOpen(false)}>
          <MessageSquare className="w-5 h-5" /><span className="text-[10px] font-semibold">Chat</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/quiz")}>
          <GraduationCap className="w-5 h-5" /><span className="text-[10px] font-medium">Quiz</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/exam")}>
          <FileText className="w-5 h-5" /><span className="text-[10px] font-medium">Exam</span>
        </button>
      </nav>

      <PaymentModal />
    </div>
  );
}
