import type { GeneratedQuestion } from "./ai";

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

export function gcQuizzes(): void {
  const now = Date.now();
  for (const [k, v] of quizStore) {
    const expiresAt = v.expiresAt ?? (v.createdAt + 4 * 60 * 60 * 1000);
    if (now > expiresAt) quizStore.delete(k);
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
  return quizStore.delete(id);
}
