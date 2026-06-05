import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { getWeaknesses, getRecentAttempts } from "../lib/db-dashboard";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/dashboard — streak info, subject weaknesses, and recent activity.
// Streak fields come directly from the user row (already in req.user).
// Weaknesses and recent attempts are queried from quiz_attempts.
// ---------------------------------------------------------------------------
router.get("/dashboard", sessionMiddleware, async (req, res, next) => {
  try {
    const u = req.user!;

    const [weaknesses, recentAttempts] = await Promise.all([
      getWeaknesses(u.id),
      getRecentAttempts(u.id, 10),
    ]);

    res.json({
      streak: {
        currentStreak: u.currentStreak,
        bestStreak: u.bestStreak,
        bestScore: u.bestScore,
        lastActiveDate: u.lastActiveDate ?? null,
      },
      weaknesses,
      recentAttempts,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
