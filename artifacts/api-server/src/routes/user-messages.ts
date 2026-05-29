import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { getUserMessages, markMessagesRead } from "../lib/user-messages";

const router: IRouter = Router();

router.get("/user/messages", sessionMiddleware, (req, res) => {
  const u = req.user!;
  const messages = getUserMessages(u.id);
  res.json(messages);
});

router.put("/user/messages/read", sessionMiddleware, (req, res) => {
  const u = req.user!;
  markMessagesRead(u.id);
  res.json({ ok: true });
});

export default router;
