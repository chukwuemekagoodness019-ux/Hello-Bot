// Dashboard data queries — weaknesses, strong topics, consistency, and recent activity.
// Reads from the existing quiz_attempts table; no new tables required.

import { supabase } from "./supabase";

export interface WeaknessEntry {
  subject: string;
  avgPercent: number;
  attempts: number;
  lastAttemptAt: string;
}

export interface StrongTopicEntry {
  subject: string;
  avgPercent: number;
  attempts: number;
}

export interface StudyConsistency {
  activeDays: number;
  totalDays: number;
}

export interface RecentAttempt {
  subject: string;
  percent: number;
  score: number;
  total: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// getQuizStats — single-query derivation of weaknesses, strong topics, and
// study consistency from the last 30 days of quiz_attempts.
// ---------------------------------------------------------------------------
export async function getQuizStats(userId: string | number): Promise<{
  weaknesses: WeaknessEntry[];
  strongTopics: StrongTopicEntry[];
  studyConsistency: StudyConsistency;
}> {
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since7  = new Date(Date.now() - 7  * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("subject, percent, created_at")
    .eq("user_id", Number(userId))
    .gte("created_at", since30)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`getQuizStats: ${error.message}`);

  const rows = data ?? [];
  const subjectMap = new Map<string, { percents: number[]; lastAt: string }>();
  const activeDays = new Set<string>();

  for (const r of rows) {
    const subject = r.subject as string;
    const percent = r.percent as number;
    const at      = r.created_at as string;
    const entry   = subjectMap.get(subject) ?? { percents: [], lastAt: at };
    entry.percents.push(percent);
    if (at > entry.lastAt) entry.lastAt = at;
    subjectMap.set(subject, entry);
    if (at >= since7) activeDays.add(at.slice(0, 10));
  }

  const weaknesses: WeaknessEntry[]   = [];
  const strongTopics: StrongTopicEntry[] = [];

  for (const [subject, { percents, lastAt }] of subjectMap) {
    const avg = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
    if (avg < 70) {
      weaknesses.push({ subject, avgPercent: avg, attempts: percents.length, lastAttemptAt: lastAt });
    } else if (avg >= 80) {
      strongTopics.push({ subject, avgPercent: avg, attempts: percents.length });
    }
  }

  return {
    weaknesses:       weaknesses.sort((a, b) => a.avgPercent - b.avgPercent),
    strongTopics:     strongTopics.sort((a, b) => b.avgPercent - a.avgPercent).slice(0, 5),
    studyConsistency: { activeDays: activeDays.size, totalDays: 7 },
  };
}

// ---------------------------------------------------------------------------
// getWeaknesses — kept for backward compatibility (used by chat.ts).
// ---------------------------------------------------------------------------
export async function getWeaknesses(
  userId: string | number,
): Promise<WeaknessEntry[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("subject, percent, created_at")
    .eq("user_id", Number(userId))
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`getWeaknesses: ${error.message}`);

  const map = new Map<string, { percents: number[]; lastAt: string }>();
  for (const r of data ?? []) {
    const subject = r.subject as string;
    const percent = r.percent as number;
    const at      = r.created_at as string;
    const entry   = map.get(subject) ?? { percents: [], lastAt: at };
    entry.percents.push(percent);
    if (at > entry.lastAt) entry.lastAt = at;
    map.set(subject, entry);
  }

  const weaknesses: WeaknessEntry[] = [];
  for (const [subject, { percents, lastAt }] of map) {
    const avg = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
    if (avg < 70) weaknesses.push({ subject, avgPercent: avg, attempts: percents.length, lastAttemptAt: lastAt });
  }

  return weaknesses.sort((a, b) => a.avgPercent - b.avgPercent);
}

// ---------------------------------------------------------------------------
// getRecentAttempts — most recent quiz/exam attempts for the user.
// ---------------------------------------------------------------------------
export async function getRecentAttempts(
  userId: string | number,
  limit = 10,
): Promise<RecentAttempt[]> {
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("subject, percent, score, total, created_at")
    .eq("user_id", Number(userId))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentAttempts: ${error.message}`);

  return (data ?? []).map((r) => ({
    subject:   r.subject   as string,
    percent:   r.percent   as number,
    score:     r.score     as number,
    total:     r.total     as number,
    createdAt: r.created_at as string,
  }));
}
