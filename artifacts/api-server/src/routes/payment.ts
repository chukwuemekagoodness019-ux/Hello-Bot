import { Router, type IRouter } from "express";
import multer from "multer";
import { sessionMiddleware } from "../lib/session";
import {
  insertPayment,
  getPaymentsByTransactionId,
  getPendingPaymentsByUser,
  getLatestPaymentByUser,
} from "../lib/db-users";
import { isFlagEnabled } from "../lib/flags";
import { getRejectionReason } from "../lib/rejection-reasons";

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
    accountName: process.env.VITE_ACCOUNT_NAME || process.env.PAYMENT_ACCOUNT_NAME || "",
    accountNumber: process.env.VITE_ACCOUNT_NUMBER || process.env.PAYMENT_ACCOUNT_NUMBER || "",
    provider: process.env.VITE_BANK_NAME || process.env.PAYMENT_PROVIDER || "",
    plans: PLANS,
  });
});

// ---------------------------------------------------------------------------
// Payment status — returns the user's most recent payment and its status.
// Includes rejection reason (in-memory, lost on server restart).
// ---------------------------------------------------------------------------
router.get("/payment/status", sessionMiddleware, async (req, res, next) => {
  try {
    const u = req.user!;
    const payment = await getLatestPaymentByUser(u.id);
    if (!payment) {
      res.json({ hasPayment: false });
      return;
    }
    const rejectionReason = payment.status === "rejected"
      ? getRejectionReason(payment.id)
      : null;
    res.json({
      hasPayment: true,
      id: payment.id,
      plan: payment.plan,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      rejectionReason,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Submit payment — with duplicate transaction ID and pending-payment guards.
// ---------------------------------------------------------------------------
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

    const [existingTx, pendingPayments] = await Promise.all([
      getPaymentsByTransactionId(transactionId),
      getPendingPaymentsByUser(u.id),
    ]);

    if (existingTx.length > 0) {
      res.status(409).json({
        error: "This transaction ID has already been submitted. If you believe this is an error, please contact support.",
        code: "DUPLICATE_TX",
      });
      return;
    }

    if (pendingPayments.length > 0) {
      res.status(409).json({
        error: "You already have a payment pending review. Please wait for it to be processed before submitting another.",
        code: "PENDING_EXISTS",
      });
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
