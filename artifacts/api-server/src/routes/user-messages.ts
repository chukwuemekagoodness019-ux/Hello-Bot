import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { getUserMessages, markMessagesRead } from "../lib/user-messages";

const router: IRouter = Router();

router.get("/user/messages", sessionMiddleware, async (req, res, next) => {
  try {
    const u = req.user!;
    const messages = await getUserMessages(u.id);
    res.json(messages);
  } catch (e) {
    next(e);
  }
});

router.put("/user/messages/read", sessionMiddleware, async (req, res, next) => {
  try {
    const u = req.user!;
    await markMessagesRead(u.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
