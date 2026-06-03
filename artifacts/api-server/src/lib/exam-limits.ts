import { supabase } from "./supabase";

interface LimitState {
  week: { key: string; count: number };
  month: { key: string; count: number };
}

const examLimits = new Map<string, LimitState>();

// ── Period key helpers (ISO week + calendar month) ────────────────────────────

function weekKey(d = new Date()): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const year = dt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Startup load ──────────────────────────────────────────────────────────────

export async function initExamLimits(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("exam_limits")
      .select("user_id, period, period_key, count");
    if (!error && data) {
      for (const row of data) {
        const userId = String(row.user_id);
        const state: LimitState = examLimits.get(userId) ?? {
          week: { key: weekKey(), count: 0 },
          month: { key: monthKey(), count: 0 },
        };
        if (row.period === "week") {
          state.week = { key: String(row.period_key), count: Number(row.count) };
        } else if (row.period === "month") {
          state.month = { key: String(row.period_key), count: Number(row.count) };
        }
        examLimits.set(userId, state);
      }
    }
  } catch {
    // Table may not exist yet — gracefully use in-memory only.
  }
}

// ── canCreateExam — check + increment atomically in-memory, persist async ─────

export function canCreateExam(userId: string | number, plan: "weekly" | "monthly"): boolean {
  const userKey = String(userId);
  const currentWeek = weekKey();
  const currentMonth = monthKey();

  const state: LimitState = examLimits.get(userKey) ?? {
    week: { key: currentWeek, count: 0 },
    month: { key: currentMonth, count: 0 },
  };

  // Roll over count when period boundary has passed.
  if (state.week.key !== currentWeek) state.week = { key: currentWeek, count: 0 };
  if (state.month.key !== currentMonth) state.month = { key: currentMonth, count: 0 };

  const limit = plan === "weekly" ? 3 : 10;
  const period = plan === "weekly" ? state.week : state.month;

  if (period.count >= limit) return false;

  period.count += 1;
  examLimits.set(userKey, state);

  const periodDbKey = plan === "weekly" ? "week" : "month";
  const periodKey = plan === "weekly" ? currentWeek : currentMonth;

  void (async () => {
    try {
      await supabase.from("exam_limits").upsert(
        { user_id: userKey, period: periodDbKey, period_key: periodKey, count: period.count },
        { onConflict: "user_id,period" }
      );
    } catch {
      // Supabase unavailable — in-memory state already updated.
    }
  })();

  return true;
}
