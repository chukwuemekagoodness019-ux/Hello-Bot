import { Router, type IRouter } from "express";
import { sessionMiddleware, isPremiumActive, LIMITS } from "../lib/session";
import { updateUser, insertQuizAttempt } from "../lib/db-users";
import { GenerateQuizBody, SubmitQuizBody } from "@workspace/api-zod";
import { generateQuiz } from "../lib/ai";
import { isFlagEnabled } from "../lib/flags";
import crypto from "node:crypto";
import { quizStore, gcQuizzes, setExam, updateSubmittedUsers, deleteQuiz } from "../lib/exam-store";
import { canCreateExam } from "../lib/exam-limits";
import { scheduleReview } from "../lib/review-schedule";

const router: IRouter = Router();

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s.,!?;:'"`]+/g, " ");
}

function resolveObjective(raw: string, options: string[] | undefined): string {
  if (!options || !options.length) return raw;
  const trimmed = raw.trim();
  if (/^[A-Da-d]$/.test(trimmed)) {
    const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return options[idx];
  }
  const prefixed = trimmed.match(/^([A-Da-d])[).:\-\s]+(.+)$/);
  if (prefixed) {
    const idx = prefixed[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && options[idx]) return options[idx];
    return prefixed[2];
  }
  return raw;
}

router.post("/quiz/generate", sessionMiddleware, async (req, res, next) => {
  try {
    if (!isFlagEnabled("quiz")) {
      res.status(503).json({ error: "The quiz system is temporarily unavailable for maintenance.", code: "FEATURE_DISABLED" });
      return;
    }
    const parsed = GenerateQuizBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid quiz request", code: "INVALID_BODY" });
      return;
    }
    const u = req.user!;
    const premium = isPremiumActive(u);
    if (!premium && u.quizzesUsedToday >= LIMITS.quizzes.free) {
      res.status(402).json({ error: "Daily quiz limit reached. Upgrade to Premium for unlimited quizzes.", code: "LIMIT_REACHED", kind: "quizzes" });
      return;
    }
    const { subject, difficulty, questionType, numQuestions, timeMinutes, instructions } = parsed.data;
    const generated = await generateQuiz({ subject, difficulty, questionType, numQuestions, instructions });
    if (!generated.length) {
      res.status(502).json({ error: "Could not generate questions. Try again.", code: "GEN_FAILED" });
      return;
    }
    const quizId = crypto.randomBytes(12).toString("hex");
    gcQuizzes();
    setExam(quizId, { userId: u.id, questions: generated, createdAt: Date.now(), title: subject, submittedUserIds: new Set() });
    await updateUser(u.id, { quizzesUsedToday: u.quizzesUsedToday + 1 });
    res.json({ quizId, subject, difficulty, questionType, timeMinutes, questions: generated.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options })) });
  } catch (err) {
    next(err);
  }
});

