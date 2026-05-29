export interface AdminMessage {
  id: string;
  text: string;
  ts: string;
  fromAdmin: string;
  read: boolean;
}

const store = new Map<string, AdminMessage[]>();

export function sendAdminMessage(
  userId: string | number,
  text: string,
  fromAdmin: string,
): AdminMessage {
  const msg: AdminMessage = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: text.slice(0, 1000),
    ts: new Date().toISOString(),
    fromAdmin: fromAdmin.slice(0, 100),
    read: false,
  };
  const key = String(userId);
  const existing = store.get(key) ?? [];
  store.set(key, [...existing, msg].slice(-20));
  return msg;
}

export function getUserMessages(userId: string | number): AdminMessage[] {
  return store.get(String(userId)) ?? [];
}

export function markMessagesRead(userId: string | number): void {
  const key = String(userId);
  const msgs = store.get(key);
  if (!msgs) return;
  store.set(key, msgs.map((m) => ({ ...m, read: true })));
}

export function clearUserMessages(userId: string | number): void {
  store.delete(String(userId));
}

export function countUnread(userId: string | number): number {
  return (store.get(String(userId)) ?? []).filter((m) => !m.read).length;
}
