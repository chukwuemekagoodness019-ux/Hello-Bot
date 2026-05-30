import { useState, useEffect, useCallback, useRef } from "react";

const BASE = import.meta.env.BASE_URL as string;
const POLL_INTERVAL_MS = 30_000;

export interface AdminMessage {
  id: string;
  text: string;
  ts: string;
  fromAdmin: string;
  read: boolean;
}

export function useUserMessages(loggedIn: boolean) {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [open, setOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const res = await fetch(`${BASE}api/user/messages`, { credentials: "include" });
      if (res.ok) setMessages(await res.json());
    } catch {}
  }, [loggedIn]);

  const markRead = useCallback(async () => {
    if (!loggedIn) return;
    try {
      await fetch(`${BASE}api/user/messages/read`, { method: "PUT", credentials: "include" });
      setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
    } catch {}
  }, [loggedIn]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    markRead();
  }, [markRead]);

  useEffect(() => {
    if (!loggedIn) return;
    fetchMessages();
    intervalRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loggedIn, fetchMessages]);

  const unreadCount = messages.filter((m) => !m.read).length;

  return { messages, unreadCount, open, setOpen, handleOpen };
}
