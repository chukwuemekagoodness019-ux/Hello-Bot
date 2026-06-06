import { Router, type IRouter } from "express";
import { sessionMiddleware, isPremiumActive, LIMITS } from "../lib/session";
import { updateUser } from "../lib/db-users";
import type { User } from "../lib/db-users";
import { getWeaknesses } from "../lib/db-dashboard";
import { getProfileForAI } from "../lib/db-profile";
import { SendChatBody } from "@workspace/api-zod";
import { chatComplete, chatCompleteStream, summarizeConversation, STREAM_FALLBACK, FALLBACK_MESSAGE } from "../lib/ai";
import type { ChatMessage, UserProfile } from "../lib/ai";

// ---------------------------------------------------------------------------
// Per-user weakness cache — 5-minute TTL so we don't hit the DB on every
// single chat message, but weaknesses stay reasonably fresh.
// ---------------------------------------------------------------------------
interface WeaknessCache {
  at: number;
  subjects: Array<{ subject: string; avgPercent: number }>;
}
const weaknessCache = new Map<number, WeaknessCache>();
const WEAKNESS_TTL_MS = 5 * 60 * 1000;

async function getCachedWeaknesses(userId: number): Promise<Array<{ subject: string; avgPercent: number }>> {
  const cached = weaknessCache.get(userId);
  if (cached && Date.now() - cached.at < WEAKNESS_TTL_MS) return cached.subjects;
  try {
    const entries = await getWeaknesses(userId);
    const subjects = entries.map((e) => ({ subject: e.subject, avgPercent: e.avgPercent }));
    weaknessCache.set(userId, { at: Date.now(), subjects });
    return subjects;
  } catch {
    return cached?.subjects ?? [];
  }
}

