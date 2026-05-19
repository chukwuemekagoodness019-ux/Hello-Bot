import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { insertFeedback } from "../lib/db-users";
import { getFlags } from "../lib/flags";
import { getAnnouncement } from "../lib/announcements";

const router: IRouter = Router();

router.get("/flags", (_req, res) => {
  res.json(getFlags());
});

router.get("/announcement", (_req, res) => {
  res.json(getAnnouncement());
});

router.post("/feedback", sessionMiddleware, async (req, res, next) => {
  try {
    const u = req.user!;
    const category = String(req.body?.category || "general").slice(0, 50);
    const message = String(req.body?.message || "").trim();
    if (!message || message.length < 3) {
      res.status(400).json({ error: "Message too short", code: "SHORT_MESSAGE" });
      return;
    }
    await insertFeedback({ userId: u.id, category, message, status: "unread" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
