import { Router, type IRouter } from "express";
import multer from "multer";
import { sessionMiddleware } from "../lib/session";
import { insertPayment } from "../lib/db-users";
import { isFlagEnabled } from "../lib/flags";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const PLANS = [
  { id: "weekly", label: "1 Week Premium", priceLabel: "₦2,000" },
  { id: "monthly", label: "1 Month Premium", priceLabel: "₦6,000" },
] as const;

router.get("/payment/info", sessionMiddleware, (_req, res) => {
  res.json({
    accountName: process.env.PAYMENT_ACCOUNT_NAME || "",
    accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || "",
    provider: process.env.PAYMENT_PROVIDER || "",
    plans: PLANS,
  });
});

router.post("/payment/submit", sessionMiddleware, upload.single("screenshot"), async (req, res, next) => {
  try {
    if (!isFlagEnabled("payments")) {
      res.status(503).json({ error: "Payments are temporarily unavailable for maintenance.", code: "FEATURE_DISABLED" });
      return;
    }

    const u = req.user!;
    const plan = String(req.body?.plan || "");
    const transactionId = String(req.body?.transactionId || "").trim();
    if (!PLANS.some((p) => p.id === plan)) {
      res.status(400).json({ error: "Invalid plan", code: "BAD_PLAN" });
      return;
    }
    if (!transactionId) {
      res.status(400).json({ error: "Transaction ID is required", code: "MISSING_TX" });
      return;
    }
    const screenshot = req.file;
    const created = await insertPayment({
      userId: u.id,
      plan,
      transactionId,
      screenshotName: screenshot?.originalname ?? null,
      screenshotData: screenshot ? screenshot.buffer.toString("base64") : null,
      status: "pending",
    });
    res.json({ id: created.id, status: created.status, message: "Payment submitted. We'll review and upgrade your account shortly." });
  } catch (err) {
    next(err);
  }
});

export default router;
