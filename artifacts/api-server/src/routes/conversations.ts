import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { upsertConversations, listConversations } from "../lib/db-conversations";
import type { ServerConversation } from "../lib/db-conversations";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/conversations — return all server-synced conversations for the
// authenticated user (newest first, max 100).
// ---------------------------------------------------------------------------
router.get("/conversations", sessionMiddleware, async (req, res, next) => {
  try {
    const conversations = await listConversations(req.user!.id);
    res.json({ conversations });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/conversations — bulk upsert conversations from the client.
// FILE_CONTEXT system messages must be stripped client-side before this call
// to avoid storing large PDF blobs.  Max 50 conversations, 200 messages each.
// ---------------------------------------------------------------------------
router.put("/conversations", sessionMiddleware, async (req, res, next) => {
  try {
    const body = req.body as { conversations?: unknown };
    if (!Array.isArray(body.conversations)) {
      res.status(400).json({ error: "conversations must be an array", code: "INVALID_BODY" });
      return;
    }

    const convs = (body.conversations as ServerConversation[])
      .filter(
        (c) =>
          c &&
          typeof c === "object" &&
          typeof c.id === "string" &&
          c.id.length > 0 &&
          typeof c.title === "string",
      )
      .slice(0, 50);

    await upsertConversations(req.user!.id, convs);
    res.json({ ok: true, synced: convs.length });
  } catch (err) {
    next(err);
  }
});

export default router;
