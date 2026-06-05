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
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const SCREENSHOT_BUCKET = "payment-screenshots";

/**
 * Upload a screenshot buffer to Supabase Storage.
 * Returns the public URL on success, or null if upload fails (caller falls
 * back to storing base64 so the payment submission is never blocked).
 */
async function uploadScreenshot(
  file: Express.Multer.File,
  userId: string | number,
): Promise<string | null> {
  try {
    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${String(userId)}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
    if (error) return null;
    const {
      data: { publicUrl },
    } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path);
    return publicUrl || null;
  } catch {
    return null;
  }
}

/**
 * Format a raw price value from an environment variable into Nigerian Naira.
 * Accepts pre-formatted strings ("₦1,500") and raw integers ("1500" → "₦1,500").
 * Returns an empty string when the env var is not set.
 */
function formatNairaPrice(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (v.includes("₦")) return v;
  const num = parseInt(v.replace(/,/g, ""), 10);
  if (!isNaN(num)) return "₦" + num.toLocaleString("en-US");
  return v;
}

function getPlans() {
  return [
    { id: "weekly",  label: "1 Week Premium",  priceLabel: formatNairaPrice(process.env.WEEKLY_PREMIUM_PRICE) },
    { id: "monthly", label: "1 Month Premium", priceLabel: formatNairaPrice(process.env.MONTHLY_PREMIUM_PRICE) },
  ] as const;
}

router.get("/payment/info", sessionMiddleware, (_req, res) => {
  // no-store prevents browsers and proxies from caching pricing data so that
  // environment-variable changes are reflected immediately on next open.
  res.setHeader("Cache-Control", "no-store, no-cache");
  res.json({
    // Use server-only env vars — never VITE_ prefixed to avoid leaking into
    // the frontend bundle.
    accountName:   process.env.PAYMENT_ACCOUNT_NAME   ?? "",
    accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER ?? "",
    provider:      process.env.PAYMENT_PROVIDER        ?? "",
    plans: getPlans(),
  });
});

// ---------------------------------------------------------------------------
// Payment status — returns the user's most recent payment and its status.
// Rejection reasons are persisted to Supabase via rejection-reasons.ts.
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
// Screenshot is uploaded to Supabase Storage; falls back to base64 if the
// bucket is unavailable so the payment is never silently blocked.
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
    if (!getPlans().some((p) => p.id === plan)) {
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

    const file = req.file;
    let screenshotData: string | null = null;

    if (file) {
      // Prefer Supabase Storage URL; fall back to base64 if upload fails.
      const storageUrl = await uploadScreenshot(file, u.id);
      if (storageUrl) {
        screenshotData = storageUrl;
      } else {
        screenshotData = file.buffer.toString("base64");
      }
    }

    const created = await insertPayment({
      userId: u.id,
      plan,
      transactionId,
      screenshotName: file?.originalname ?? null,
      screenshotData,
      status: "pending",
    });
    res.json({ id: created.id, status: created.status, message: "Payment submitted. We'll review and upgrade your account shortly." });
  } catch (err) {
    next(err);
  }
});

export default router;