router.post("/exam/generate", sessionMiddleware, async (req, res, next) => {
  try {
    if (!isFlagEnabled("exam")) {
      res.status(503).json({ error: "The exam system is temporarily unavailable for maintenance.", code: "FEATURE_DISABLED" });
      return;
    }
    const parsed = GenerateQuizBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid exam request", code: "INVALID_BODY" });
      return;
    }
    const u = req.user!;
    const premium = isPremiumActive(u);
    if (!premium) {
      res.status(402).json({ error: "Exam mode is for Premium users only.", code: "PREMIUM_REQUIRED", kind: "exams" });
      return;
    }
    const plan = u.premiumUntil && new Date(u.premiumUntil).getTime() - Date.now() <= 1000 * 60 * 60 * 24 * 10 ? "weekly" : "monthly";
    if (!canCreateExam(u.id, plan)) {
      res.status(402).json({ error: plan === "weekly" ? "Weekly exam limit reached." : "Monthly exam limit reached.", code: "LIMIT_REACHED", kind: "exams" });
      return;
    }

    const expiresInHours = parseInt(String((req.body as Record<string, unknown>)?.expiresInHours ?? "24"), 10);
    const maxAttemptsRaw = parseInt(String((req.body as Record<string, unknown>)?.maxAttempts ?? "0"), 10);
    const expiresAt = (!isNaN(expiresInHours) && expiresInHours > 0)
      ? Date.now() + expiresInHours * 3600000
      : undefined;
    const maxAttempts = (!isNaN(maxAttemptsRaw) && maxAttemptsRaw > 0) ? maxAttemptsRaw : 0;

    const { subject, difficulty, questionType, numQuestions, instructions } = parsed.data;
    const limitedQuestions = Math.min(Math.max(numQuestions, 10), 50);
    const generated = await generateQuiz({
      subject, difficulty, questionType, numQuestions: limitedQuestions,
      instructions: `${instructions || ""} Create a formal exam with exactly ${limitedQuestions} questions.`.trim(),
    });
    if (!generated.length) {
      res.status(502).json({ error: "Failed to generate exam. Try again.", code: "GEN_FAILED" });
      return;
    }
    const examId = crypto.randomBytes(12).toString("hex");
    gcQuizzes();
    setExam(examId, {
      userId: u.id, questions: generated, createdAt: Date.now(), title: subject,
      timeMinutes: parsed.data.timeMinutes, subject, difficulty,
      questionType, expiresAt, maxAttempts, submittedUserIds: new Set(),
    });
    res.json({
      quizId: examId, examId,
      examLink: `/exam?code=${examId}`,
      subject, difficulty, questionType, timeMinutes: parsed.data.timeMinutes,
      questions: generated.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/exam/:id", sessionMiddleware, async (req, res) => {
  const examId = req.params.id as string;
  gcQuizzes();
  const exam = quizStore.get(examId);
  if (!exam) { res.status(404).json({ error: "Exam not found or has expired.", code: "EXAM_NOT_FOUND" }); return; }
  if (exam.expiresAt && Date.now() > exam.expiresAt) {
    deleteQuiz(examId);
    res.status(404).json({ error: "This exam has expired.", code: "EXAM_EXPIRED" });
    return;
  }
  const u = req.user!;
  if (exam.submittedUserIds.has(u.id)) { res.status(409).json({ error: "You have already submitted this exam.", code: "ALREADY_SUBMITTED" }); return; }
  if (exam.maxAttempts && exam.maxAttempts > 0 && exam.submittedUserIds.size >= exam.maxAttempts) {
    res.status(409).json({ error: "This exam has reached its maximum number of participants.", code: "ATTEMPT_LIMIT" });
    return;
  }
  res.json({
    quizId: examId, subject: exam.title,
    difficulty: exam.difficulty ?? "medium", questionType: exam.questionType ?? "objective",
    timeMinutes: exam.timeMinutes ?? 30,
    questions: exam.questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options })),
  });
});

// ---------------------------------------------------------------------------
// BUG-02 FIX: Exam submission now updates streak + bestScore just like quiz/submit.
// ---------------------------------------------------------------------------
router.post("/exam/submit", sessionMiddleware, async (req, res, next) => {
  try {
    const parsed = SubmitQuizBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid submission", code: "INVALID_BODY" }); return; }
    const u = req.user!;
    const { quizId, subject, answers } = parsed.data;
    const stored = quizStore.get(quizId);
    if (!stored) { res.status(404).json({ error: "Exam not found or expired", code: "EXAM_NOT_FOUND" }); return; }
    if (stored.expiresAt && Date.now() > stored.expiresAt) {
      deleteQuiz(quizId);
      res.status(404).json({ error: "This exam has expired.", code: "EXAM_EXPIRED" });
      return;
    }
    if (stored.submittedUserIds.has(u.id)) { res.status(409).json({ error: "You have already submitted this exam.", code: "ALREADY_SUBMITTED" }); return; }
    if (stored.maxAttempts && stored.maxAttempts > 0 && stored.submittedUserIds.size >= stored.maxAttempts) {
      res.status(409).json({ error: "This exam has reached its maximum number of participants.", code: "ATTEMPT_LIMIT" });
      return;
    }
    const answerMap = new Map<string, string>(answers.map((a) => [a.questionId, a.answer ?? ""]));
    let score = 0;
    const results = stored.questions.map((q) => {
      const userAnswer = answerMap.get(q.id) ?? "";
      let isCorrect = false;
      if (q.type === "objective") {
        isCorrect = normalize(resolveObjective(userAnswer, q.options)) === normalize(resolveObjective(q.correctAnswer, q.options));
      } else if (q.type === "fill") {
        isCorrect = normalize(userAnswer) === normalize(q.correctAnswer);
      } else {
        const ua = normalize(userAnswer); const ca = normalize(q.correctAnswer);
        if (ua.length > 0 && ca.length > 0) {
          const tokens = ca.split(" ").filter((t) => t.length > 3);
          const hits = tokens.filter((t) => ua.includes(t)).length;
          isCorrect = tokens.length > 0 && hits / tokens.length >= 0.5;
        }
      }
      if (isCorrect) score += 1;
      return { questionId: q.id, prompt: q.prompt, userAnswer, correctAnswer: q.correctAnswer, isCorrect, explanation: q.explanation };
    });
    const total = stored.questions.length;
    const percent = Math.round((score / Math.max(total, 1)) * 100);
    stored.submittedUserIds.add(u.id);
    updateSubmittedUsers(quizId);
    await insertQuizAttempt({ userId: u.id, subject, score, total, percent });

    const today = todayKey();
    let newCurrent = u.currentStreak;
    if (u.lastActiveDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      newCurrent = u.lastActiveDate === yesterday ? u.currentStreak + 1 : 1;
    }
    const newBestStreak = Math.max(u.bestStreak, newCurrent);
    const newBestScore = Math.max(u.bestScore, percent);
    await updateUser(u.id, { currentStreak: newCurrent, bestStreak: newBestStreak, bestScore: newBestScore, lastActiveDate: today });

    // Schedule spaced repetition review reminders (24h, 3-day, 7-day) — non-blocking
    scheduleReview(u.id, subject);

    res.json({ quizId, score, total, percent, results, streak: { currentStreak: newCurrent, bestStreak: newBestStreak, bestScore: newBestScore } });
  } catch (err) { next(err); }
});

