// Spaced repetition scheduler — in-memory with Supabase write-through.
// Review entries are loaded from Supabase on server startup (initReviewSchedules)
// so they survive server restarts.  New entries are inserted to Supabase
// immediately (fire-and-forget) and kept in-memory for fast dispatch checking.
// Dispatched entries are removed from both stores.
//
// Table DDL (run once in Supabase SQL editor):
//   CREATE TABLE IF NOT EXISTS review_schedules (
//     id         serial PRIMARY KEY,
//     user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//     subject    text NOT NULL,
//     due_at     timestamptz NOT NULL,
//     interval_label text NOT NULL,
//     created_at timestamptz DEFAULT now() NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_review_schedules_user_id ON review_schedules(user_id);
//   CREATE INDEX IF NOT EXISTS idx_review_schedules_due_at  ON review_schedules(due_at);

import { supabase } from "./supabase";

interface ReviewEntry {
  dbId?: number;
  subject: string;
  dueAt: number;
  intervalLabel: string;
}

// Standard spaced repetition intervals
const INTERVALS: Array<{ ms: number; label: string }> = [
  { ms: 24 * 60 * 60 * 1000,     label: "24h"   },  // Day 1
  { ms: 3 * 24 * 60 * 60 * 1000, label: "3-day" },  // Day 3
  { ms: 7 * 24 * 60 * 60 * 1000, label: "7-day" },  // Day 7
];

// Keyed by string userId — bounded at 30 entries per user
const reviewStore = new Map<string, ReviewEntry[]>();

// ---------------------------------------------------------------------------
// initReviewSchedules — load all future review schedules from Supabase into
// the in-memory store.  Called once during server startup.  Graceful: if the
// table does not exist yet the error is swallowed and defaults are used.
// ---------------------------------------------------------------------------
export async function initReviewSchedules(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("review_schedules")
      .select("id, user_id, subject, due_at, interval_label")
      .gte("due_at", new Date().toISOString());

    if (error) return; // table may not exist yet

    for (const row of data ?? []) {
      const key = String(row.user_id as number);
      const entry: ReviewEntry = {
        dbId: row.id as number,
        subject: row.subject as string,
        dueAt: new Date(row.due_at as string).getTime(),
        intervalLabel: row.interval_label as string,
      };
      const existing = reviewStore.get(key) ?? [];
      existing.push(entry);
      reviewStore.set(key, existing.slice(-30));
    }
  } catch {
    // Supabase unavailable — continue with empty in-memory store.
  }
}

// ---------------------------------------------------------------------------
// scheduleReview — schedules three spaced review reminders after a
// successful quiz/exam.  Synchronous for in-memory, async write-through
// to Supabase (fire-and-forget).
// ---------------------------------------------------------------------------
export function scheduleReview(userId: string | number, subject: string): void {
  const key = String(userId);
  const now = Date.now();
  const newEntries: ReviewEntry[] = INTERVALS.map(({ ms, label }) => ({
    subject,
    dueAt: now + ms,
    intervalLabel: label,
  }));
  const existing = reviewStore.get(key) ?? [];
  reviewStore.set(key, [...existing, ...newEntries].slice(-30));

  // Persist to Supabase — fire-and-forget; don't block the quiz submit response.
  void (async () => {
    try {
      const rows = newEntries.map((e) => ({
        user_id: Number(userId),
        subject: e.subject,
        due_at: new Date(e.dueAt).toISOString(),
        interval_label: e.intervalLabel,
      }));
      const { data } = await supabase
        .from("review_schedules")
        .insert(rows)
        .select("id, due_at");

      // Back-fill the db IDs so we can delete them precisely on dispatch.
      if (data) {
        const current = reviewStore.get(key) ?? [];
        for (const dbRow of data) {
          const dueAtMs = new Date(dbRow.due_at as string).getTime();
          const match = current.find((e) => !e.dbId && e.dueAt === dueAtMs && e.subject === subject);
          if (match) match.dbId = dbRow.id as number;
        }
      }
    } catch {
      // Supabase unavailable — in-memory entry already stored.
    }
  })();
}

type DispatchFn = (
  userId: string | number,
  text: string,
  from: string,
) => Promise<unknown>;

// ---------------------------------------------------------------------------
// checkAndDispatchDueReviews — checks for due review entries and dispatches
// notifications via the provided dispatch function.  Fully async and
// non-blocking — errors are swallowed so they never surface to the user.
// Call this as a fire-and-forget side-effect on the messages GET route.
// ---------------------------------------------------------------------------
export async function checkAndDispatchDueReviews(
  userId: string | number,
  dispatchFn: DispatchFn,
): Promise<void> {
  const key = String(userId);
  const pending = reviewStore.get(key);
  if (!pending || pending.length === 0) return;

  const now = Date.now();
  const due: ReviewEntry[] = [];
  const future: ReviewEntry[] = [];

  for (const entry of pending) {
    if (entry.dueAt <= now) {
      due.push(entry);
    } else {
      future.push(entry);
    }
  }

  if (due.length === 0) return;

  // Update store before async work to prevent double-dispatch on concurrent requests
  if (future.length === 0) {
    reviewStore.delete(key);
  } else {
    reviewStore.set(key, future);
  }

  // Delete dispatched entries from Supabase — fire-and-forget
  const dbIds = due.map((e) => e.dbId).filter((id): id is number => typeof id === "number");
  if (dbIds.length > 0) {
    void (async () => {
      try { await supabase.from("review_schedules").delete().in("id", dbIds); } catch {}
    })();
  }

  for (const entry of due) {
    try {
      await dispatchFn(
        userId,
        `🧠 Your brain is about to drop key data from your recent **${entry.subject}** study session. Tap to review now.`,
        "system",
      );
    } catch {
      // Notification failure must never propagate — reviews are best-effort
    }
  }
}
