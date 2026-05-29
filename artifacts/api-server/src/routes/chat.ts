import { Router, type IRouter } from "express";
import { sessionMiddleware, isPremiumActive, LIMITS } from "../lib/session";
import { updateUser } from "../lib/db-users";
import { SendChatBody } from "@workspace/api-zod";
import { chatComplete, chatCompleteStream, STREAM_FALLBACK, FALLBACK_MESSAGE } from "../lib/ai";

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

    const reply = await chatComplete(messages);

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

    let fullReply = "";

    try {
      fullReply = await chatCompleteStream(messages, (chunk) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      });
    } catch {
      if (!fullReply.trim()) {
        fullReply = STREAM_FALLBACK;
        res.write(`data: ${JSON.stringify({ text: STREAM_FALLBACK })}\n\n`);
      }
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

export default router;
