import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const STORAGE_KEY = "ai_study_conversations";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const all = JSON.parse(stored) as Conversation[];
    const cutoff = Date.now() - MAX_AGE_MS;
    return all.filter((c) => c.updatedAt > cutoff);
  } catch {
    return [];
  }
}

function generateTitle(firstMessage: string): string {
  const text = firstMessage.trim();

  // File upload messages
  const fileMatch = text.match(/^(?:📷|📄)\s*(.+?)(?:\s*—\s*(.+))?$/u);
  if (fileMatch) {
    const fname = fileMatch[1].replace(/^Uploaded\s+(?:image|PDF):\s*/i, "").split(".")[0];
    const instr = fileMatch[2];
    return instr
      ? truncate(`${fname}: ${instr}`)
      : truncate(`File — ${fname}`);
  }
  if (text.startsWith("[FILE_CONTEXT")) return "New Chat";

  const lower = text.toLowerCase();

  // Greeting patterns → General Conversation
  if (/^(hi|hey|hello|good\s+(morning|afternoon|evening|day)|how are you|what's up|sup|greetings|howdy)[.,!?\s]*$/.test(lower)) {
    return "General Conversation";
  }

  // Teaching / learning intent — extract topic
  const teachMatch = lower.match(
    /^(?:teach|explain|describe|tell me about|what is|what are|who is|who was|define|introduce me to|talk about|elaborate on|break down|summarise|summarize|summarize for me)\s+(?:me\s+)?(?:about\s+)?(.+)/,
  );
  if (teachMatch) return truncate(toTitleCase(teachMatch[1]));

  // Help / assistance intent
  const helpMatch = lower.match(
    /^(?:help me (?:understand|study|learn|with|prepare|revise)|i need help with|can you help me with|assist me with)\s+(.+)/,
  );
  if (helpMatch) return truncate(toTitleCase(helpMatch[1]));

  // How/why/when/where questions — strip question words, keep topic
  const questionMatch = lower.match(
    /^(?:how does|how do|how can|how to|why does|why do|why is|when did|when was|where is|where are|how is|what happens when|what causes|what makes)\s+(.+)\??$/,
  );
  if (questionMatch) return truncate(toTitleCase(questionMatch[1]));

  // Solve / calculate / compute
  const mathMatch = lower.match(/^(?:solve|calculate|compute|simplify|find|evaluate|derive)\s+(.+)/);
  if (mathMatch) return truncate(`Math: ${toTitleCase(mathMatch[1])}`);

  // Write / create / generate
  const writeMatch = lower.match(
    /^(?:write|create|draft|compose|generate)\s+(?:an?\s+)?(.+)/,
  );
  if (writeMatch) return truncate(toTitleCase(writeMatch[1]));

  // Quiz / practice intent
  const quizMatch = lower.match(/^(?:quiz me on|test me on|give me questions? (?:on|about)|practice)\s+(.+)/);
  if (quizMatch) return truncate(`Quiz: ${toTitleCase(quizMatch[1])}`);

  // Generic extraction — strip stop words, take top 4 content words
  const cleaned = text
    .replace(/^\p{Emoji_Presentation}+\s*/u, "")
    .replace(/^[\[\(].*?[\]\)]\s*/g, "")
    .replace(/[^\u0000-\u007f\p{L}\p{N}\s]/gu, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  const stopWords = new Set([
    "a","an","the","is","it","in","of","to","for","and","or","but","not",
    "what","how","why","when","where","who","can","i","me","my","do","did",
    "please","could","would","tell","about","explain","describe","give","make",
    "help","write","create","show","list","define","this","that","with","from",
    "be","been","was","are","will","just","like","some","more","get","has",
    "have","had","use","used","you","your",
  ]);
  const useful = words.filter((w) => !stopWords.has(w.toLowerCase()));
  const picked = (useful.length ? useful : words)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const title = picked.join(" ");
  return title.length > 32 ? title.slice(0, 29) + "…" : title || "New Chat";
}

function truncate(s: string, max = 32): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function toTitleCase(s: string): string {
  return s
    .replace(/\?+$/, "")
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      i === 0 || w.length > 3
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase(),
    )
    .join(" ");
}

interface ChatHistoryCtx {
  conversations: Conversation[];
  currentId: string | null;
  currentConversation: Conversation | undefined;
  setCurrentId: (id: string | null) => void;
  startNewChat: () => void;
  addMessage: (message: ChatMessage, targetId?: string) => string;
  updateLastMessage: (message: ChatMessage, targetId?: string) => void;
  getCurrentIdRef: () => string | null;
}

const ChatHistoryContext = createContext<ChatHistoryCtx | null>(null);

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  const setCurrentId = useCallback((id: string | null) => {
    currentIdRef.current = id;
    setCurrentIdState(id);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {}
  }, [conversations]);

  // Periodic cleanup: remove conversations older than 7 days
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - MAX_AGE_MS;
      setConversations((prev) => {
        const cleaned = prev.filter((c) => c.updatedAt > cutoff);
        if (cleaned.length !== prev.length) return cleaned;
        return prev;
      });
    }, 60 * 60 * 1000); // check every hour
    return () => clearInterval(interval);
  }, []);

  const currentConversation = conversations.find((c) => c.id === currentId);

  const startNewChat = useCallback(() => {
    setCurrentId(null);
  }, [setCurrentId]);

  const getCurrentIdRef = useCallback(() => currentIdRef.current, []);

  const addMessage = useCallback((message: ChatMessage, targetId?: string): string => {
    const now = Date.now();
    const cid = targetId ?? currentIdRef.current;

    if (!cid) {
      const newId = crypto.randomUUID();
      const title = message.role === "user" ? generateTitle(message.content) : "New Chat";
      currentIdRef.current = newId;
      setCurrentIdState(newId);
      setConversations((prev) => [
        { id: newId, title, messages: [message], updatedAt: now },
        ...prev,
      ]);
      return newId;
    }

    setConversations((prev) => {
      const exists = prev.some((c) => c.id === cid);
      if (!exists) return prev;
      return prev
        .map((conv) =>
          conv.id === cid
            ? { ...conv, messages: [...conv.messages, message], updatedAt: now }
            : conv
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
    });
    return cid;
  }, []);

  const updateLastMessage = useCallback((message: ChatMessage, targetId?: string) => {
    const cid = targetId ?? currentIdRef.current;
    if (!cid) return;
    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== cid) return conv;
        const msgs = [...conv.messages];
        if (msgs.length > 0) msgs[msgs.length - 1] = message;
        return { ...conv, messages: msgs };
      })
    );
  }, []);

  return (
    <ChatHistoryContext.Provider
      value={{
        conversations,
        currentId,
        currentConversation,
        setCurrentId,
        startNewChat,
        addMessage,
        updateLastMessage,
        getCurrentIdRef,
      }}
    >
      {children}
    </ChatHistoryContext.Provider>
  );
}

export function useChatHistory(): ChatHistoryCtx {
  const ctx = useContext(ChatHistoryContext);
  if (!ctx) throw new Error("useChatHistory must be used inside ChatHistoryProvider");
  return ctx;
}