router.post("/quiz/submit", sessionMiddleware, async (req, res, next) => {
  try {
    const parsed = SubmitQuizBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid submission", code: "INVALID_BODY" }); return; }
    const u = req.user!;
    const { quizId, subject, answers } = parsed.data;
    const stored = quizStore.get(quizId);
    if (!stored || stored.userId !== u.id) { res.status(404).json({ error: "Quiz not found or expired", code: "QUIZ_NOT_FOUND" }); return; }
    const answerMap = new Map<string, string>(answers.map((a) => [a.questionId, a.answer ?? ""]));
    let score = 0;
    const results = stored.questions.map((q) => {
      const userAnswer = answerMap.get(q.id) ?? "";
      let isCorrect = false;
      if (q.type === "objective") {
        isCorrect = normalize(resolveObjective(userAnswer, q.options)) === normalize(resolveObjective(q.correctAnswer, q.options));
      } else if (q.type === "fill") {
        isCorrect = normalize(userAnswer) === normalize(q.correctAnswer);
      } else {
        const ua = normalize(userAnswer); const ca = normalize(q.correctAnswer);
        if (ua.length > 0 && ca.length > 0) {
          const tokens = ca.split(" ").filter((t) => t.length > 3);
          const hits = tokens.filter((t) => ua.includes(t)).length;
          isCorrect = tokens.length > 0 && hits / tokens.length >= 0.5;
        }
      }
      if (isCorrect) score += 1;
      return { questionId: q.id, prompt: q.prompt, userAnswer, correctAnswer: q.correctAnswer, isCorrect, explanation: q.explanation };
    });
    const total = stored.questions.length;
    const percent = Math.round((score / Math.max(total, 1)) * 100);
    const today = todayKey();
    let newCurrent = u.currentStreak;
    if (u.lastActiveDate !== today) {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      newCurrent = u.lastActiveDate === y ? u.currentStreak + 1 : 1;
    }
    const newBestStreak = Math.max(u.bestStreak, newCurrent);
    const newBestScore = Math.max(u.bestScore, percent);
    await updateUser(u.id, { currentStreak: newCurrent, bestStreak: newBestStreak, bestScore: newBestScore, lastActiveDate: today });
    await insertQuizAttempt({ userId: u.id, subject, score, total, percent });
    deleteQuiz(quizId);

    // Schedule spaced repetition review reminders (24h, 3-day, 7-day) — non-blocking
    scheduleReview(u.id, subject);

    res.json({ quizId, score, total, percent, results, streak: { currentStreak: newCurrent, bestStreak: newBestStreak, bestScore: newBestScore } });
  } catch (err) { next(err); }
});

export default router;
