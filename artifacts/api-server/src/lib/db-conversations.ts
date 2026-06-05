// Server-side conversation persistence.
//
// Table DDL (run once in Supabase SQL editor):
//   CREATE TABLE IF NOT EXISTS user_conversations (
//     id         text PRIMARY KEY,
//     user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//     title      text NOT NULL DEFAULT 'New Chat',
//     messages   jsonb NOT NULL DEFAULT '[]',
//     updated_at timestamptz DEFAULT now() NOT NULL,
//     created_at timestamptz DEFAULT now() NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_user_conversations_user_id
//     ON user_conversations(user_id, updated_at DESC);

import { supabase } from "./supabase";

export interface ServerConversation {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string }>;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// upsertConversations — bulk upsert up to 50 conversations for a user.
// FILE_CONTEXT system messages are expected to have been stripped by the
// client before calling this to avoid storing large PDF blobs in the DB.
// ---------------------------------------------------------------------------
export async function upsertConversations(
  userId: string | number,
  conversations: ServerConversation[],
): Promise<void> {
  if (!conversations.length) return;

  const rows = conversations.slice(0, 50).map((c) => ({
    id: c.id,
    user_id: Number(userId),
    title: c.title,
    messages: c.messages.slice(0, 200),
    updated_at: new Date(c.updatedAt).toISOString(),
  }));

  const { error } = await supabase
    .from("user_conversations")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`upsertConversations: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// listConversations — return all stored conversations for a user, newest first.
// ---------------------------------------------------------------------------
export async function listConversations(
  userId: string | number,
): Promise<ServerConversation[]> {
  const { data, error } = await supabase
    .from("user_conversations")
    .select("id, title, messages, updated_at")
    .eq("user_id", Number(userId))
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`listConversations: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    messages: (r.messages as Array<{ role: string; content: string }>) ?? [],
    updatedAt: new Date(r.updated_at as string).getTime(),
  }));
}
