import { Router, type IRouter } from "express";
import {
  countUsers, countPremiumUsers, countPaymentsByStatus,
  listUsersAdmin, listPaymentsAdmin,
  getPaymentById, updatePaymentStatus,
  getUserById, updateUser,
  getFeedbackAdmin, deleteFeedbackById, updateFeedbackStatus,
} from "../lib/db-users";
import { adminLogin, adminMiddleware } from "../lib/admin";
import { AdminLoginBody, AdminUpgradeUserBody } from "@workspace/api-zod";
import { getAiStatus, getCacheStats } from "../lib/ai";
import { getFlags, setFlag } from "../lib/flags";
import { getAnnouncement, setAnnouncement, clearAnnouncement } from "../lib/announcements";
import type { Announcement } from "../lib/announcements";
import { getErrorLog, clearErrorLog } from "../lib/error-log";
import { getActiveExams, revokeExam } from "../lib/exam-store";
import { setRejectionReason, getRejectionReason } from "../lib/rejection-reasons";
import { sendAdminMessage, getUserMessages, clearUserMessages } from "../lib/user-messages";

const router: IRouter = Router();

router.post("/admin/login", (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login", code: "INVALID_BODY" });
    return;
  }
  const email = String((req.body as Record<string, unknown>)?.email || "");
  const token = adminLogin(parsed.data.secretKey, parsed.data.password, email);
  if (!token) {
    res.status(401).json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });
    return;
  }
  res.json({ token });
});

router.use("/admin", adminMiddleware);

router.get("/admin/summary", async (_req, res, next) => {
  try {
    const [totalUsers, premiumUsers, pendingPayments, approvedPayments] = await Promise.all([
      countUsers(),
      countPremiumUsers(),
      countPaymentsByStatus("pending"),
      countPaymentsByStatus("approved"),
    ]);
    res.json({ totalUsers, premiumUsers, pendingPayments, approvedPayments });
  } catch (e) {
    next(e);
  }
});

router.get("/admin/users", async (_req, res, next) => {
  try {
    const rows = await listUsersAdmin(500);
    res.json(rows.map((u) => ({
      id: u.id, email: u.email ?? null, displayName: u.displayName ?? null,
      createdAt: u.createdAt.toISOString(), isPremium: u.isPremium,
      premiumUntil: u.premiumUntil ? u.premiumUntil.toISOString() : null,
      messagesUsedToday: u.messagesUsedToday, quizzesUsedToday: u.quizzesUsedToday,
      currentStreak: u.currentStreak, bestStreak: u.bestStreak, bestScore: u.bestScore,
    })));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/payments", async (_req, res, next) => {
  try {
    const rows = await listPaymentsAdmin(500);
    res.json(rows.map((p) => ({
      id: p.id, userId: p.userId, plan: p.plan, transactionId: p.transactionId,
      screenshotName: p.screenshotName ?? null, hasScreenshot: !!p.screenshotData,
      status: p.status, createdAt: p.createdAt.toISOString(),
      rejectionReason: p.status === "rejected" ? getRejectionReason(p.id) : null,
    })));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/payments/:id/screenshot", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Bad id", code: "BAD_ID" }); return; }
    const payment = await getPaymentById(id);
    if (!payment || !payment.screenshotData) {
      res.status(404).json({ error: "No screenshot found", code: "NOT_FOUND" });
      return;
    }
    const name = payment.screenshotName ?? "";
    const mimeType = /\.(png)$/i.test(name) ? "image/png" : /\.(webp)$/i.test(name) ? "image/webp" : "image/jpeg";
    const buffer = Buffer.from(payment.screenshotData, "base64");
    res.setHeader("Content-Type", mimeType);
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

function planDays(plan: string): number {
  if (plan === "weekly") return 7;
  if (plan === "monthly") return 30;
  return 0;
}

router.post("/admin/payments/:id/approve", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Bad id", code: "BAD_ID" }); return; }
    const payment = await getPaymentById(id);
    if (!payment) { res.status(404).json({ error: "Payment not found", code: "NOT_FOUND" }); return; }
    const days = planDays(payment.plan);
    if (days === 0) { res.status(400).json({ error: "Unknown plan on payment", code: "BAD_PLAN" }); return; }
    const user = await getUserById(payment.userId);
    if (!user) { res.status(404).json({ error: "User not found", code: "NOT_FOUND" }); return; }
    const base = user.premiumUntil && new Date(user.premiumUntil).getTime() > Date.now() ? new Date(user.premiumUntil) : new Date();
    const newUntil = new Date(base.getTime() + days * 86400000);
    await updateUser(user.id, { isPremium: true, premiumUntil: newUntil });
    await updatePaymentStatus(id, "approved");
    res.json({ id, status: "approved", premiumUntil: newUntil.toISOString() });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// BUG-06 FIX: Reject now accepts an optional reason body field.
// Reason is stored in-memory (rejection-reasons.ts) so users can read it.
// ---------------------------------------------------------------------------
router.post("/admin/payments/:id/reject", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Bad id", code: "BAD_ID" }); return; }
    const reason = String((req.body as Record<string, unknown>)?.reason || "").trim();
    const updated = await updatePaymentStatus(id, "rejected");
    if (!updated) { res.status(404).json({ error: "Payment not found", code: "NOT_FOUND" }); return; }
    if (reason) setRejectionReason(id, reason);
    res.json({ id, status: "rejected", reason: reason || null });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/users/:id/upgrade", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const parsed = AdminUpgradeUserBody.safeParse(req.body);
    if (!id || !parsed.success) { res.status(400).json({ error: "Bad request", code: "BAD_REQUEST" }); return; }
    const days = planDays(parsed.data.plan);
    if (days === 0) { res.status(400).json({ error: "Unknown plan", code: "BAD_PLAN" }); return; }
    const user = await getUserById(id);
    if (!user) { res.status(404).json({ error: "User not found", code: "NOT_FOUND" }); return; }
    const base = user.premiumUntil && new Date(user.premiumUntil).getTime() > Date.now() ? new Date(user.premiumUntil) : new Date();
    const newUntil = new Date(base.getTime() + days * 86400000);
    await updateUser(id, { isPremium: true, premiumUntil: newUntil });
    res.json({ id, isPremium: true, premiumUntil: newUntil.toISOString() });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/users/:id/revoke", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    if (!id) { res.status(400).json({ error: "Bad id", code: "BAD_ID" }); return; }
    await updateUser(id, { isPremium: false, premiumUntil: null });
    res.json({ id, isPremium: false });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Admin → user messaging (in-memory, survives as long as process is alive).
// ---------------------------------------------------------------------------
router.post("/admin/users/:id/message", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    if (!id) { res.status(400).json({ error: "Bad id", code: "BAD_ID" }); return; }
    const text = String((req.body as Record<string, unknown>)?.text || "").trim();
    const fromAdmin = String((req.body as Record<string, unknown>)?.fromAdmin || "Admin").trim().slice(0, 60);
    if (!text) { res.status(400).json({ error: "text is required", code: "MISSING_TEXT" }); return; }
    const user = await getUserById(id);
    if (!user) { res.status(404).json({ error: "User not found", code: "NOT_FOUND" }); return; }
    const msg = sendAdminMessage(id, text, fromAdmin || "Admin");
    res.json(msg);
  } catch (e) {
    next(e);
  }
});

router.get("/admin/users/:id/messages", (req, res) => {
  const id = req.params.id as string;
  res.json(getUserMessages(id));
});

router.delete("/admin/users/:id/messages", (req, res) => {
  const id = req.params.id as string;
  clearUserMessages(id);
  res.json({ ok: true });
});

router.get("/admin/ai-status", async (_req, res, next) => {
  try {
    const [status, cache] = await Promise.all([getAiStatus(), Promise.resolve(getCacheStats())]);
    res.json({ ...status, cache });
  } catch (e) {
    next(e);
  }
});

router.get("/admin/flags", (_req, res) => {
  res.json(getFlags());
});

router.put("/admin/flags/:key", (req, res) => {
  const key = req.params.key;
  const enabled = (req.body as Record<string, unknown>)?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be boolean", code: "BAD_BODY" });
    return;
  }
  const ok = setFlag(key, enabled);
  if (!ok) {
    res.status(404).json({ error: "Unknown flag", code: "UNKNOWN_FLAG" });
    return;
  }
  res.json({ key, enabled });
});

