import { Router, type IRouter } from "express";
import { sessionMiddleware, isPremiumActive, LIMITS } from "../lib/session";

const router: IRouter = Router();

router.get("/me", sessionMiddleware, (req, res) => {
  const u = req.user!;
  const premium = isPremiumActive(u);
  res.json({
    id: u.id,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    isPremium: premium,
    premiumUntil: u.premiumUntil ? u.premiumUntil.toISOString() : null,
    limits: {
      messagesUsed: u.messagesUsedToday,
      messagesLimit: premium ? -1 : LIMITS.messages.free + LIMITS.messages.grace,
      quizzesUsed: u.quizzesUsedToday,
      quizzesLimit: premium ? -1 : LIMITS.quizzes.free,
      voiceUsed: u.voiceUsedToday,
      voiceLimit: premium ? -1 : LIMITS.voice.free,
    },
    streak: {
      currentStreak: u.currentStreak,
      bestStreak: u.bestStreak,
      bestScore: u.bestScore,
      lastActiveDate: u.lastActiveDate ?? null,
    },
  });
});

export default router;
