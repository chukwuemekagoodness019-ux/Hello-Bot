// Spaced repetition scheduler — in-memory with Supabase write-through.
// Review entries are loaded from Supabase on server startup so they survive
// server restarts.  New entries are inserted fire-and-forget.  Dispatched
// entries are removed from both stores.
//
// Phase 3 enhancement: interval-aware dispatch messages (24h / 3-day / 7-day).
// Phase 2 addition:    generateIntelligentReminders — course-aware contextual
//                      nudges with anti-spam gating (6h check interval, 48h
//                      per-key resend cooldown, max 2 per call).
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
import { getProfileForAI } from "./db-profile";
import { getRecentAttempts } from "./db-dashboard";

interface ReviewEntry {
  dbId?: number;
  subject: string;
  dueAt: number;
  intervalLabel: string;
}

const INTERVALS: Array<{ ms: number; label: string }> = [
  { ms: 24 * 60 * 60 * 1000,     label: "24h"   },
  { ms: 3 * 24 * 60 * 60 * 1000, label: "3-day" },
  { ms: 7 * 24 * 60 * 60 * 1000, label: "7-day" },
];

// Interval-aware dispatch messages (Phase 3)
const INTERVAL_MESSAGES: Record<string, (s: string) => string> = {
  "24h":   (s) => `🧠 Lock in what you learned: your **${s}** memory is still consolidating. A 10-minute review right now boosts long-term retention by up to 40%.`,
  "3-day": (s) => `📚 It's been 3 days since your **${s}** session — the perfect window to reinforce before the forgetting curve sets in. Head to Quiz or Chat for a quick review!`,
  "7-day": (s) => `⏰ You studied **${s}** 7 days ago — neuroscience identifies this as the critical retrieval window. A review today locks the knowledge in for the long term.`,
};

const reviewStore = new Map<string, ReviewEntry[]>();

// ── Intelligent reminder anti-spam state ──────────────────────────────────────

interface IntelligentReminderState {
  lastCheckedAt: number;
  sentAt: Map<string, number>;
}

const intelligentReminderStore = new Map<string, IntelligentReminderState>();

const CHECK_INTERVAL_MS   = 6  * 60 * 60 * 1000; // run at most every 6 h per user
const RESEND_COOLDOWN_MS  = 48 * 60 * 60 * 1000; // same reminder key at most every 48 h
const INACTIVITY_DAYS_MS  = 5  * 86_400_000;      // "inactive" threshold
const MAX_REMINDERS       = 2;                    // cap per generation pass

// ---------------------------------------------------------------------------
// initReviewSchedules
// ---------------------------------------------------------------------------
export async function initReviewSchedules(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("review_schedules")
      .select("id, user_id, subject, due_at, interval_label")
      .gte("due_at", new Date().toISOString());

    if (error) return;

    for (const row of data ?? []) {
      const key   = String(row.user_id as number);
      const entry: ReviewEntry = {
        dbId:          row.id as number,
        subject:       row.subject as string,
        dueAt:         new Date(row.due_at as string).getTime(),
        intervalLabel: row.interval_label as string,
      };
      const existing = reviewStore.get(key) ?? [];
      existing.push(entry);
      reviewStore.set(key, existing.slice(-30));
    }
  } catch { /* Supabase unavailable — continue with empty store */ }
}

// ---------------------------------------------------------------------------
// scheduleReview
// ---------------------------------------------------------------------------
export function scheduleReview(userId: string | number, subject: string): void {
  const key  = String(userId);
  const now  = Date.now();
  const newEntries: ReviewEntry[] = INTERVALS.map(({ ms, label }) => ({
    subject,
    dueAt:         now + ms,
    intervalLabel: label,
  }));

  const existing = reviewStore.get(key) ?? [];
  reviewStore.set(key, [...existing, ...newEntries].slice(-30));

  void (async () => {
    try {
      const rows = newEntries.map((e) => ({
        user_id:        Number(userId),
        subject:        e.subject,
        due_at:         new Date(e.dueAt).toISOString(),
        interval_label: e.intervalLabel,
      }));
      const { data } = await supabase
        .from("review_schedules")
        .insert(rows)
        .select("id, due_at");

      if (data) {
        const current = reviewStore.get(key) ?? [];
        for (const dbRow of data) {
          const dueAtMs = new Date(dbRow.due_at as string).getTime();
          const match   = current.find((e) => !e.dbId && e.dueAt === dueAtMs && e.subject === subject);
          if (match) match.dbId = dbRow.id as number;
        }
      }
    } catch { /* in-memory entry already stored */ }
  })();
}

type DispatchFn = (userId: string | number, text: string, from: string) => Promise<unknown>;