router.get("/admin/announcement", (_req, res) => {
  res.json(getAnnouncement());
});

router.post("/admin/announcement", (req, res) => {
  const text = String((req.body as Record<string, unknown>)?.text || "").trim();
  const type = String((req.body as Record<string, unknown>)?.type || "");
  if (!text) {
    res.status(400).json({ error: "text is required", code: "MISSING_TEXT" });
    return;
  }
  if (!["info", "warning", "error"].includes(type)) {
    res.status(400).json({ error: "type must be info|warning|error", code: "BAD_TYPE" });
    return;
  }
  const a: Announcement = { id: Date.now().toString(), text, type: type as Announcement["type"] };
  setAnnouncement(a);
  res.json(a);
});

router.delete("/admin/announcement", (_req, res) => {
  clearAnnouncement();
  res.json({ ok: true });
});

router.get("/admin/feedback", async (_req, res, next) => {
  try {
    const rows = await getFeedbackAdmin(200);
    res.json(rows.map((f) => ({
      id: f.id, userId: f.userId, category: f.category,
      message: f.message, status: f.status, createdAt: f.createdAt.toISOString(),
    })));
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/feedback/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Bad id", code: "BAD_ID" }); return; }
    await deleteFeedbackById(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/feedback/:id/status", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Bad id", code: "BAD_ID" }); return; }
    const status = String((req.body as Record<string, unknown>)?.status || "");
    if (!["unread", "investigating", "resolved"].includes(status)) {
      res.status(400).json({ error: "Invalid status", code: "BAD_STATUS" });
      return;
    }
    const updated = await updateFeedbackStatus(id, status);
    if (!updated) { res.status(404).json({ error: "Feedback not found", code: "NOT_FOUND" }); return; }
    res.json({ id, status });
  } catch (e) {
    next(e);
  }
});

router.get("/admin/errors", (_req, res) => {
  res.json(getErrorLog());
});

router.delete("/admin/errors", (_req, res) => {
  clearErrorLog();
  res.json({ ok: true });
});

router.get("/admin/exams", (_req, res) => {
  res.json(getActiveExams());
});

router.delete("/admin/exams/:id", (req, res) => {
  const id = req.params.id as string;
  const ok = revokeExam(id);
  if (!ok) {
    res.status(404).json({ error: "Exam not found", code: "NOT_FOUND" });
    return;
  }
  res.json({ ok: true });
});

export default router;