function buildProfile(
  u: User,
  weakSubjects: Array<{ subject: string; avgPercent: number }>,
  academic: { profile: { institution: string | null; department: string | null; academicLevel: string | null; semester: string | null; studyGoals: string | null; examDates: string | null; weeklySchedule: string | null } | null; courses: Array<{ courseCode: string; courseTitle: string }> },
): UserProfile {
  return {
    displayName: u.displayName ?? null,
    currentStreak: u.currentStreak,
    bestStreak: u.bestStreak,
    bestScore: u.bestScore,
    lastActiveDate: u.lastActiveDate ?? null,
    weakSubjects,
    academicProfile: academic.profile
      ? {
          institution: academic.profile.institution ?? undefined,
          department: academic.profile.department ?? undefined,
          academicLevel: academic.profile.academicLevel ?? undefined,
          semester: academic.profile.semester ?? undefined,
          studyGoals: academic.profile.studyGoals ?? undefined,
          examDates: academic.profile.examDates ?? undefined,
          weeklySchedule: academic.profile.weeklySchedule ?? undefined,
        }
      : null,
    courses: academic.courses,
  };
}

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Standard (non-streaming) chat — kept for API clients and fallback.
// BUG-01 FIX: Counter is NOT incremented when AI returns FALLBACK_MESSAGE.
// ---------------------------------------------------------------------------
router.post("/chat", sessionMiddleware, async (req, res, next) => {
  try {
    const parsed = SendChatBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", code: "INVALID_BODY" });
      return;
    }
    const { messages, usedVoice } = parsed.data;
    const u = req.user!;
    const premium = isPremiumActive(u);

    const messageLimit = LIMITS.messages.free + LIMITS.messages.grace;
    if (!premium && u.messagesUsedToday >= messageLimit) {
      res.status(402).json({
        error: "Daily message limit reached. Upgrade to Premium for unlimited access.",
        code: "LIMIT_REACHED",
        kind: "messages",
      });
      return;
    }
    if (!premium && usedVoice && u.voiceUsedToday >= LIMITS.voice.free) {
      res.status(402).json({
        error: "Daily voice input limit reached. Upgrade to Premium for unlimited voice.",
        code: "LIMIT_REACHED",
        kind: "voice",
      });
      return;
    }

    const [weakSubjects, academic] = await Promise.all([
      getCachedWeaknesses(Number(u.id)),
      getProfileForAI(Number(u.id)),
    ]);
    const profile = buildProfile(u, weakSubjects, academic);
    const reply = await chatComplete(messages, profile);

    if (reply !== FALLBACK_MESSAGE) {
      await updateUser(u.id, {
        messagesUsedToday: u.messagesUsedToday + 1,
        voiceUsedToday: usedVoice ? u.voiceUsedToday + 1 : u.voiceUsedToday,
      });
    }

    res.json({ reply, role: "assistant" });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Streaming chat — returns Server-Sent Events.
// Each data event: { text: string }  — accumulate into full message.
// Final event: [DONE]
// Comment lines (": heartbeat") are sent every 15 s to prevent reverse-proxy
// idle-connection timeouts during long AI generation.
// Error before stream starts: normal HTTP error JSON.
// BUG-01 FIX: Counter is NOT incremented when all providers fail (STREAM_FALLBACK).
// ---------------------------------------------------------------------------
router.post("/chat/stream", sessionMiddleware, async (req, res, next) => {
  try {
    const parsed = SendChatBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", code: "INVALID_BODY" });
      return;
    }
    const { messages, usedVoice } = parsed.data;
    const u = req.user!;
    const premium = isPremiumActive(u);

    const messageLimit = LIMITS.messages.free + LIMITS.messages.grace;
    if (!premium && u.messagesUsedToday >= messageLimit) {
      res.status(402).json({
        error: "Daily message limit reached. Upgrade to Premium for unlimited access.",
        code: "LIMIT_REACHED",
        kind: "messages",
      });
      return;
    }
    if (!premium && usedVoice && u.voiceUsedToday >= LIMITS.voice.free) {
      res.status(402).json({
        error: "Daily voice input limit reached. Upgrade to Premium for unlimited voice.",
        code: "LIMIT_REACHED",
        kind: "voice",
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Keepalive: send SSE comment every 15 s so reverse proxies don't close
    // idle connections during long AI generation times.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": heartbeat\n\n");
      }
    }, 15_000);

    const [weakSubjects, academic] = await Promise.all([
      getCachedWeaknesses(Number(u.id)),
      getProfileForAI(Number(u.id)),
    ]);
    const profile = buildProfile(u, weakSubjects, academic);

    let fullReply = "";

    try {
      fullReply = await chatCompleteStream(messages, (chunk) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }, profile);
    } catch {
      if (!fullReply.trim()) {
        fullReply = STREAM_FALLBACK;
        res.write(`data: ${JSON.stringify({ text: STREAM_FALLBACK })}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
    }

    if (!fullReply.trim()) {
      fullReply = STREAM_FALLBACK;
      res.write(`data: ${JSON.stringify({ text: STREAM_FALLBACK })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();

    const aiSucceeded = fullReply !== STREAM_FALLBACK;
    if (aiSucceeded) {
      await updateUser(u.id, {
        messagesUsedToday: u.messagesUsedToday + 1,
        voiceUsedToday: usedVoice ? u.voiceUsedToday + 1 : u.voiceUsedToday,
      });
    }
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      req.log.error({ err }, "Stream error after headers sent");
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// Summarize — infrastructure endpoint used by the frontend to compress long
// conversation history into a compact bullet-point system message.
// Does NOT increment message/voice counters — it is transparent infrastructure.
// Auth is still required so anonymous clients cannot use compute for free.
// ---------------------------------------------------------------------------
router.post("/chat/summarize", sessionMiddleware, async (req, res, next) => {
  try {
    const body = req.body as { messages?: unknown };
    if (!Array.isArray(body.messages)) {
      res.status(400).json({ error: "messages must be an array" });
      return;
    }
    const messages = (body.messages as ChatMessage[]).filter(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );
    if (!messages.length) {
      res.json({ summary: "" });
      return;
    }
    const summary = await summarizeConversation(messages);
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

export default router;