// ---------------------------------------------------------------------------
// checkAndDispatchDueReviews — Phase 3: interval-aware messages
// ---------------------------------------------------------------------------
export async function checkAndDispatchDueReviews(
  userId: string | number,
  dispatchFn: DispatchFn,
): Promise<void> {
  const key     = String(userId);
  const pending = reviewStore.get(key);
  if (!pending || pending.length === 0) return;

  const now    = Date.now();
  const due:    ReviewEntry[] = [];
  const future: ReviewEntry[] = [];

  for (const entry of pending) {
    if (entry.dueAt <= now) due.push(entry); else future.push(entry);
  }

  if (due.length === 0) return;

  if (future.length === 0) reviewStore.delete(key);
  else reviewStore.set(key, future);

  const dbIds = due.map((e) => e.dbId).filter((id): id is number => typeof id === "number");
  if (dbIds.length > 0) {
    void (async () => {
      try { await supabase.from("review_schedules").delete().in("id", dbIds); } catch {}
    })();
  }

  for (const entry of due) {
    try {
      const buildMsg = INTERVAL_MESSAGES[entry.intervalLabel];
      const text = buildMsg
        ? buildMsg(entry.subject)
        : `🧠 Your brain is about to drop key data from your recent **${entry.subject}** session. Tap to review now.`;
      await dispatchFn(userId, text, "system");
    } catch { /* best-effort */ }
  }
}

// ---------------------------------------------------------------------------
// generateIntelligentReminders — Phase 2: course-aware contextual nudges
// ---------------------------------------------------------------------------
export async function generateIntelligentReminders(
  userId: string | number,
  dispatchFn: DispatchFn,
): Promise<void> {
  const key = String(userId);
  const now = Date.now();

  const state = intelligentReminderStore.get(key);
  if (state && now - state.lastCheckedAt < CHECK_INTERVAL_MS) return;

  const sentAt = state?.sentAt ?? new Map<string, number>();
  intelligentReminderStore.set(key, { lastCheckedAt: now, sentAt });

  try {
    const [aiProfile, recentAttempts] = await Promise.all([
      getProfileForAI(Number(userId)),
      getRecentAttempts(Number(userId), 50),
    ]);

    const fiveDaysAgo    = new Date(now - INACTIVITY_DAYS_MS).toISOString();
    const hasRecentActivity = recentAttempts.some((a) => a.createdAt >= fiveDaysAgo);
    let dispatched = 0;

    // 1 — Course inactivity reminder
    if (!hasRecentActivity && aiProfile.courses.length > 0 && dispatched < MAX_REMINDERS) {
      const rKey    = "inactivity";
      const lastSent = sentAt.get(rKey) ?? 0;
      if (now - lastSent >= RESEND_COOLDOWN_MS) {
        const { courseCode, courseTitle } = aiProfile.courses[0];
        try {
          await dispatchFn(
            userId,
            `📖 You haven't studied any of your registered courses in over 5 days. A focused 15-minute review of **${courseCode} — ${courseTitle}** keeps the material fresh. Head to the Quiz tab to test yourself!`,
            "system",
          );
          sentAt.set(rKey, now);
          dispatched++;
        } catch {}
      }
    }

    // 2 — Weak-topic reminder (≥2 attempts, avg < 60%)
    if (dispatched < MAX_REMINDERS) {
      const subjectScores = new Map<string, number[]>();
      for (const a of recentAttempts) {
        const arr = subjectScores.get(a.subject) ?? [];
        arr.push(a.percent);
        subjectScores.set(a.subject, arr);
      }

      let worstSubject: string | null = null;
      let worstAvg = Infinity;
      for (const [subject, percents] of subjectScores) {
        if (percents.length < 2) continue;
        const avg = percents.reduce((a, b) => a + b, 0) / percents.length;
        if (avg < 60 && avg < worstAvg) { worstAvg = avg; worstSubject = subject; }
      }

      if (worstSubject) {
        const rKey     = `weakness:${worstSubject}`;
        const lastSent = sentAt.get(rKey) ?? 0;
        if (now - lastSent >= RESEND_COOLDOWN_MS) {
          try {
            await dispatchFn(
              userId,
              `⚠️ **${worstSubject}** is showing up as a challenging area (avg ${Math.round(worstAvg)}%). A focused session today could make a real difference — use Chat for targeted coaching or Quiz to measure your progress!`,
              "system",
            );
            sentAt.set(rKey, now);
            dispatched++;
          } catch {}
        }
      }
    }

    // 3 — General daily nudge (only fires if no other reminder was sent and user is inactive)
    if (dispatched === 0 && !hasRecentActivity) {
      const rKey     = "daily-nudge";
      const lastSent = sentAt.get(rKey) ?? 0;
      if (now - lastSent >= RESEND_COOLDOWN_MS) {
        try {
          await dispatchFn(
            userId,
            `🎯 Even 15 minutes of study today keeps momentum going. Small consistent sessions beat cramming — head to Quiz for a quick test or Chat with your AI coach!`,
            "system",
          );
          sentAt.set(rKey, now);
        } catch {}
      }
    }
  } catch { /* best-effort — never propagate */ }
}
