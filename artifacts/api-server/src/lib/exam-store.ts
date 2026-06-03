import type { GeneratedQuestion } from "./ai";
import { supabase } from "./supabase";

export interface StoredQuiz {
  userId: string | number;
  questions: GeneratedQuestion[];
  createdAt: number;
  title: string;
  timeMinutes?: number;
  subject?: string;
  difficulty?: string;
  questionType?: string;
  expiresAt?: number;
  maxAttempts?: number;
  submittedUserIds: Set<string | number>;
}

export const quizStore = new Map<string, StoredQuiz>();

// ── DB row conversion ─────────────────────────────────────────────────────────

function toRow(id: string, v: StoredQuiz): Record<string, unknown> {
  return {
    id,
    user_id: String(v.userId),
    title: v.title,
    questions: v.questions,
    created_at: new Date(v.createdAt).toISOString(),
    expires_at: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
    time_minutes: v.timeMinutes ?? null,
    subject: v.subject ?? null,
    difficulty: v.difficulty ?? null,
    question_type: v.questionType ?? null,
    max_attempts: v.maxAttempts ?? 0,
    submitted_user_ids: Array.from(v.submittedUserIds).map(String),
  };
}

function fromRow(row: Record<string, unknown>): [string, StoredQuiz] {
  return [
    String(row.id),
    {
      userId: String(row.user_id),
      title: String(row.title),
      questions: row.questions as GeneratedQuestion[],
      createdAt: new Date(String(row.created_at)).getTime(),
      expiresAt: row.expires_at ? new Date(String(row.expires_at)).getTime() : undefined,
      timeMinutes: row.time_minutes != null ? Number(row.time_minutes) : undefined,
      subject: row.subject != null ? String(row.subject) : undefined,
      difficulty: row.difficulty != null ? String(row.difficulty) : undefined,
      questionType: row.question_type != null ? String(row.question_type) : undefined,
      maxAttempts: row.max_attempts != null ? Number(row.max_attempts) : 0,
      submittedUserIds: new Set<string | number>(
        (row.submitted_user_ids as string[] | null) ?? []
      ),
    },
  ];
}

// ── Startup load ──────────────────────────────────────────────────────────────

export async function initExamStore(): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("active_exams")
      .select("*")
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (!error && data) {
      for (const row of data) {
        const [id, quiz] = fromRow(row as Record<string, unknown>);
        quizStore.set(id, quiz);
      }
    }
  } catch {
    // Table may not exist yet — gracefully use empty store.
  }
}

// ── Write-through helpers ─────────────────────────────────────────────────────

export function setExam(id: string, quiz: StoredQuiz): void {
  quizStore.set(id, quiz);
  void (async () => {
    try {
      await supabase.from("active_exams").upsert(toRow(id, quiz), { onConflict: "id" });
    } catch {
      // Supabase unavailable — in-memory store already updated.
    }
  })();
}

export function updateSubmittedUsers(id: string): void {
  const quiz = quizStore.get(id);
  if (!quiz) return;
  const ids = Array.from(quiz.submittedUserIds).map(String);
  void (async () => {
    try {
      await supabase.from("active_exams").update({ submitted_user_ids: ids }).eq("id", id);
    } catch {
      // Supabase unavailable — in-memory already updated.
    }
  })();
}

export function deleteQuiz(id: string): boolean {
  const existed = quizStore.delete(id);
  if (existed) {
    void (async () => {
      try {
        await supabase.from("active_exams").delete().eq("id", id);
      } catch {
        // Supabase unavailable.
      }
    })();
  }
  return existed;
}

// ── GC + read helpers ─────────────────────────────────────────────────────────

export function gcQuizzes(): void {
  const now = Date.now();
  const expired: string[] = [];
  for (const [k, v] of quizStore) {
    const expiresAt = v.expiresAt ?? (v.createdAt + 4 * 60 * 60 * 1000);
    if (now > expiresAt) {
      quizStore.delete(k);
      expired.push(k);
    }
  }
  if (expired.length > 0) {
    void (async () => {
      try {
        await supabase.from("active_exams").delete().in("id", expired);
      } catch {
        // Supabase unavailable.
      }
    })();
  }
}

export function getActiveExams(): Array<{
  id: string;
  subject: string;
  difficulty: string;
  questionCount: number;
  createdAt: number;
  expiresAt: number | null;
  attempts: number;
  maxAttempts: number;
}> {
  gcQuizzes();
  return Array.from(quizStore.entries())
    .map(([id, v]) => ({
      id,
      subject: v.title,
      difficulty: v.difficulty ?? "medium",
      questionCount: v.questions.length,
      createdAt: v.createdAt,
      expiresAt: v.expiresAt ?? null,
      attempts: v.submittedUserIds.size,
      maxAttempts: v.maxAttempts ?? 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function revokeExam(id: string): boolean {
  return deleteQuiz(id);
}
