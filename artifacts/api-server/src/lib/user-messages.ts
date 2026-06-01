import { supabase } from "./supabase";

export interface AdminMessage {
  id: string;
  text: string;
  ts: string;
  fromAdmin: string;
  read: boolean;
}

// In-memory fallback for when Supabase table does not exist yet.
const memStore = new Map<string, AdminMessage[]>();

async function tryDb<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function sendAdminMessage(
  userId: string | number,
  text: string,
  fromAdmin: string,
): Promise<AdminMessage> {
  const msg: AdminMessage = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: text.slice(0, 1000),
    ts: new Date().toISOString(),
    fromAdmin: fromAdmin.slice(0, 100),
    read: false,
  };
  const key = String(userId);

  await tryDb(async () => {
    await supabase.from("admin_messages").insert({
      id: msg.id,
      user_id: key,
      text: msg.text,
      from_admin: msg.fromAdmin,
      ts: msg.ts,
      read: false,
    });
    // Trim to last 20 per user
    const { data: all } = await supabase
      .from("admin_messages")
      .select("id")
      .eq("user_id", key)
      .order("ts", { ascending: true });
    if (all && all.length > 20) {
      const toDelete = all.slice(0, all.length - 20).map((r: { id: string }) => r.id);
      await supabase.from("admin_messages").delete().in("id", toDelete);
    }
  }, undefined);

  // Keep mem fallback in sync regardless
  const existing = memStore.get(key) ?? [];
  memStore.set(key, [...existing, msg].slice(-20));

  return msg;
}

export async function getUserMessages(userId: string | number): Promise<AdminMessage[]> {
  const key = String(userId);
  return tryDb(async () => {
    const { data, error } = await supabase
      .from("admin_messages")
      .select("id, text, ts, from_admin, read")
      .eq("user_id", key)
      .order("ts", { ascending: true })
      .limit(20);
    if (error || !data) return memStore.get(key) ?? [];
    const rows = data as Array<{ id: string; text: string; ts: string; from_admin: string; read: boolean }>;
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      ts: r.ts,
      fromAdmin: r.from_admin,
      read: r.read,
    }));
  }, memStore.get(key) ?? []);
}

export async function markMessagesRead(userId: string | number): Promise<void> {
  const key = String(userId);
  await tryDb(async () => {
    await supabase
      .from("admin_messages")
      .update({ read: true })
      .eq("user_id", key);
  }, undefined);
  const msgs = memStore.get(key);
  if (msgs) memStore.set(key, msgs.map((m) => ({ ...m, read: true })));
}

export async function clearUserMessages(userId: string | number): Promise<void> {
  const key = String(userId);
  await tryDb(async () => {
    await supabase.from("admin_messages").delete().eq("user_id", key);
  }, undefined);
  memStore.delete(key);
}

export async function countUnread(userId: string | number): Promise<number> {
  const key = String(userId);
  return tryDb(async () => {
    const { count, error } = await supabase
      .from("admin_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", key)
      .eq("read", false);
    if (error || count === null) return (memStore.get(key) ?? []).filter((m) => !m.read).length;
    return count;
  }, (memStore.get(key) ?? []).filter((m) => !m.read).length);
}
