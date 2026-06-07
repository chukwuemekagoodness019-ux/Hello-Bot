import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { getUserMessages, markMessagesRead, sendAdminMessage } from "../lib/user-messages";
import { checkAndDispatchDueReviews, generateIntelligentReminders } from "../lib/review-schedule";

const router: IRouter = Router();

router.get("/user/messages", sessionMiddleware, async (req, res, next) => {
  try {
    const u = req.user!;
    // Fire-and-forget: dispatch spaced-repetition reviews + intelligent course reminders.
    // Both functions swallow all errors internally — never blocks the response.
    void checkAndDispatchDueReviews(u.id, sendAdminMessage);
    void generateIntelligentReminders(u.id, sendAdminMessage);
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
