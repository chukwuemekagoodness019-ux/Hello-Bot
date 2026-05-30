import { Router, type IRouter } from "express";
import { userEmailExists, createUser, getUserByEmail } from "../lib/db-users";
import crypto from "node:crypto";
import { setSessionCookie, COOKIE_NAME } from "../lib/session";
import { checkRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
    });
    return crypto.timingSafeEqual(derived, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

router.post("/auth/register", async (req, res, next) => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (!checkRateLimit(`auth_register:${ip}`, 10, 60 * 60 * 1000)) {
      res.status(429).json({ error: "Too many registration attempts. Please try again later.", code: "RATE_LIMITED" });
      return;
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const displayName = String(req.body?.displayName || "").trim().slice(0, 60);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "A valid email address is required.", code: "INVALID_EMAIL" });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters.", code: "WEAK_PASSWORD" });
      return;
    }

    const exists = await userEmailExists(email);
    if (exists) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in.", code: "EMAIL_TAKEN" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const created = await createUser({ email, passwordHash, displayName: displayName || null });

    setSessionCookie(res, created.id);
    res.status(201).json({ id: created.id, email: created.email, displayName: created.displayName });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (!checkRateLimit(`auth_login:${ip}`, 20, 15 * 60 * 1000)) {
      res.status(429).json({ error: "Too many login attempts. Please try again in 15 minutes.", code: "RATE_LIMITED" });
      return;
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required.", code: "MISSING_FIELDS" });
      return;
    }

    const user = await getUserByEmail(email);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
      return;
    }

    setSessionCookie(res, user.id);
    res.json({ id: user.id, email: user.email, displayName: user.displayName });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

export default router;
