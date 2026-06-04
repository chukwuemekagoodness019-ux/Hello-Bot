// Lightweight in-memory spaced repetition scheduler.
// No new database tables required. Review notifications are delivered via
// the existing admin_messages channel (from_admin: "system") so the
// frontend bell icon picks them up automatically.
// Fully non-blocking — scheduling is synchronous, dispatch is fire-and-forget.

interface ReviewEntry {
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

/**
 * Schedules three spaced review reminders after a successful quiz/exam.
 * Synchronous and instant — safe to call in any request handler.
 */
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
}

type DispatchFn = (
  userId: string | number,
  text: string,
  from: string,
) => Promise<unknown>;

/**
 * Checks for due review entries and dispatches notifications via the
 * provided dispatch function (sendAdminMessage). Fully async and
 * non-blocking — errors are swallowed so they never surface to the user.
 * Call this as a fire-and-forget side-effect on the messages GET route.
 */
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
