import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { getQuizStats, getRecentAttempts } from "../lib/db-dashboard";
import { getProfileForAI } from "../lib/db-profile";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/dashboard — streak, weaknesses, strong topics, study consistency,
// recent activity, registered courses, and upcoming exam dates.
// All profile-aware data is fetched in parallel; profile fetch is always
// graceful (returns empty on failure so dashboard never breaks for new users).
// ---------------------------------------------------------------------------
router.get("/dashboard", sessionMiddleware, async (req, res, next) => {
  try {
    const u      = req.user!;
    const userId = Number(u.id);

    const [stats, recentAttempts, aiProfile] = await Promise.all([
      getQuizStats(userId),
      getRecentAttempts(userId, 10),
      getProfileForAI(userId).catch(() => ({ profile: null, courses: [] as { courseCode: string; courseTitle: string }[] })),
    ]);

    res.json({
      streak: {
        currentStreak: u.currentStreak,
        bestStreak:    u.bestStreak,
        bestScore:     u.bestScore,
        lastActiveDate: u.lastActiveDate ?? null,
      },
      weaknesses:       stats.weaknesses,
      strongTopics:     stats.strongTopics,
      studyConsistency: stats.studyConsistency,
      recentAttempts,
      courses:    aiProfile.courses,
      examDates:  aiProfile.profile?.examDates ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
